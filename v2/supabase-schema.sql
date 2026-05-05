-- ==========================================================================
-- 반쪽 v2 — Database Schema
-- Supabase SQL Editor에서 실행
-- ==========================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ==========================================================================
-- applicants (사용자)
-- ==========================================================================
create table public.applicants (
  id uuid primary key default uuid_generate_v4(),
  user_id text unique not null,
  name text not null,
  email text,
  phone text,
  birth_date date,
  gender text check (gender in ('male', 'female')),
  height integer,
  job text,
  location text,
  mbti text,
  religion text,
  bio text,
  photo_url text,

  -- Preferences
  preferred_age_min integer,
  preferred_age_max integer,
  preferred_height_min integer,
  preferred_height_max integer,
  preferred_job text[], -- array of acceptable jobs
  preferred_location text,
  preferred_religion text,

  -- Roles (1인 2역)
  is_participant boolean default true,
  is_matchmaker boolean default false,

  -- Status
  status text default 'pending_reputation' check (status in ('pending_reputation', 'pending', 'approved', 'rejected', 'suspended')),
  invited_by uuid references public.applicants(id),
  invite_code text unique default substr(md5(random()::text), 1, 8),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ==========================================================================
-- reputations (평판)
-- ==========================================================================
create table public.reputations (
  id uuid primary key default uuid_generate_v4(),
  writer_id uuid references public.applicants(id) not null,
  target_id uuid references public.applicants(id) not null,
  relationship text not null, -- 어떤 관계인지 (친구, 직장동료, 학교 선후배 등)
  personality text,
  strengths text,
  dating_style text,
  overall text,
  score integer check (score >= 1 and score <= 5),
  created_at timestamptz default now(),

  unique(writer_id, target_id)
);

-- ==========================================================================
-- introductions (소개)
-- ==========================================================================
create table public.introductions (
  id uuid primary key default uuid_generate_v4(),
  primary_matchmaker_id uuid references public.applicants(id) not null,
  referred_by_matchmaker_id uuid references public.applicants(id),
  person_a_id uuid references public.applicants(id) not null,
  person_b_id uuid references public.applicants(id) not null,
  note text, -- 주선자 메모

  -- Responses
  person_a_response text check (person_a_response in ('pending', 'yes', 'no')),
  person_b_response text check (person_b_response in ('pending', 'yes', 'no')),

  status text default 'pending' check (status in ('pending', 'matched', 'declined', 'expired')),

  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days'),

  -- Self-dealing prevention
  check (person_a_id != person_b_id),
  check (person_a_id != primary_matchmaker_id),
  check (person_b_id != primary_matchmaker_id)
);

-- ==========================================================================
-- introduction_requests (주선자 → 주선자 요청)
-- ==========================================================================
create table public.introduction_requests (
  id uuid primary key default uuid_generate_v4(),
  requester_matchmaker_id uuid references public.applicants(id) not null,
  target_applicant_id uuid references public.applicants(id) not null, -- 요청자의 사람 (X)
  request_type text not null check (request_type in ('broadcast', 'direct')),
  responder_matchmaker_id uuid references public.applicants(id), -- direct인 경우
  criteria jsonb, -- 조건 (나이, 지역, 직업 등)
  status text default 'open' check (status in ('open', 'responded', 'closed', 'expired')),

  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days')
);

create index idx_intro_requests_status on public.introduction_requests(status, expires_at);

-- ==========================================================================
-- introduction_request_responses (요청 응답)
-- ==========================================================================
create table public.introduction_request_responses (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid references public.introduction_requests(id) not null,
  responder_matchmaker_id uuid references public.applicants(id) not null,
  proposed_applicant_id uuid references public.applicants(id) not null,
  status text default 'pending' check (status in ('pending', 'requester_accepted', 'requester_declined')),
  created_at timestamptz default now()
);

-- Response cap: max 3 per request
create or replace function check_response_cap()
returns trigger as $$
begin
  if (select count(*) from public.introduction_request_responses where request_id = NEW.request_id) >= 3 then
    raise exception 'Maximum 3 responses per request';
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_response_cap
  before insert on public.introduction_request_responses
  for each row execute function check_response_cap();

-- ==========================================================================
-- matches (다대다 매칭)
-- ==========================================================================
create table public.matches (
  id uuid primary key default uuid_generate_v4(),
  applicant_a_id uuid references public.applicants(id) not null,
  applicant_b_id uuid references public.applicants(id) not null,
  from_introduction_id uuid references public.introductions(id),
  status text default 'active' check (status in ('active', 'ended')),
  ended_by uuid references public.applicants(id),

  created_at timestamptz default now(),
  ended_at timestamptz,

  check (applicant_a_id != applicant_b_id)
);

-- Concurrent match limit: max 3 active per person
create or replace function check_match_limit()
returns trigger as $$
declare
  count_a integer;
  count_b integer;
begin
  select count(*) into count_a from public.matches
    where (applicant_a_id = NEW.applicant_a_id or applicant_b_id = NEW.applicant_a_id)
    and status = 'active';
  select count(*) into count_b from public.matches
    where (applicant_a_id = NEW.applicant_b_id or applicant_b_id = NEW.applicant_b_id)
    and status = 'active';

  if count_a >= 3 then
    raise exception 'Person A has reached maximum active matches (3)';
  end if;
  if count_b >= 3 then
    raise exception 'Person B has reached maximum active matches (3)';
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_match_limit
  before insert on public.matches
  for each row execute function check_match_limit();

-- ==========================================================================
-- chat_messages
-- ==========================================================================
create table public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid references public.matches(id) not null,
  sender_id uuid references public.applicants(id) not null,
  content text not null,
  created_at timestamptz default now()
);

