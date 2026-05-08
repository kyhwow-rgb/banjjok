-- ==========================================================================
-- 반쪽 v2 — CSO security audit fix (2026-05-08)
-- 4 CRITICAL + 3 HIGH 보안 이슈 (출시 차단급)
-- ==========================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- [CRIT-1] applicants UPDATE WITH CHECK 누락 — 권한 상승 가능
--
-- 증상: 일반 참가자가 본인 row 의 is_matchmaker=true / status='approved' /
-- invited_by=<admin> 등 권한 컬럼을 임의 변경 가능.
--
-- 라이브 검증: p7@banjjok.kr (윤재훈) 가 직접 PATCH 로 is_matchmaker=true
-- 변경 성공 (status 204).
--
-- Fix: WITH CHECK 에 immutable 컬럼들이 본인 정상 값과 일치해야 함을 강제.
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "Users can update own profile" on public.applicants;

create policy "Users can update own profile"
  on public.applicants for update
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- BEFORE UPDATE trigger 로 immutable 권한 컬럼 보호
-- (WITH CHECK 자기참조는 무한재귀 발생 → trigger 사용)
create or replace function public.applicants_protect_immutable()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.admin_users where user_id = auth.uid()::text) then
    return new; -- admin 우회
  end if;
  if auth.uid() is null then
    return new; -- SECURITY DEFINER context (postgres role) 우회
  end if;
  if old.is_participant is distinct from new.is_participant
     or old.is_matchmaker is distinct from new.is_matchmaker
     or old.status is distinct from new.status
     or old.invited_by is distinct from new.invited_by
     or old.email is distinct from new.email
     or old.user_id is distinct from new.user_id
  then
    raise exception 'Cannot modify immutable column (is_participant/is_matchmaker/status/invited_by/email/user_id)';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_applicants_protect_immutable on public.applicants;
create trigger tg_applicants_protect_immutable
  before update on public.applicants
  for each row execute function public.applicants_protect_immutable();

