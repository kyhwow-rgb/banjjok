-- ==========================================================================
-- 반쪽 v2 — Migration: 추가 컬럼 + RLS + RPC
-- supabase-schema.sql + supabase-rls-fix.sql 실행 후에 실행
-- ==========================================================================

-- ═══════════════════════════════════════════════════════════
-- 1. 스키마 추가
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS smoking text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS drinking text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS education text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS hobby text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS ideal_type jsonb;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS photos text[];  -- 멀티 사진 (최대 3장)
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- ═══════════════════════════════════════════════════════════
-- 2. 추가 RLS 정책
-- ═══════════════════════════════════════════════════════════

-- Introductions: 주선자가 소개 생성
CREATE POLICY "Matchmakers can create introductions"
  ON public.introductions FOR INSERT
  WITH CHECK (primary_matchmaker_id = public.get_my_applicant_id());

-- Introductions: 참가자가 응답 업데이트
CREATE POLICY "Participants can update their response"
  ON public.introductions FOR UPDATE
  USING (
    person_a_id = public.get_my_applicant_id()
    OR person_b_id = public.get_my_applicant_id()
    OR primary_matchmaker_id = public.get_my_applicant_id()
  );

-- Introduction requests: 주선자가 요청 생성
CREATE POLICY "Matchmakers can create requests"
  ON public.introduction_requests FOR INSERT
  WITH CHECK (requester_matchmaker_id = public.get_my_applicant_id());

-- Introduction request responses: 요청자가 상태 업데이트
CREATE POLICY "Requester can update response status"
  ON public.introduction_request_responses FOR UPDATE
  USING (
    responder_matchmaker_id = public.get_my_applicant_id()
    OR request_id IN (
      SELECT id FROM public.introduction_requests
      WHERE requester_matchmaker_id = public.get_my_applicant_id()
    )
  );

-- Matches: 참가자가 종료 가능
CREATE POLICY "Participants can update own matches"
  ON public.matches FOR UPDATE
  USING (
    applicant_a_id = public.get_my_applicant_id()
    OR applicant_b_id = public.get_my_applicant_id()
  );

-- Matches: 시스템이 매칭 생성 (RPC를 통해)
-- → respond_to_introduction RPC가 SECURITY DEFINER로 처리

-- Reports
CREATE POLICY "Users can insert reports"
  ON public.reports FOR INSERT
  WITH CHECK (reporter_id = public.get_my_applicant_id());

CREATE POLICY "Users can read own reports"
  ON public.reports FOR SELECT
  USING (reporter_id = public.get_my_applicant_id());

-- Blocks
CREATE POLICY "Users can insert blocks"
  ON public.blocks FOR INSERT
  WITH CHECK (blocker_id = public.get_my_applicant_id());

CREATE POLICY "Users can read own blocks"
  ON public.blocks FOR SELECT
  USING (blocker_id = public.get_my_applicant_id());

CREATE POLICY "Users can delete own blocks"
  ON public.blocks FOR DELETE
  USING (blocker_id = public.get_my_applicant_id());

-- Event logs
CREATE POLICY "Users can insert events"
  ON public.event_logs FOR INSERT
  WITH CHECK (actor_id = public.get_my_applicant_id() OR actor_id IS NULL);