create index idx_chat_match on public.chat_messages(match_id, created_at);

-- ==========================================================================
-- notifications
-- ==========================================================================
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.applicants(id) not null,
  type text not null check (type in ('reputation_request', 'reputation_written', 'introduction_received', 'match_created', 'message', 'request_received', 'admin_approved')),
  title text not null,
  body text,
  data jsonb,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index idx_notif_user on public.notifications(user_id, is_read, created_at desc);

-- ==========================================================================
-- push_subscriptions
-- ==========================================================================
create table public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.applicants(id) not null,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz default now()
);

-- ==========================================================================
-- admin_users
-- ==========================================================================
create table public.admin_users (
  id uuid primary key default uuid_generate_v4(),
  user_id text unique not null,
  created_at timestamptz default now()
);

-- ==========================================================================
-- reports & blocks
-- ==========================================================================
create table public.reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid references public.applicants(id) not null,
  target_id uuid references public.applicants(id) not null,
  reason text not null,
  status text default 'pending' check (status in ('pending', 'reviewed', 'resolved')),
  created_at timestamptz default now()
);

create table public.blocks (
  id uuid primary key default uuid_generate_v4(),
  blocker_id uuid references public.applicants(id) not null,
  blocked_id uuid references public.applicants(id) not null,
  created_at timestamptz default now(),
  unique(blocker_id, blocked_id)
);

-- ==========================================================================
-- event_logs (감사 추적)
-- ==========================================================================
create table public.event_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.applicants(id),
  event_type text not null,
  detail jsonb,
  created_at timestamptz default now()
);

-- ==========================================================================
-- RLS Policies
-- ==========================================================================

alter table public.applicants enable row level security;
alter table public.reputations enable row level security;
alter table public.introductions enable row level security;
alter table public.introduction_requests enable row level security;
alter table public.introduction_request_responses enable row level security;
alter table public.matches enable row level security;
alter table public.chat_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.admin_users enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.event_logs enable row level security;

-- Applicants: users can read own profile, matchmakers can read their 1촌 pool
create policy "Users can read own profile"
  on public.applicants for select
  using (auth.uid()::text = user_id);

create policy "Matchmakers can read their invited people"
  on public.applicants for select
  using (
    id in (
      select a.id from public.applicants a
      where a.invited_by = (
        select id from public.applicants where user_id = auth.uid()::text
      )
    )
  );

create policy "Users can update own profile"
  on public.applicants for update
  using (auth.uid()::text = user_id);

