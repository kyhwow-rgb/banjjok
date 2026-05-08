-- ==========================================================================
-- 반쪽 v2 — User feedback fix (2026-05-08)
-- 8 items
-- ==========================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- [#1] 참가자가 소개/매칭 상대 프로필 + 채팅 상대 정보 읽기 RLS
-- ──────────────────────────────────────────────────────────────────────────

-- introduction 의 상대 참가자 읽기
drop policy if exists "Introduction partners can read each other" on public.applicants;

create policy "Introduction partners can read each other"
  on public.applicants for select
  using (
    id in (
      select case
        when person_a_id = public.get_my_applicant_id() then person_b_id
        when person_b_id = public.get_my_applicant_id() then person_a_id
      end
      from public.introductions
      where person_a_id = public.get_my_applicant_id()
         or person_b_id = public.get_my_applicant_id()
    )
  );

-- match 상대 (채팅) 읽기
drop policy if exists "Match partners can read each other" on public.applicants;

create policy "Match partners can read each other"
  on public.applicants for select
  using (
    id in (
      select case
        when applicant_a_id = public.get_my_applicant_id() then applicant_b_id
        when applicant_b_id = public.get_my_applicant_id() then applicant_a_id
      end
      from public.matches
      where applicant_a_id = public.get_my_applicant_id()
         or applicant_b_id = public.get_my_applicant_id()
    )
  );

-- 주선자가 자신이 진행한 introduction 의 양쪽 참가자 읽기 (cross-network 포함)
drop policy if exists "Matchmaker can read own introduction participants" on public.applicants;

create policy "Matchmaker can read own introduction participants"
  on public.applicants for select
  using (
    id in (
      select unnest(array[person_a_id, person_b_id])
      from public.introductions
      where primary_matchmaker_id = public.get_my_applicant_id()
         or referred_by_matchmaker_id = public.get_my_applicant_id()
    )
  );

-- 매치메이커가 broadcast 요청의 requester/target 읽기 — 요청함 표시용
-- SECURITY DEFINER helper 로 자기참조 RLS 무한재귀 우회
create or replace function public.am_i_matchmaker()
returns boolean
language sql
stable
security definer
as $$
  select coalesce((select is_matchmaker from public.applicants where user_id = auth.uid()::text limit 1), false);
$$;

drop policy if exists "Matchmaker can read broadcast request participants" on public.applicants;

create policy "Matchmaker can read broadcast request participants"
  on public.applicants for select
  using (
    public.am_i_matchmaker()
    and (
      id in (
        select target_applicant_id from public.introduction_requests
        where status = 'open' and request_type = 'broadcast'
      )
      or id in (
        select requester_matchmaker_id from public.introduction_requests
        where status = 'open' and request_type = 'broadcast'
      )
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- [#7] introduction_requests 시드 — 김주선이 최지훈을 broadcast 로 요청
-- 이주선 / 박주선 의 요청함에 표시되도록
-- ──────────────────────────────────────────────────────────────────────────

insert into public.introduction_requests (
  requester_matchmaker_id, target_applicant_id, request_type, criteria, status
)
select
  (select id from public.applicants where email = 'matchmaker1@banjjok.kr'),
  (select id from public.applicants where email = 'p3@banjjok.kr'),
  'broadcast',
  jsonb_build_object('age_min', 27, 'age_max', 32, 'location', '서울'),
  'open'
where not exists (
  select 1 from public.introduction_requests
  where requester_matchmaker_id = (select id from public.applicants where email = 'matchmaker1@banjjok.kr')
    and target_applicant_id = (select id from public.applicants where email = 'p3@banjjok.kr')
);

-- 박주선이 한소영을 broadcast 로 요청 (또 다른 시나리오)
insert into public.introduction_requests (
  requester_matchmaker_id, target_applicant_id, request_type, criteria, status
)
select
  (select id from public.applicants where email = 'matchmaker2@banjjok.kr'),
  (select id from public.applicants where email = 'p6@banjjok.kr'),
  'broadcast',
  jsonb_build_object('age_min', 28, 'age_max', 33),
  'open'
where not exists (
  select 1 from public.introduction_requests
  where requester_matchmaker_id = (select id from public.applicants where email = 'matchmaker2@banjjok.kr')
    and target_applicant_id = (select id from public.applicants where email = 'p6@banjjok.kr')
);

-- ──────────────────────────────────────────────────────────────────────────
-- [#8] search_introduction_pool: 키 필터 추가, 자동 이성 매칭
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.search_introduction_pool(
  p_gender text default null,
  p_min_age int default null,
  p_max_age int default null,
  p_location text default null,
  p_job text default null,
  p_min_height int default null,
  p_max_height int default null
)
returns table(
  id uuid, name text, gender text, birth_date date, height integer,
  job text, location text, mbti text, bio text, photo_url text, photos text[],
  religion text, smoking text, drinking text, education text, hobby text
)
language plpgsql
security definer
as $$
declare
  v_my_id uuid := public.get_my_applicant_id();
  v_today date := current_date;
begin
  return query
  select a.id, a.name, a.gender, a.birth_date, a.height,
         a.job, a.location, a.mbti, a.bio, a.photo_url, a.photos,
         a.religion, a.smoking, a.drinking, a.education, a.hobby
  from public.applicants a
  where a.status = 'approved'
    and a.is_participant = true
    and a.id != v_my_id
    and (p_gender is null or a.gender = p_gender)
    and (p_location is null or a.location = p_location)
    and (p_job is null or a.job = p_job)
    and (p_min_age is null or (a.birth_date is not null and extract(year from age(v_today, a.birth_date)) >= p_min_age))
    and (p_max_age is null or (a.birth_date is not null and extract(year from age(v_today, a.birth_date)) <= p_max_age))
    and (p_min_height is null or (a.height is not null and a.height >= p_min_height))
    and (p_max_height is null or (a.height is not null and a.height <= p_max_height))
    and a.id not in (select blocked_id from public.blocks where blocker_id = v_my_id)
  order by a.created_at desc
  limit 50;
end;
$$;
