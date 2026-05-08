-- ==========================================================================
-- 반쪽 v2 — Round 7 fix (2026-05-08)
-- Broadcast 요청 응답 수락/거절 → introductions 생성
-- ==========================================================================

-- 요청자가 자기 요청에 들어온 추천 후보/추천 주선자 프로필을 읽을 수 있어야 수락 UI를 그릴 수 있음.
drop policy if exists "Requester can read request response applicants" on public.applicants;
drop policy if exists "Requester can read proposed applicants" on public.applicants;
create policy "Requester can read request response applicants"
  on public.applicants for select
  using (
    id in (
      select unnest(array[irr.proposed_applicant_id, irr.responder_matchmaker_id])
      from public.introduction_request_responses irr
      join public.introduction_requests ir on ir.id = irr.request_id
      where ir.requester_matchmaker_id = public.get_my_applicant_id()
    )
  );

-- 응답자가 요청자에게 "추천 도착" 알림을 보낼 수 있도록 create_notification 관계 허용.
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

  if exists (select 1 from public.admin_users where user_id = auth.uid()::text) then
    insert into public.notifications (user_id, type, title, body, data)
    values (p_user_id, p_type, p_title, p_body, p_data);
    return;
  end if;

  if p_user_id = caller_id
     or exists (select 1 from public.matches where (applicant_a_id = caller_id and applicant_b_id = p_user_id) or (applicant_b_id = caller_id and applicant_a_id = p_user_id))
     or exists (select 1 from public.introductions where (person_a_id = caller_id or person_b_id = caller_id or primary_matchmaker_id = caller_id or referred_by_matchmaker_id = caller_id) and (person_a_id = p_user_id or person_b_id = p_user_id or primary_matchmaker_id = p_user_id or referred_by_matchmaker_id = p_user_id))
     or exists (select 1 from public.applicants where (id = caller_id and invited_by = p_user_id) or (id = p_user_id and invited_by = caller_id))
     or exists (select 1 from public.mm_messages where (matchmaker_id = caller_id and participant_id = p_user_id) or (participant_id = caller_id and matchmaker_id = p_user_id))
     or exists (
       select 1
       from public.introduction_request_responses irr
       join public.introduction_requests ir on ir.id = irr.request_id
       where irr.responder_matchmaker_id = caller_id
         and ir.requester_matchmaker_id = p_user_id
     )
  then
    insert into public.notifications (user_id, type, title, body, data)
    values (p_user_id, p_type, p_title, p_body, p_data);
    return;
  end if;

  raise exception 'No relationship to send notification';
end;
$$;

create or replace function public.resolve_request_response(
  p_response_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  v_response record;
  v_request record;
  v_target record;
  v_proposed record;
  v_intro_id uuid;
begin
  select id into caller_id from public.applicants where user_id = auth.uid()::text;
  if caller_id is null then raise exception 'Not authenticated'; end if;

  select * into v_response
  from public.introduction_request_responses
  where id = p_response_id
  for update;
  if not found then raise exception 'Response not found'; end if;

  select * into v_request
  from public.introduction_requests
  where id = v_response.request_id
  for update;
  if not found then raise exception 'Request not found'; end if;

  if v_request.requester_matchmaker_id != caller_id then
    raise exception 'Only requester can resolve this response';
  end if;
  if v_response.status != 'pending' then
    raise exception 'Response already resolved';
  end if;
  if p_accept and v_request.status != 'open' then
    raise exception 'Request is not open';
  end if;
  if not p_accept and v_request.status not in ('open', 'responded') then
    raise exception 'Request is not open';
  end if;

  if not p_accept then
    update public.introduction_request_responses
    set status = 'requester_declined'
    where id = p_response_id;
    return jsonb_build_object('accepted', false);
  end if;

  select id, gender, status, is_participant into v_target
  from public.applicants
  where id = v_request.target_applicant_id;

  select id, gender, status, is_participant into v_proposed
  from public.applicants
  where id = v_response.proposed_applicant_id;

  if v_target.id is null or v_proposed.id is null then
    raise exception 'Applicant not found';
  end if;
  if v_target.id = v_proposed.id then
    raise exception 'Cannot introduce the same applicant';
  end if;
  if not v_target.is_participant or not v_proposed.is_participant
     or v_target.status != 'approved' or v_proposed.status != 'approved' then
    raise exception 'Only approved participants can be introduced';
  end if;
  if v_target.gender is not null and v_proposed.gender is not null and v_target.gender = v_proposed.gender then
    raise exception 'Cannot introduce same gender applicants';
  end if;

  insert into public.introductions (
    primary_matchmaker_id,
    referred_by_matchmaker_id,
    person_a_id,
    person_b_id,
    note,
    person_a_response,
    person_b_response,
    status
  )
  values (
    caller_id,
    case when v_response.responder_matchmaker_id = caller_id then null else v_response.responder_matchmaker_id end,
    v_request.target_applicant_id,
    v_response.proposed_applicant_id,
    '소개 요청 응답으로 생성됨',
    'pending',
    'pending',
    'pending'
  )
  returning id into v_intro_id;

  update public.introduction_request_responses
  set status = 'requester_accepted'
  where id = p_response_id;

  update public.introduction_request_responses
  set status = 'requester_declined'
  where request_id = v_response.request_id
    and id != p_response_id
    and status = 'pending';

  update public.introduction_requests
  set status = 'responded'
  where id = v_response.request_id;

  insert into public.notifications (user_id, type, title, body, data) values
    (v_request.target_applicant_id, 'introduction_received', '소개가 도착했어요!', '주선자가 요청 추천을 수락했어요.', jsonb_build_object('introduction_id', v_intro_id)),
    (v_response.proposed_applicant_id, 'introduction_received', '소개가 도착했어요!', '주선자가 요청 추천을 수락했어요.', jsonb_build_object('introduction_id', v_intro_id)),
    (v_response.responder_matchmaker_id, 'request_received', '추천이 수락되었어요', '요청자가 추천을 수락해 소개가 생성되었습니다.', jsonb_build_object('request_id', v_response.request_id, 'introduction_id', v_intro_id));

  return jsonb_build_object('accepted', true, 'introduction_id', v_intro_id);
end;
$$;

grant execute on function public.resolve_request_response(uuid, boolean) to authenticated;

-- 검증:
-- select public.resolve_request_response('<response-id>', true);
