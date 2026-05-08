-- ==========================================================================
-- 반쪽 v2 — Round 5 추가 fix (2026-05-08)
-- 사용자 피드백 8개 항목
-- ==========================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- [#6] admin_list_matches: applicant_a_id, applicant_b_id, photo 추가
-- ──────────────────────────────────────────────────────────────────────────

drop function if exists public.admin_list_matches();

create or replace function public.admin_list_matches()
returns table(
  id uuid, a_id uuid, b_id uuid, a_name text, b_name text,
  a_photo text, b_photo text, status text,
  from_introduction_id uuid, created_at timestamptz
)
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()::text) then
    raise exception 'Not an admin';
  end if;
  return query
  select m.id, a.id as a_id, b.id as b_id, a.name as a_name, b.name as b_name,
         coalesce((a.photos)[1], a.photo_url) as a_photo,
         coalesce((b.photos)[1], b.photo_url) as b_photo,
         m.status, m.from_introduction_id, m.created_at
  from public.matches m
  join public.applicants a on m.applicant_a_id = a.id
  join public.applicants b on m.applicant_b_id = b.id
  order by m.created_at desc;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- [#5] admin_relationship_tree RPC — 관리자가 주선자 ↔ 참가자 관계 조회
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.admin_relationship_tree()
returns table(
  matchmaker_id uuid, mm_name text, mm_email text, mm_photo text,
  invitee_id uuid, invitee_name text, invitee_email text,
  invitee_photo text, invitee_status text, invitee_birth date,
  invitee_job text, invitee_location text, invitee_gender text
)
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()::text) then
    raise exception 'Not an admin';
  end if;
  return query
  select
    mm.id as matchmaker_id, mm.name as mm_name, mm.email as mm_email,
    coalesce((mm.photos)[1], mm.photo_url) as mm_photo,
    p.id as invitee_id, p.name as invitee_name, p.email as invitee_email,
    coalesce((p.photos)[1], p.photo_url) as invitee_photo,
    p.status as invitee_status, p.birth_date as invitee_birth,
    p.job as invitee_job, p.location as invitee_location, p.gender as invitee_gender
  from public.applicants mm
  left join public.applicants p on p.invited_by = mm.id
  where mm.is_matchmaker = true
  order by mm.created_at, p.created_at;
end;
$$;

grant execute on function public.admin_relationship_tree() to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- [#4] mm_messages — 주선자 ↔ 참가자 1:1 채팅
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.mm_messages (
  id uuid primary key default uuid_generate_v4(),
  matchmaker_id uuid references public.applicants(id) not null,
  participant_id uuid references public.applicants(id) not null,
  sender_id uuid references public.applicants(id) not null,
  content text not null,
  created_at timestamptz default now(),
  read_at timestamptz
);

create index if not exists idx_mm_messages_pair_time
  on public.mm_messages (matchmaker_id, participant_id, created_at);

alter table public.mm_messages enable row level security;

drop policy if exists "MM chat: pair members can select" on public.mm_messages;
create policy "MM chat: pair members can select"
  on public.mm_messages for select
  using (
    matchmaker_id = public.get_my_applicant_id()
    or participant_id = public.get_my_applicant_id()
  );

drop policy if exists "MM chat: members can insert" on public.mm_messages;
create policy "MM chat: members can insert"
  on public.mm_messages for insert
  with check (
    sender_id = public.get_my_applicant_id()
    and (
      matchmaker_id = public.get_my_applicant_id()
      or participant_id = public.get_my_applicant_id()
    )
  );

drop policy if exists "MM chat: receiver can mark read" on public.mm_messages;
create policy "MM chat: receiver can mark read"
  on public.mm_messages for update
  using (
    sender_id != public.get_my_applicant_id()
    and (
      matchmaker_id = public.get_my_applicant_id()
      or participant_id = public.get_my_applicant_id()
    )
  )
  with check (true);

-- notifications type 에 'mm_chat_message' 추가
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'reputation_request', 'reputation_written', 'reputation_received',
    'introduction_received', 'match_created', 'message',
    'request_received', 'admin_approved', 'approved', 'announcement',
    'mm_chat_message'
  ]));

-- realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mm_messages'
  ) then
    alter publication supabase_realtime add table public.mm_messages;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- [#7] 얼굴 이미지 (randomuser stock photos)
-- 시드 데이터에 photo_url 채우기 — 이미 적용된 상태이므로 idempotent
-- ──────────────────────────────────────────────────────────────────────────

update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/men/15.jpg') where email='admin@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/women/65.jpg') where email='matchmaker1@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/men/52.jpg') where email='matchmaker2@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/women/72.jpg') where email='matchmaker3@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/men/41.jpg') where email='matchmaker4@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/men/11.jpg') where email='p1@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/women/22.jpg') where email='p2@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/men/33.jpg') where email='p3@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/women/44.jpg') where email='p4@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/men/55.jpg') where email='p5@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/women/66.jpg') where email='p6@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/men/77.jpg') where email='p7@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/women/88.jpg') where email='p8@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/women/12.jpg') where email='p9@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/men/89.jpg') where email='p10@banjjok.kr';
update public.applicants set photo_url=coalesce(photo_url,'https://randomuser.me/api/portraits/men/68.jpg') where email='kyhwow@gmail.com';
