-- ==========================================================================
-- 반쪽 v2 — Seed Data (초기 데이터)
-- 먼저 Supabase Auth에서 아래 두 계정을 수동 생성한 후 실행:
--   1. admin@banjjok.kr (비밀번호: test1234)
--   2. matchmaker1@banjjok.kr (비밀번호: test1234)
--
-- Auth에서 생성 후 user_id (UUID)를 아래에 입력하세요.
-- 또는 아래 SQL을 그대로 실행하면 placeholder ID로 들어갑니다.
-- ==========================================================================

-- Step 1: 관리자 겸 주선자 (첫 번째 유저 — 초대 코드 없이 직접 등록)
insert into public.applicants (user_id, name, email, phone, gender, birth_date, height, job, location, mbti, is_participant, is_matchmaker, status, invite_code)
values (
  'ADMIN_USER_ID_HERE',
  '관리자',
  'admin@banjjok.kr',
  '010-0000-0000',
  'male',
  '1995-01-01',
  175,
  '개발자',
  '서울',
  'INTJ',
  true,
  true,
  'approved',
  'ADMIN001'
);

-- Step 2: admin_users 등록
insert into public.admin_users (user_id)
values ('ADMIN_USER_ID_HERE');

-- Step 3: 두 번째 주선자
insert into public.applicants (user_id, name, email, phone, gender, birth_date, height, job, location, mbti, is_participant, is_matchmaker, status, invite_code, invited_by)
values (
  'MATCHMAKER1_USER_ID_HERE',
  '김주선',
  'matchmaker1@banjjok.kr',
  '010-1111-1111',
  'female',
  '1996-03-15',
  163,
  '디자이너',
  '서울',
  'ENFP',
  true,
  true,
  'approved',
  'MATCH001',
  (select id from public.applicants where invite_code = 'ADMIN001')
);