-- Notifications: 누구나 INSERT 가능 (RPC로도 사용)
CREATE POLICY "Anyone can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- 3. RPC: respond_to_introduction
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.respond_to_introduction(
  p_introduction_id uuid,
  p_response text  -- 'yes' or 'no'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_intro record;
  v_my_id uuid;
  v_match_id uuid;
  v_partner_id uuid;
BEGIN
  v_my_id := public.get_my_applicant_id();
  IF v_my_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_intro FROM public.introductions WHERE id = p_introduction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Introduction not found'; END IF;
  IF v_intro.status != 'pending' THEN RAISE EXCEPTION 'Introduction is no longer pending'; END IF;

  -- Update the right field
  IF v_intro.person_a_id = v_my_id THEN
    UPDATE public.introductions SET person_a_response = p_response WHERE id = p_introduction_id;
    v_partner_id := v_intro.person_b_id;
  ELSIF v_intro.person_b_id = v_my_id THEN
    UPDATE public.introductions SET person_b_response = p_response WHERE id = p_introduction_id;
    v_partner_id := v_intro.person_a_id;
  ELSE
    RAISE EXCEPTION 'Not a participant of this introduction';
  END IF;

  -- Refetch
  SELECT * INTO v_intro FROM public.introductions WHERE id = p_introduction_id;

  -- Check for match
  IF v_intro.person_a_response = 'yes' AND v_intro.person_b_response = 'yes' THEN
    UPDATE public.introductions SET status = 'matched' WHERE id = p_introduction_id;
    INSERT INTO public.matches (applicant_a_id, applicant_b_id, from_introduction_id)
    VALUES (v_intro.person_a_id, v_intro.person_b_id, p_introduction_id)
    RETURNING id INTO v_match_id;

    -- 양쪽 알림
    INSERT INTO public.notifications (user_id, type, title, body, data) VALUES
      (v_intro.person_a_id, 'match_created', '매칭이 성사되었어요!', '새로운 대화를 시작해보세요.', jsonb_build_object('match_id', v_match_id)),
      (v_intro.person_b_id, 'match_created', '매칭이 성사되었어요!', '새로운 대화를 시작해보세요.', jsonb_build_object('match_id', v_match_id));

    RETURN jsonb_build_object('matched', true, 'match_id', v_match_id);
  ELSIF v_intro.person_a_response = 'no' OR v_intro.person_b_response = 'no' THEN
    UPDATE public.introductions SET status = 'declined' WHERE id = p_introduction_id;
    RETURN jsonb_build_object('matched', false, 'declined', true);
  END IF;

  -- 상대에게 알림
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (v_partner_id, 'introduction_received', '소개 응답이 도착했어요', '상대방이 소개에 응답했어요.', jsonb_build_object('introduction_id', p_introduction_id));

  RETURN jsonb_build_object('matched', false, 'waiting', true);
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 4. RPC: search_introduction_pool
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.search_introduction_pool(
  p_gender text DEFAULT NULL,
  p_min_age int DEFAULT NULL,
  p_max_age int DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_job text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, name text, gender text, birth_date date, height integer,
  job text, location text, mbti text, bio text, photo_url text, photos text[],
  religion text, smoking text, drinking text, education text, hobby text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_my_id uuid := public.get_my_applicant_id();
  v_today date := current_date;
BEGIN
  RETURN QUERY
  SELECT a.id, a.name, a.gender, a.birth_date, a.height,
         a.job, a.location, a.mbti, a.bio, a.photo_url, a.photos,
         a.religion, a.smoking, a.drinking, a.education, a.hobby
  FROM public.applicants a
  WHERE a.status = 'approved'
    AND a.is_participant = true
    AND a.id != v_my_id
    AND (p_gender IS NULL OR a.gender = p_gender)
    AND (p_location IS NULL OR a.location = p_location)
    AND (p_job IS NULL OR a.job = p_job)
    AND (p_min_age IS NULL OR (a.birth_date IS NOT NULL AND extract(year from age(v_today, a.birth_date)) >= p_min_age))
    AND (p_max_age IS NULL OR (a.birth_date IS NOT NULL AND extract(year from age(v_today, a.birth_date)) <= p_max_age))
    AND a.id NOT IN (SELECT blocked_id FROM public.blocks WHERE blocker_id = v_my_id)
  ORDER BY a.created_at DESC
  LIMIT 50;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 5. RPC: send_chat_message
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_match_id uuid,
  p_content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_my_id uuid := public.get_my_applicant_id();
  v_match record;
  v_msg_id uuid;
  v_partner_id uuid;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF v_match.status != 'active' THEN RAISE EXCEPTION 'Match is not active'; END IF;
  IF v_my_id != v_match.applicant_a_id AND v_my_id != v_match.applicant_b_id THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  INSERT INTO public.chat_messages (match_id, sender_id, content)
  VALUES (p_match_id, v_my_id, p_content)
  RETURNING id INTO v_msg_id;

  -- 상대 알림
  v_partner_id := CASE WHEN v_my_id = v_match.applicant_a_id THEN v_match.applicant_b_id ELSE v_match.applicant_a_id END;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (v_partner_id, 'message', '새 메시지가 도착했어요', '', jsonb_build_object('match_id', p_match_id));

  RETURN v_msg_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 6. RPC: create_notification
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT '',
  p_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (p_user_id, p_type, p_title, p_body, p_data);
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 7. Admin RPCs
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_list_applicants(p_status text DEFAULT NULL)
RETURNS SETOF public.applicants
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()::text) THEN
    RAISE EXCEPTION 'Not an admin';
  END IF;
  IF p_status IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.applicants WHERE status = p_status ORDER BY created_at DESC;
  ELSE
    RETURN QUERY SELECT * FROM public.applicants ORDER BY created_at DESC;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_status(p_applicant_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()::text) THEN
    RAISE EXCEPTION 'Not an admin';
  END IF;
  UPDATE public.applicants SET status = p_status, updated_at = now() WHERE id = p_applicant_id;

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    p_applicant_id,
    'admin_approved',
    CASE WHEN p_status = 'approved' THEN '가입이 승인되었어요!' ELSE '가입 심사 결과' END,
    CASE WHEN p_status = 'approved' THEN '지금 바로 소개를 받을 수 있어요.' ELSE '아쉽지만 이번에는 승인되지 않았어요.' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_health_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()::text) THEN
    RAISE EXCEPTION 'Not an admin';
  END IF;
  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.applicants),
    'pending', (SELECT count(*) FROM public.applicants WHERE status = 'pending'),
    'pending_reputation', (SELECT count(*) FROM public.applicants WHERE status = 'pending_reputation'),
    'approved', (SELECT count(*) FROM public.applicants WHERE status = 'approved'),
    'male_count', (SELECT count(*) FROM public.applicants WHERE gender = 'male' AND status = 'approved'),
    'female_count', (SELECT count(*) FROM public.applicants WHERE gender = 'female' AND status = 'approved'),
    'active_matches', (SELECT count(*) FROM public.matches WHERE status = 'active'),
    'total_messages', (SELECT count(*) FROM public.chat_messages),
    'pending_reports', (SELECT count(*) FROM public.reports WHERE status = 'pending'),
    'escalation_count', (SELECT count(*) FROM public.applicants WHERE status = 'pending_reputation' AND created_at < now() - interval '7 days')
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_reports()
RETURNS TABLE(
  id uuid, reporter_name text, target_name text, reason text,
  status text, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()::text) THEN
    RAISE EXCEPTION 'Not an admin';
  END IF;
  RETURN QUERY
  SELECT r.id, rep.name as reporter_name, tgt.name as target_name,
         r.reason, r.status, r.created_at
  FROM public.reports r
  JOIN public.applicants rep ON r.reporter_id = rep.id
  JOIN public.applicants tgt ON r.target_id = tgt.id
  ORDER BY r.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_matches()
RETURNS TABLE(
  id uuid, a_name text, b_name text, status text,
  from_introduction_id uuid, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()::text) THEN
    RAISE EXCEPTION 'Not an admin';
  END IF;
  RETURN QUERY
  SELECT m.id, a.name as a_name, b.name as b_name,
         m.status, m.from_introduction_id, m.created_at
  FROM public.matches m
  JOIN public.applicants a ON m.applicant_a_id = a.id
  JOIN public.applicants b ON m.applicant_b_id = b.id
  ORDER BY m.created_at DESC;
END;
$$;
