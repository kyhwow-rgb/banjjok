-- ==========================================================================
-- RLS 무한 재귀 수정
-- applicants 정책이 자기 자신을 참조하면서 발생하는 문제 해결
-- Supabase SQL Editor에서 실행
-- ==========================================================================

-- Step 1: 기존 정책 삭제
drop policy if exists "Users can read own profile" on public.applicants;
drop policy if exists "Matchmakers can read their invited people" on public.applicants;
drop policy if exists "Users can update own profile" on public.applicants;
drop policy if exists "Anyone can insert (signup)" on public.applicants;

-- Step 2: auth.uid()로 applicant id를 가져오는 helper 함수 (SECURITY DEFINER로 RLS 우회)
create or replace function public.get_my_applicant_id()
returns uuid
language sql
stable
security definer
as $$
  select id from public.applicants where user_id = auth.uid()::text limit 1;
$$;

-- Step 3: 새 정책 (자기 참조 없이)
-- 본인 프로필 읽기
create policy "Users can read own profile"
  on public.applicants for select
  using (user_id = auth.uid()::text);

-- 주선자가 자기 초대한 사람 읽기 (invited_by가 내 applicant id인 사람)
create policy "Matchmakers can read their invited people"
  on public.applicants for select
  using (invited_by = public.get_my_applicant_id());

-- 프로필 수정
create policy "Users can update own profile"
  on public.applicants for update
  using (user_id = auth.uid()::text);

-- 가입 (insert)
create policy "Anyone can insert (signup)"
  on public.applicants for insert
  with check (user_id = auth.uid()::text);

-- Step 4: 다른 테이블의 정책도 helper 함수 사용하도록 수정
-- (자기 참조가 없는 테이블들이지만 일관성을 위해)

drop policy if exists "Writer can insert reputation" on public.reputations;
drop policy if exists "Writer or target can read" on public.reputations;

create policy "Writer can insert reputation"
  on public.reputations for insert
  with check (writer_id = public.get_my_applicant_id());

create policy "Writer or target can read"
  on public.reputations for select
  using (
    writer_id = public.get_my_applicant_id()
    or target_id = public.get_my_applicant_id()
  );

-- Introductions
drop policy if exists "Participants can read own introductions" on public.introductions;

create policy "Participants can read own introductions"
  on public.introductions for select
  using (
    person_a_id = public.get_my_applicant_id()
    or person_b_id = public.get_my_applicant_id()
    or primary_matchmaker_id = public.get_my_applicant_id()
    or referred_by_matchmaker_id = public.get_my_applicant_id()
  );

-- Matches
drop policy if exists "Users can read own matches" on public.matches;

create policy "Users can read own matches"
  on public.matches for select
  using (
    applicant_a_id = public.get_my_applicant_id()
    or applicant_b_id = public.get_my_applicant_id()
  );

-- Chat messages
drop policy if exists "Match participants can read/write chat" on public.chat_messages;
drop policy if exists "Match participants can send messages" on public.chat_messages;

create policy "Match participants can read chat"
  on public.chat_messages for select
  using (
    match_id in (
      select id from public.matches
      where applicant_a_id = public.get_my_applicant_id()
         or applicant_b_id = public.get_my_applicant_id()
    )
  );

create policy "Match participants can send messages"
  on public.chat_messages for insert
  with check (
    sender_id = public.get_my_applicant_id()
    and match_id in (
      select id from public.matches
      where status = 'active'
        and (applicant_a_id = public.get_my_applicant_id()
          or applicant_b_id = public.get_my_applicant_id())
    )
  );

-- Notifications
drop policy if exists "Users can read own notifications" on public.notifications;
drop policy if exists "Users can update own notifications" on public.notifications;

create policy "Users can read own notifications"
  on public.notifications for select
  using (user_id = public.get_my_applicant_id());

create policy "Users can update own notifications"
  on public.notifications for update
  using (user_id = public.get_my_applicant_id());

-- Push subscriptions
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;

create policy "Users can read own push subs"
  on public.push_subscriptions for select
  using (user_id = public.get_my_applicant_id());

create policy "Users can insert push subs"
  on public.push_subscriptions for insert
  with check (user_id = public.get_my_applicant_id());

create policy "Users can delete push subs"
  on public.push_subscriptions for delete
  using (user_id = public.get_my_applicant_id());

-- Introduction requests
drop policy if exists "Matchmakers can read relevant requests" on public.introduction_requests;

create policy "Matchmakers can read relevant requests"
  on public.introduction_requests for select
  using (
    requester_matchmaker_id = public.get_my_applicant_id()
    or responder_matchmaker_id = public.get_my_applicant_id()
    or (request_type = 'broadcast' and status = 'open')
  );

-- Introduction request responses
drop policy if exists "Responder can insert" on public.introduction_request_responses;
drop policy if exists "Requester can read accepted responses only" on public.introduction_request_responses;

create policy "Responder can insert"
  on public.introduction_request_responses for insert
  with check (responder_matchmaker_id = public.get_my_applicant_id());

create policy "Requester or responder can read responses"
  on public.introduction_request_responses for select
  using (
    responder_matchmaker_id = public.get_my_applicant_id()
    or request_id in (
      select id from public.introduction_requests
      where requester_matchmaker_id = public.get_my_applicant_id()
    )
  );
