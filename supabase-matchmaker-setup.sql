-- ══════════════════════════════════════
--  반쪽 — 주선자 소개 시스템 SQL
--  Supabase SQL Editor에서 실행
--  선행 조건: supabase-launch-hardening.sql 실행 완료
-- ══════════════════════════════════════

-- 1. 소개(introductions) 테이블
CREATE TABLE IF NOT EXISTS introductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matchmaker_id TEXT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    person_a_id TEXT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    person_b_id TEXT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'proposed'
        CHECK (status IN ('proposed','matched','declined','expired')),
    a_response TEXT CHECK (a_response IN ('yes','no')),
    b_response TEXT CHECK (b_response IN ('yes','no')),
    matchmaker_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_intro_matchmaker ON introductions(matchmaker_id);
CREATE INDEX IF NOT EXISTS idx_intro_person_a ON introductions(person_a_id);
CREATE INDEX IF NOT EXISTS idx_intro_person_b ON introductions(person_b_id);
CREATE INDEX IF NOT EXISTS idx_intro_status ON introductions(status);

ALTER TABLE introductions ENABLE ROW LEVEL SECURITY;

-- 주선자: 자기가 만든 소개만 조회
CREATE POLICY "intro_matchmaker_select" ON introductions
    FOR SELECT USING (
        matchmaker_id IN (SELECT id FROM applicants WHERE user_id = auth.uid())
    );

-- 참가자: 자기가 포함된 소개만 조회
CREATE POLICY "intro_participant_select" ON introductions
    FOR SELECT USING (
        person_a_id IN (SELECT id FROM applicants WHERE user_id = auth.uid())
        OR person_b_id IN (SELECT id FROM applicants WHERE user_id = auth.uid())
    );

-- 관리자: 전체 조회
CREATE POLICY "intro_admin_select" ON introductions
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM admin_users)
    );