-- 역할 추가는 SECURITY DEFINER RPC 로
create or replace function public.enable_my_role(p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
begin
  select id into caller_id from public.applicants where user_id = auth.uid()::text;
  if caller_id is null then return false; end if;

  if p_role = 'matchmaker' then
    update public.applicants set is_matchmaker = true where id = caller_id;
    return true;
  elsif p_role = 'participant' then
    update public.applicants set is_participant = true where id = caller_id;
    return true;
  end if;
  return false;
end;
$$;

grant execute on function public.enable_my_role(text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- [CRIT-2] introductions UPDATE WITH CHECK 누락 — 매칭 강제 성사 가능
--
-- 증상: 사용자가 본인 introduction 의 status, 상대 응답을 임의 변경 가능.
-- 예: declined → matched 강제 변경하여 가짜 매칭 생성 시도.
--
-- Fix: 직접 UPDATE 차단. 응답은 respond_to_introduction RPC 로만.
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "Participants can update their response" on public.introductions;

-- UPDATE 정책 자체 제거. 응답은 RPC respond_to_introduction 으로만 가능.
-- (Postgres: 정책이 없으면 default deny — UPDATE 차단됨)

-- ──────────────────────────────────────────────────────────────────────────
-- [CRIT-3] notifications INSERT (anyone can insert) — 피싱/스팸 가능
--
-- 증상: 일반 사용자가 임의 제목/본문으로 다른 사용자에게 알림 발송 가능.
-- 예: "관리자: 비밀번호를 변경해주세요 [악성링크]" 가짜 알림.
--
-- Fix: INSERT 정책 제거. 알림 생성은 create_notification RPC 만 (이미 존재).
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "Anyone can insert notifications" on public.notifications;

-- INSERT 정책 제거. RPC create_notification (SECURITY DEFINER) 만 통과.
-- (실제로 클라이언트는 sb.rpc('create_notification') 만 사용 중)

-- 단, RPC 자체에 보안 강화: 호출자 검증 + 어떤 알림은 누가 받을 수 있는지 제한
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default '',
  p_data jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
begin
  select id into caller_id from public.applicants where user_id = auth.uid()::text;
  if caller_id is null then raise exception 'Not authenticated'; end if;

  -- 관리자는 누구에게든 알림 가능 (공지 등)
  if exists (select 1 from public.admin_users where user_id = auth.uid()::text) then
    insert into public.notifications (user_id, type, title, body, data)
    values (p_user_id, p_type, p_title, p_body, p_data);
    return;
  end if;

  -- 일반 사용자는 다음 관계가 있을 때만 다른 사용자에게 알림 가능:
  -- (1) 본인 (예: 본인에게 시스템 알림)
  -- (2) 매칭된 상대 (채팅 메시지 알림)
  -- (3) introduction 의 상대/주선자 (응답 알림)
  -- (4) 본인의 추천인 (가입 알림) / 본인이 추천한 사람 (평판 작성 알림)
  -- (5) mm_messages 상대 (1:1 채팅 알림)
  if p_user_id = caller_id
     or exists (select 1 from public.matches where (applicant_a_id = caller_id and applicant_b_id = p_user_id) or (applicant_b_id = caller_id and applicant_a_id = p_user_id))
     or exists (select 1 from public.introductions where (person_a_id = caller_id or person_b_id = caller_id or primary_matchmaker_id = caller_id or referred_by_matchmaker_id = caller_id) and (person_a_id = p_user_id or person_b_id = p_user_id or primary_matchmaker_id = p_user_id or referred_by_matchmaker_id = p_user_id))
     or exists (select 1 from public.applicants where (id = caller_id and invited_by = p_user_id) or (id = p_user_id and invited_by = caller_id))
  then
    insert into public.notifications (user_id, type, title, body, data)
    values (p_user_id, p_type, p_title, p_body, p_data);
    return;
  end if;

  raise exception 'No relationship to send notification';
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- [CRIT-4] debug_auth / debug_auth2 SECURITY DEFINER — admin user_id 노출
--
-- 증상: 누구든 debug_auth2() 호출하여 admin@banjjok.kr 의 auth user_id 조회 가능.
-- 출시 전 잔존하면 안 되는 디버깅 헬퍼.
-- ──────────────────────────────────────────────────────────────────────────

drop function if exists public.debug_auth();
drop function if exists public.debug_auth2();

-- ──────────────────────────────────────────────────────────────────────────
-- [HIGH-1] matches UPDATE WITH CHECK 누락
--
-- 매칭 from_introduction_id 등 임의 변경 가능. 상태 변경(active→ended) 정도만 허용.
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "Participants can update own matches" on public.matches;

create policy "Participants can update own matches"
  on public.matches for update
  using (applicant_a_id = public.get_my_applicant_id() or applicant_b_id = public.get_my_applicant_id())
  with check (
    -- 동일한 매칭이어야 함 (id, applicant_a_id, applicant_b_id 변경 불가)
    applicant_a_id = (select applicant_a_id from public.matches where id = matches.id)
    and applicant_b_id = (select applicant_b_id from public.matches where id = matches.id)
    and from_introduction_id is not distinct from (select from_introduction_id from public.matches where id = matches.id)
  );

-- ──────────────────────────────────────────────────────────────────────────
-- [HIGH-2] notifications UPDATE WITH CHECK 누락 — 본인 알림 임의 수정
-- 본인 알림은 is_read 만 변경 가능하게.
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "Users can update own notifications" on public.notifications;

create policy "Users can update own notifications"
  on public.notifications for update
  using (user_id = public.get_my_applicant_id())
  with check (
    user_id = public.get_my_applicant_id()
    and type = (select type from public.notifications where id = notifications.id)
    and title = (select title from public.notifications where id = notifications.id)
    and body is not distinct from (select body from public.notifications where id = notifications.id)
    and data is not distinct from (select data from public.notifications where id = notifications.id)
    -- is_read 만 변경 허용
  );

-- ──────────────────────────────────────────────────────────────────────────
-- [HIGH-3] search_introduction_pool 구버전 (5-arg) 정리
-- 신버전 (7-arg) 만 유지.
-- ──────────────────────────────────────────────────────────────────────────

drop function if exists public.search_introduction_pool(text, integer, integer, text, text);

-- ──────────────────────────────────────────────────────────────────────────
-- 검증 쿼리
-- ──────────────────────────────────────────────────────────────────────────

-- WITH CHECK 누락된 UPDATE/INSERT 정책 확인
-- select polname, polrelid::regclass as table_name from pg_policy
-- where polcmd in ('w','a') and polwithcheck is null
-- and polrelid::regclass::text like 'public.%';

-- debug_auth* 함수 제거 확인
-- select proname from pg_proc where proname in ('debug_auth','debug_auth2');
-- (0 rows expected)
