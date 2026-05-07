-- ==========================================================================
-- 반쪽 v2 — Codex review fix (2026-05-07)
-- 9 findings (Critical 1, High 3, Medium 4, Low 1)
-- ==========================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- [#1 Critical] approve_after_reputation: 평판 row 존재 검증 + 원자 UPDATE
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.approve_after_reputation(p_target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  affected int;
begin
  select id into caller_id from public.applicants where user_id = auth.uid()::text;
  if caller_id is null then return false; end if;

  -- 평판 row 가 실제로 작성됐는지 검증 (RPC 직접 호출로 우회 방지)
  if not exists (
    select 1 from public.reputations
    where writer_id = caller_id and target_id = p_target_id
  ) then
    return false;
  end if;

  -- 단일 원자 UPDATE — race condition 방지
  update public.applicants
  set status = 'approved'
  where id = p_target_id
    and status = 'pending_reputation'
    and invited_by = caller_id;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- [#2 High] invite_codes UPDATE 정책 제거 + consume_invite_code RPC
-- 누구나 미사용 코드를 used 로 마킹할 수 있던 보안 구멍 차단
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "System can mark code as used" on public.invite_codes;
-- (UPDATE 자체를 일반 클라이언트에 차단. 코드 소비는 RPC 만 가능)

create or replace function public.consume_invite_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_app_id uuid;
  affected int;
begin
  select id into caller_app_id from public.applicants where user_id = auth.uid()::text;
  if caller_app_id is null then return false; end if;

  update public.invite_codes
  set is_used = true, used_by = caller_app_id, used_at = now()
  where code = p_code and is_used = false;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

grant execute on function public.consume_invite_code(text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- [#6 Medium] verify_invite_code RPC + SELECT 정책 제한
-- 모든 invite_codes row 노출되던 정책 제거. 코드 본인은 자기가 만든 코드만 SELECT 가능.
-- 가입 검증은 RPC verify_invite_code 로 (필요 컬럼만 반환).
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "Anyone can verify invite code" on public.invite_codes;

create policy "Creator can read own invite codes"
  on public.invite_codes for select
  using (created_by = public.get_my_applicant_id());

create or replace function public.verify_invite_code(p_code text)
returns table(code text, created_by uuid)
language sql
stable
security definer
set search_path = public
as $$
  select code, created_by from public.invite_codes
  where code = p_code and is_used = false;
$$;

grant execute on function public.verify_invite_code(text) to anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- [#7 Medium] Matchmakers can create invite codes — is_matchmaker 검증
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "Matchmakers can create invite codes" on public.invite_codes;

create policy "Matchmakers can create invite codes"
  on public.invite_codes for insert
  with check (
    created_by = public.get_my_applicant_id()
    and exists (
      select 1 from public.applicants
      where user_id = auth.uid()::text and is_matchmaker = true
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- [#3 High] respond_to_introduction race fix
--   - SELECT FOR UPDATE 로 introduction row 잠금
--   - status='pending' 조건부 UPDATE → 1번만 transition
--   - matches(from_introduction_id) UNIQUE 제약 추가
-- ──────────────────────────────────────────────────────────────────────────

-- 기존 데이터에 중복이 있으면 제약 추가 실패하므로 먼저 정리
do $$
declare
  bad_id uuid;
begin
  for bad_id in
    select id from public.matches m1
    where exists (
      select 1 from public.matches m2
      where m2.from_introduction_id = m1.from_introduction_id and m2.id < m1.id
    )
  loop
    delete from public.matches where id = bad_id;
  end loop;
end $$;

alter table public.matches drop constraint if exists matches_from_introduction_id_unique;
alter table public.matches add constraint matches_from_introduction_id_unique
  unique (from_introduction_id);

create or replace function public.respond_to_introduction(
  p_introduction_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intro record;
  v_my_id uuid;
  v_match_id uuid;
  v_partner_id uuid;
  v_status_changed boolean := false;
begin
  v_my_id := public.get_my_applicant_id();
  if v_my_id is null then raise exception 'Not authenticated'; end if;

  -- introduction row 잠금 (concurrent yes 응답 직렬화)
  select * into v_intro from public.introductions
  where id = p_introduction_id
  for update;
  if not found then raise exception 'Introduction not found'; end if;
  if v_intro.status != 'pending' then raise exception 'Introduction is no longer pending'; end if;

  -- 본인 응답 update
  if v_intro.person_a_id = v_my_id then
    update public.introductions set person_a_response = p_response where id = p_introduction_id;
    v_partner_id := v_intro.person_b_id;
  elsif v_intro.person_b_id = v_my_id then
    update public.introductions set person_b_response = p_response where id = p_introduction_id;
    v_partner_id := v_intro.person_a_id;
  else
    raise exception 'Not a participant of this introduction';
  end if;

  -- 응답 반영된 row 다시 읽기 (잠금 유지 중)
  select * into v_intro from public.introductions where id = p_introduction_id;

  -- 매칭 성사
  if v_intro.person_a_response = 'yes' and v_intro.person_b_response = 'yes' then
    -- status가 여전히 pending 일 때만 transition (RETURNING 으로 race 차단)
    update public.introductions set status = 'matched'
    where id = p_introduction_id and status = 'pending';

    if found then
      v_status_changed := true;
      insert into public.matches (applicant_a_id, applicant_b_id, from_introduction_id)
      values (v_intro.person_a_id, v_intro.person_b_id, p_introduction_id)
      returning id into v_match_id;

      insert into public.notifications (user_id, type, title, body, data) values
        (v_intro.person_a_id, 'match_created', '매칭이 성사되었어요!', '새로운 대화를 시작해보세요.', jsonb_build_object('match_id', v_match_id)),
        (v_intro.person_b_id, 'match_created', '매칭이 성사되었어요!', '새로운 대화를 시작해보세요.', jsonb_build_object('match_id', v_match_id));

      return jsonb_build_object('matched', true, 'match_id', v_match_id);
    end if;
    -- 이미 다른 트랜잭션에서 처리됨 — fall through
  elsif v_intro.person_a_response = 'no' or v_intro.person_b_response = 'no' then
    update public.introductions set status = 'declined'
    where id = p_introduction_id and status = 'pending';
    return jsonb_build_object('matched', false, 'declined', true);
  end if;

  -- 대기 중 — 상대 알림
  insert into public.notifications (user_id, type, title, body, data)
  values (v_partner_id, 'introduction_received', '소개 응답이 도착했어요', '상대방이 소개에 응답했어요.', jsonb_build_object('introduction_id', p_introduction_id));

  return jsonb_build_object('matched', false, 'waiting', true);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- [#8 Medium] signup_with_invite RPC — 가입 TOCTOU 차단
-- auth.signUp() 후 호출. 코드 검증 + applicant 생성 + 코드 소비를 한 트랜잭션에서.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.signup_with_invite(
  p_invite_code text,
  p_name text,
  p_email text,
  p_is_participant boolean,
  p_is_matchmaker boolean,
  p_is_supercode boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text;
  v_inviter_id uuid;
  v_invite_id uuid;
  v_new_id uuid;
begin
  v_uid := auth.uid()::text;
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- 이미 applicant row 있는지 확인
  if exists (select 1 from public.applicants where user_id = v_uid) then
    raise exception 'Applicant already exists for this user';
  end if;

  if not p_is_supercode then
    -- invite code 잠금 + 검증
    select id, created_by into v_invite_id, v_inviter_id
    from public.invite_codes
    where code = p_invite_code and is_used = false
    for update;

    if v_invite_id is null then
      raise exception 'Invalid or already used invite code';
    end if;
  end if;

  -- applicant 생성
  insert into public.applicants (user_id, name, email, invited_by, status, is_participant, is_matchmaker)
  values (
    v_uid,
    p_name,
    p_email,
    v_inviter_id,
    case when p_is_supercode then 'approved' else 'pending_reputation' end,
    p_is_participant,
    p_is_matchmaker
  )
  returning id into v_new_id;

  -- invite code 소비 (같은 트랜잭션)
  if v_invite_id is not null then
    update public.invite_codes
    set is_used = true, used_by = v_new_id, used_at = now()
    where id = v_invite_id;
  end if;

  return v_new_id;
end;
$$;

grant execute on function public.signup_with_invite(text, text, text, boolean, boolean, boolean) to authenticated;
