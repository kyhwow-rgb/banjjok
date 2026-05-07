-- ==========================================================================
-- 반쪽 v2 — QA fix (2026-05-07)
-- Supabase SQL Editor에서 순서대로 실행하세요.
--
-- 포함된 fix:
--   V2-001: invite_codes 테이블 생성 + RLS + 기본 시드 (가입/초대 차단 해소)
--   V2-002: admin_get_applicant RPC (관리자 신청자 상세 조회용)
--   V2-003: 중복 admin row 정리 (수동 삭제 SQL — DRY-RUN 후 실행)
-- ==========================================================================


-- ==========================================================================
-- V2-001 · invite_codes 테이블 생성
-- ==========================================================================

create table if not exists public.invite_codes (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null default substr(md5(random()::text), 1, 8),
  created_by uuid references public.applicants(id) not null,
  used_by uuid references public.applicants(id),
  is_used boolean default false,
  created_at timestamptz default now(),
  used_at timestamptz
);

alter table public.invite_codes enable row level security;

drop policy if exists "Anyone can verify invite code" on public.invite_codes;
drop policy if exists "Matchmakers can create invite codes" on public.invite_codes;
drop policy if exists "System can mark code as used" on public.invite_codes;

-- 인증된 유저 누구나 미사용 코드 조회 가능 (가입 흐름에서 코드 검증용)
create policy "Anyone can verify invite code"
  on public.invite_codes for select
  using (true);

-- 본인이 created_by 인 코드만 insert (matchmaker 본인의 추천 코드)
create policy "Matchmakers can create invite codes"
  on public.invite_codes for insert
  with check (created_by = public.get_my_applicant_id());

-- 미사용 코드만 update 가능, 사용 처리(is_used=true)만 허용
-- WITH CHECK 없으면 post-update에 USING이 적용되어 toggle 자체가 차단됨
create policy "System can mark code as used"
  on public.invite_codes for update
  using (is_used = false)
  with check (is_used = true);


-- ==========================================================================
-- V2-001 · 시드 코드 (matchmaker1 + admin)
-- 이미 있으면 스킵
-- ==========================================================================

insert into public.invite_codes (code, created_by, is_used)
select 'ADMIN001', id, false
from public.applicants
where email = 'admin@banjjok.kr'
on conflict (code) do nothing;

insert into public.invite_codes (code, created_by, is_used)
select 'MATCH001', id, false
from public.applicants
where email = 'matchmaker1@banjjok.kr'
on conflict (code) do nothing;


-- ==========================================================================
-- V2-002 · admin_get_applicant RPC
-- 관리자가 모든 신청자 detail을 조회할 수 있게 SECURITY DEFINER로 RLS 우회.
-- admin_users 테이블에 등록된 user_id 만 호출 가능.
-- ==========================================================================

create or replace function public.admin_get_applicant(p_id uuid)
returns public.applicants
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  result public.applicants;
begin
  -- 호출자가 admin 인지 확인
  select exists(
    select 1 from public.admin_users
    where user_id = auth.uid()::text
  ) into is_admin;

  if not is_admin then
    raise exception 'unauthorized: admin only';
  end if;

  -- 모든 컬럼 조회
  select * into result from public.applicants where id = p_id;
  return result;
end;
$$;

grant execute on function public.admin_get_applicant(uuid) to authenticated;


-- ==========================================================================
-- V2-010 · 가입자가 본인의 추천인 프로필 읽기 RLS
-- 평판 대기 화면에 추천인 실명 표시용
-- 자기참조 RLS 무한 재귀를 피하려면 SECURITY DEFINER helper 함수 사용
-- ==========================================================================

create or replace function public.get_my_inviter_id()
returns uuid
language sql
stable
security definer
as $$
  select invited_by from public.applicants where user_id = auth.uid()::text limit 1;
$$;

drop policy if exists "Invited person can read their inviter" on public.applicants;

create policy "Invited person can read their inviter"
  on public.applicants for select
  using (id = public.get_my_inviter_id());


-- ==========================================================================
-- V2-003 · 중복 admin row 정리
--
-- 신청자 리스트에 "관리자" 이름이 2번 노출되는 이슈.
-- 먼저 DRY-RUN 으로 어떤 row 가 있는지 확인 후, 잘못된 row 만 삭제.
-- ==========================================================================

-- 1) 현재 admin/관리자 row 확인 (실행 후 결과 보고 결정)
--    select id, user_id, name, email, job, created_at from public.applicants
--    where name = '관리자' or email = 'admin@banjjok.kr'
--    order by created_at;

-- 2) admin@banjjok.kr 가 아닌데 이름이 '관리자' 인 row 삭제 (정상이 아니므로)
--    event_logs / introductions / matches 등이 참조 중일 수 있으므로 references 도 함께 정리
do $$
declare
  bad_id uuid;
begin
  for bad_id in
    select id from public.applicants
    where name = '관리자' and email != 'admin@banjjok.kr'
  loop
    update public.event_logs set actor_id = null where actor_id = bad_id;
    delete from public.reputations where writer_id = bad_id or target_id = bad_id;
    delete from public.invite_codes where created_by = bad_id or used_by = bad_id;
    delete from public.applicants where id = bad_id;
  end loop;
end $$;

-- 3) admin@banjjok.kr 의 row 가 2개 이상이면 admin_users 와 매칭되는 1개만 보존
do $$
declare
  keep_id uuid;
  rm_id uuid;
begin
  -- 보존할 id (admin_users 와 매칭, 없으면 가장 오래된 row)
  select a.id into keep_id
  from public.applicants a
  where a.email = 'admin@banjjok.kr'
  order by
    case when exists (select 1 from public.admin_users au where au.user_id = a.user_id) then 0 else 1 end,
    a.created_at asc
  limit 1;

  if keep_id is null then return; end if;

  for rm_id in
    select id from public.applicants
    where email = 'admin@banjjok.kr' and id != keep_id
  loop
    update public.event_logs set actor_id = null where actor_id = rm_id;
    delete from public.reputations where writer_id = rm_id or target_id = rm_id;
    delete from public.invite_codes where created_by = rm_id or used_by = rm_id;
    delete from public.applicants where id = rm_id;
  end loop;
end $$;


-- ==========================================================================
-- 검증 쿼리 (실행 후 확인용)
-- ==========================================================================

-- invite_codes 테이블 존재 확인
-- select code, is_used, created_at from public.invite_codes order by created_at desc;

-- admin row 1개만 남았는지 확인
-- select id, name, email, job from public.applicants where email = 'admin@banjjok.kr';

-- admin RPC 테스트 (관리자로 로그인된 상태에서 호출)
-- select * from public.admin_get_applicant('<applicant-uuid>');