-- 2. 소개 제안 RPC (rate-limited, network-scoped)
CREATE OR REPLACE FUNCTION propose_introduction(
    p_person_a_id TEXT,
    p_person_b_id TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller applicants%ROWTYPE;
    v_a applicants%ROWTYPE;
    v_b applicants%ROWTYPE;
    v_today_count INT;
    v_intro_id UUID;
BEGIN
    -- 호출자 프로필 조회
    SELECT * INTO v_caller FROM applicants WHERE user_id = auth.uid();
    IF v_caller.id IS NULL THEN
        RAISE EXCEPTION 'caller not found';
    END IF;

    -- 주선 권한 확인: role='matchmaker' 또는 추천인이 있는 participant
    IF v_caller.role <> 'matchmaker' THEN
        IF NOT EXISTS (
            SELECT 1 FROM applicants WHERE referred_by = v_caller.referral_code
        ) THEN
            RAISE EXCEPTION 'no matchmaking permission';
        END IF;
    END IF;

    -- 자기 자신 소개 방지
    IF p_person_a_id = p_person_b_id THEN
        RAISE EXCEPTION 'cannot introduce someone to themselves';
    END IF;

    -- A, B 조회
    SELECT * INTO v_a FROM applicants WHERE id = p_person_a_id;
    SELECT * INTO v_b FROM applicants WHERE id = p_person_b_id;
    IF v_a.id IS NULL OR v_b.id IS NULL THEN
        RAISE EXCEPTION 'participant not found';
    END IF;

    -- 승인 상태 확인
    IF v_a.status <> 'approved' OR v_b.status <> 'approved' THEN
        RAISE EXCEPTION 'both participants must be approved';
    END IF;

    -- 크로스 네트워크 소개: 최소 1명은 자기 풀에 있어야 함
    IF v_a.referred_by <> v_caller.referral_code
       AND v_b.referred_by <> v_caller.referral_code THEN
        RAISE EXCEPTION 'at least one participant must be in your referral network';
    END IF;

    -- 일일 제한: tier별 인당 제한 (intro_daily_limit 컬럼 기반)
    SELECT COUNT(*) INTO v_today_count
    FROM introductions
    WHERE matchmaker_id = v_caller.id
      AND created_at >= CURRENT_DATE;
    IF v_today_count >= COALESCE(v_caller.intro_daily_limit, 1) * (
        SELECT COUNT(*) FROM applicants
        WHERE referred_by = v_caller.referral_code
          AND status = 'approved' AND role <> 'matchmaker'
    ) THEN
        RAISE EXCEPTION 'daily proposal limit reached';
    END IF;

    -- 중복 활성 소개 방지 (같은 쌍, 어느 방향이든)
    IF EXISTS (
        SELECT 1 FROM introductions
        WHERE status = 'proposed'
          AND ((person_a_id = p_person_a_id AND person_b_id = p_person_b_id)
            OR (person_a_id = p_person_b_id AND person_b_id = p_person_a_id))
    ) THEN
        RAISE EXCEPTION 'active introduction already exists for this pair';
    END IF;

    -- 이미 매칭된 사람 방지
    IF v_a.matched_with IS NOT NULL OR v_b.matched_with IS NOT NULL THEN
        RAISE EXCEPTION 'one or both participants are already matched';
    END IF;

    -- 소개 생성
    v_intro_id := gen_random_uuid();
    INSERT INTO introductions (id, matchmaker_id, person_a_id, person_b_id, matchmaker_note)
    VALUES (v_intro_id, v_caller.id, p_person_a_id, p_person_b_id, p_note);

    RETURN v_intro_id;
END;
$$;

-- 3. 소개 응답 RPC
CREATE OR REPLACE FUNCTION respond_to_introduction(
    p_intro_id UUID,
    p_accept BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_intro introductions%ROWTYPE;
    v_my_id TEXT;
    v_response TEXT;
BEGIN
    -- 내 applicant id 조회
    SELECT id INTO v_my_id FROM applicants WHERE user_id = auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'caller not found';
    END IF;

    -- 소개 조회 (잠금)
    SELECT * INTO v_intro FROM introductions WHERE id = p_intro_id FOR UPDATE;
    IF v_intro.id IS NULL THEN
        RAISE EXCEPTION 'introduction not found';
    END IF;

    -- 만료 확인
    IF v_intro.expires_at < now() THEN
        UPDATE introductions SET status = 'expired', updated_at = now()
        WHERE id = p_intro_id AND status = 'proposed';
        RAISE EXCEPTION 'introduction has expired';
    END IF;

    -- 이미 완료된 소개 확인
    IF v_intro.status <> 'proposed' THEN
        RAISE EXCEPTION 'introduction is no longer active';
    END IF;

    v_response := CASE WHEN p_accept THEN 'yes' ELSE 'no' END;

    -- Person A 응답
    IF v_intro.person_a_id = v_my_id THEN
        IF v_intro.a_response IS NOT NULL THEN
            RAISE EXCEPTION 'already responded';
        END IF;
        UPDATE introductions SET a_response = v_response, updated_at = now()
        WHERE id = p_intro_id;

    -- Person B 응답
    ELSIF v_intro.person_b_id = v_my_id THEN
        IF v_intro.b_response IS NOT NULL THEN
            RAISE EXCEPTION 'already responded';
        END IF;
        UPDATE introductions SET b_response = v_response, updated_at = now()
        WHERE id = p_intro_id;

    ELSE
        RAISE EXCEPTION 'not a participant in this introduction';
    END IF;

    -- 다시 읽기 (업데이트 반영)
    SELECT * INTO v_intro FROM introductions WHERE id = p_intro_id;

    -- 한쪽이라도 거절 → declined
    IF v_intro.a_response = 'no' OR v_intro.b_response = 'no' THEN
        UPDATE introductions SET status = 'declined', updated_at = now()
        WHERE id = p_intro_id;
        RETURN 'declined';
    END IF;

    -- 둘 다 수락 → matched
    IF v_intro.a_response = 'yes' AND v_intro.b_response = 'yes' THEN
        -- 참가자 행 잠금 (race condition 방지: 동시 매칭 차단)
        PERFORM 1 FROM applicants
        WHERE id IN (v_intro.person_a_id, v_intro.person_b_id)
        ORDER BY id
        FOR UPDATE;

        -- 잠금 후 재확인: 이미 매칭된 경우 중단
        IF NOT EXISTS (
            SELECT 1 FROM applicants
            WHERE id = v_intro.person_a_id AND status = 'approved'
        ) OR NOT EXISTS (
            SELECT 1 FROM applicants
            WHERE id = v_intro.person_b_id AND status = 'approved'
        ) THEN
            UPDATE introductions SET status = 'declined', updated_at = now()
            WHERE id = p_intro_id;
            RETURN 'declined';
        END IF;

        -- 매칭 생성
        UPDATE applicants SET status = 'matched', matched_with = v_intro.person_b_id
        WHERE id = v_intro.person_a_id AND status = 'approved';

        UPDATE applicants SET status = 'matched', matched_with = v_intro.person_a_id
        WHERE id = v_intro.person_b_id AND status = 'approved';

        -- 소개 상태 업데이트
        UPDATE introductions SET status = 'matched', updated_at = now()
        WHERE id = p_intro_id;

        -- 주선자 보상: intro_success_count 증가 + tier 재계산
        UPDATE applicants SET
            intro_success_count = COALESCE(intro_success_count, 0) + 1,
            matchmaker_tier = CASE
                WHEN COALESCE(intro_success_count, 0) + 1 >= 5 THEN 'golden'
                WHEN COALESCE(intro_success_count, 0) + 1 >= 3 THEN 'skilled'
                WHEN COALESCE(intro_success_count, 0) + 1 >= 1 THEN 'beginner'
                ELSE NULL
            END,
            intro_daily_limit = CASE
                WHEN COALESCE(intro_success_count, 0) + 1 >= 5 THEN 3
                WHEN COALESCE(intro_success_count, 0) + 1 >= 3 THEN 2
                WHEN COALESCE(intro_success_count, 0) + 1 >= 1 THEN 2
                ELSE 1
            END,
            intro_rec_count = CASE
                WHEN COALESCE(intro_success_count, 0) + 1 >= 5 THEN 7
                WHEN COALESCE(intro_success_count, 0) + 1 >= 3 THEN 5
                ELSE 3
            END
        WHERE id = v_intro.matchmaker_id;

        -- 이 두 사람과 관련된 다른 활성 소개도 정리
        UPDATE introductions SET status = 'declined', updated_at = now()
        WHERE status = 'proposed'
          AND id <> p_intro_id
          AND (person_a_id IN (v_intro.person_a_id, v_intro.person_b_id)
            OR person_b_id IN (v_intro.person_a_id, v_intro.person_b_id));

        -- 기존 찜 시스템의 pending match_requests도 정리
        UPDATE match_requests SET status = 'rejected'
        WHERE status = 'pending'
          AND (from_applicant IN (v_intro.person_a_id, v_intro.person_b_id)
            OR to_applicant IN (v_intro.person_a_id, v_intro.person_b_id));

        RETURN 'matched';
    END IF;

    -- 아직 한 쪽만 응답
    RETURN 'waiting';
END;
$$;

-- 4. admin_match_applicants 리팩터 (성별 중립)
CREATE OR REPLACE FUNCTION admin_match_applicants(p_person_a_id TEXT, p_person_b_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_a applicants%ROWTYPE;
    v_b applicants%ROWTYPE;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'admin only';
    END IF;

    SELECT * INTO v_a FROM applicants WHERE id = p_person_a_id FOR UPDATE;
    SELECT * INTO v_b FROM applicants WHERE id = p_person_b_id FOR UPDATE;

    IF v_a.id IS NULL OR v_b.id IS NULL THEN
        RAISE EXCEPTION 'applicant not found';
    END IF;

    IF v_a.status <> 'approved' OR v_b.status <> 'approved' THEN
        RAISE EXCEPTION 'only approved applicants can be matched';
    END IF;

    UPDATE applicants SET status = 'matched', matched_with = p_person_b_id
    WHERE id = p_person_a_id;

    UPDATE applicants SET status = 'matched', matched_with = p_person_a_id
    WHERE id = p_person_b_id;

    -- 관련 match_requests 정리
    UPDATE match_requests SET status = 'rejected'
    WHERE status = 'pending'
      AND (from_applicant IN (p_person_a_id, p_person_b_id)
        OR to_applicant IN (p_person_a_id, p_person_b_id));

    -- 이 쌍의 활성 소개가 있으면 matched로 표시
    UPDATE introductions SET status = 'matched', updated_at = now()
    WHERE status = 'proposed'
      AND ((person_a_id = p_person_a_id AND person_b_id = p_person_b_id)
        OR (person_a_id = p_person_b_id AND person_b_id = p_person_a_id));

    -- 다른 활성 소개는 declined로 정리 (unrelated intros)
    UPDATE introductions SET status = 'declined', updated_at = now()
    WHERE status = 'proposed'
      AND NOT ((person_a_id = p_person_a_id AND person_b_id = p_person_b_id)
            OR (person_a_id = p_person_b_id AND person_b_id = p_person_a_id))
      AND (person_a_id IN (p_person_a_id, p_person_b_id)
        OR person_b_id IN (p_person_a_id, p_person_b_id));
END;
$$;

-- 5. 기존 auto_match_if_mutual 제거 후 재생성 (동성 제한 제거 + 소개 정리)
DROP FUNCTION IF EXISTS auto_match_if_mutual(text);
CREATE OR REPLACE FUNCTION auto_match_if_mutual(p_target_applicant_id TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me applicants%ROWTYPE;
    v_target applicants%ROWTYPE;
BEGIN
    SELECT * INTO v_me FROM applicants WHERE user_id = auth.uid() FOR UPDATE;
    SELECT * INTO v_target FROM applicants WHERE id = p_target_applicant_id FOR UPDATE;

    IF v_me.id IS NULL OR v_target.id IS NULL THEN
        RAISE EXCEPTION 'applicant not found';
    END IF;

    IF v_me.status <> 'approved' OR v_target.status <> 'approved' THEN
        RETURN false;
    END IF;

    IF v_me.id = v_target.id THEN
        RETURN false;
    END IF;

    -- 동성 제한 제거됨 (성별 관계없이 상호 찜이면 매칭)

    IF NOT EXISTS (
        SELECT 1 FROM favorites
        WHERE user_id = auth.uid() AND applicant_id = v_target.id
    ) THEN
        RETURN false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM favorites
        WHERE user_id = v_target.user_id AND applicant_id = v_me.id
    ) THEN
        RETURN false;
    END IF;

    UPDATE applicants SET status = 'matched', matched_with = v_target.id
    WHERE id = v_me.id;

    UPDATE applicants SET status = 'matched', matched_with = v_me.id
    WHERE id = v_target.id;

    -- 이 쌍의 활성 소개가 있으면 matched로 표시
    UPDATE introductions SET status = 'matched', updated_at = now()
    WHERE status = 'proposed'
      AND ((person_a_id = v_me.id AND person_b_id = v_target.id)
        OR (person_a_id = v_target.id AND person_b_id = v_me.id));

    -- 다른 활성 소개는 declined로 정리
    UPDATE introductions SET status = 'declined', updated_at = now()
    WHERE status = 'proposed'
      AND NOT ((person_a_id = v_me.id AND person_b_id = v_target.id)
            OR (person_a_id = v_target.id AND person_b_id = v_me.id))
      AND (person_a_id IN (v_me.id, v_target.id)
        OR person_b_id IN (v_me.id, v_target.id));

    RETURN true;
END;
$$;

-- 6. 중복 소개 방지 부분 유니크 인덱스 (race condition 방지)
CREATE UNIQUE INDEX IF NOT EXISTS idx_intro_unique_active_pair
ON introductions (LEAST(person_a_id, person_b_id), GREATEST(person_a_id, person_b_id))
WHERE status = 'proposed';