create policy "Anyone can insert (signup)"
  on public.applicants for insert
  with check (auth.uid()::text = user_id);

-- Reputations: writer can insert/read, target can read
create policy "Writer can insert reputation"
  on public.reputations for insert
  with check (writer_id = (select id from public.applicants where user_id = auth.uid()::text));

create policy "Writer or target can read"
  on public.reputations for select
  using (
    writer_id = (select id from public.applicants where user_id = auth.uid()::text)
    or target_id = (select id from public.applicants where user_id = auth.uid()::text)
  );

-- Introductions: participants can read their own
create policy "Participants can read own introductions"
  on public.introductions for select
  using (
    person_a_id = (select id from public.applicants where user_id = auth.uid()::text)
    or person_b_id = (select id from public.applicants where user_id = auth.uid()::text)
    or primary_matchmaker_id = (select id from public.applicants where user_id = auth.uid()::text)
    or referred_by_matchmaker_id = (select id from public.applicants where user_id = auth.uid()::text)
  );

-- Matches: participants can read their own
create policy "Users can read own matches"
  on public.matches for select
  using (
    applicant_a_id = (select id from public.applicants where user_id = auth.uid()::text)
    or applicant_b_id = (select id from public.applicants where user_id = auth.uid()::text)
  );

-- Chat: match participants only
create policy "Match participants can read/write chat"
  on public.chat_messages for select
  using (
    match_id in (
      select id from public.matches
      where applicant_a_id = (select id from public.applicants where user_id = auth.uid()::text)
         or applicant_b_id = (select id from public.applicants where user_id = auth.uid()::text)
    )
  );

create policy "Match participants can send messages"
  on public.chat_messages for insert
  with check (
    sender_id = (select id from public.applicants where user_id = auth.uid()::text)
    and match_id in (
      select id from public.matches
      where status = 'active'
        and (applicant_a_id = (select id from public.applicants where user_id = auth.uid()::text)
          or applicant_b_id = (select id from public.applicants where user_id = auth.uid()::text))
    )
  );

-- Notifications: own only
create policy "Users can read own notifications"
  on public.notifications for select
  using (user_id = (select id from public.applicants where user_id = auth.uid()::text));

create policy "Users can update own notifications"
  on public.notifications for update
  using (user_id = (select id from public.applicants where user_id = auth.uid()::text));

-- Push subscriptions: own only
create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all
  using (user_id = (select id from public.applicants where user_id = auth.uid()::text));

-- Introduction requests: requester or responder
create policy "Matchmakers can read relevant requests"
  on public.introduction_requests for select
  using (
    requester_matchmaker_id = (select id from public.applicants where user_id = auth.uid()::text)
    or responder_matchmaker_id = (select id from public.applicants where user_id = auth.uid()::text)
    or (request_type = 'broadcast' and status = 'open')
  );

-- Introduction request responses: gated on acceptance
create policy "Responder can insert"
  on public.introduction_request_responses for insert
  with check (
    responder_matchmaker_id = (select id from public.applicants where user_id = auth.uid()::text)
  );

create policy "Requester can read accepted responses only"
  on public.introduction_request_responses for select
  using (
    responder_matchmaker_id = (select id from public.applicants where user_id = auth.uid()::text)
    or (
      status = 'requester_accepted'
      and request_id in (
        select id from public.introduction_requests
        where requester_matchmaker_id = (select id from public.applicants where user_id = auth.uid()::text)
      )
    )
    or (
      status = 'pending'
      and request_id in (
        select id from public.introduction_requests
        where requester_matchmaker_id = (select id from public.applicants where user_id = auth.uid()::text)
      )
    )
  );

-- Admin: full access via service role (no anon RLS needed)
create policy "Admins can read admin_users"
  on public.admin_users for select
  using (auth.uid()::text in (select user_id from public.admin_users));

-- ==========================================================================
-- Enable Realtime
-- ==========================================================================
alter publication supabase_realtime add table public.introductions;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.introduction_requests;
alter publication supabase_realtime add table public.notifications;
