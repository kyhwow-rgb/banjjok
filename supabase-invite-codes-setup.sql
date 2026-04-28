-- ══════════════════════════════════════
--  반쪽 — 초대 코드 + 평판 자동 전환 SQL
--  Supabase SQL Editor에서 실행
-- ══════════════════════════════════════

-- 1. 초대 코드 테이블
CREATE TABLE IF NOT EXISTS invite_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    created_by UUID REFERENCES auth.users(id),
    used_by UUID REFERENCES auth.users(id),
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 설정
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- 누구나 코드 조회 가능 (가입 시 유효성 검증)
CREATE POLICY "invite_codes_select" ON invite_codes
    FOR SELECT USING (true);

-- admin만 INSERT (admin_users 테이블 기반)
CREATE POLICY "invite_codes_insert" ON invite_codes
    FOR INSERT WITH CHECK (
        auth.uid() IN (SELECT user_id FROM admin_users)
    );

-- 가입자가 사용 처리 (used_at, used_by 업데이트)
CREATE POLICY "invite_codes_update" ON invite_codes
    FOR UPDATE USING (true)
    WITH CHECK (used_at IS NOT NULL AND used_by = auth.uid());

-- 2. 평판 자동 전환 트리거 (pending_reputation → pending)
CREATE OR REPLACE FUNCTION promote_after_reputation()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM reputations WHERE target_applicant_id = NEW.target_applicant_id) >= 2 THEN
        UPDATE applicants
        SET status = 'pending'
        WHERE id = NEW.target_applicant_id
        AND status = 'pending_reputation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_reputation_promote ON reputations;
CREATE TRIGGER trg_reputation_promote
    AFTER INSERT ON reputations
    FOR EACH ROW
    EXECUTE FUNCTION promote_after_reputation();

-- 3. is_referrer 자동 설정 트리거
CREATE OR REPLACE FUNCTION set_is_referrer()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_referrer := EXISTS (
        SELECT 1 FROM applicants
        WHERE id = NEW.target_applicant_id
        AND referred_by = (
            SELECT referral_code FROM applicants WHERE id = NEW.writer_applicant_id
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_is_referrer ON reputations;
CREATE TRIGGER trg_set_is_referrer
    BEFORE INSERT ON reputations
    FOR EACH ROW
    EXECUTE FUNCTION set_is_referrer();

-- 4. 추천인 인센티브 원자적 업데이트 RPC
CREATE OR REPLACE FUNCTION apply_referral_bonus(referrer_code TEXT, boost_ts TIMESTAMPTZ)
RETURNS void AS $$
BEGIN
    UPDATE applicants
    SET referral_count = COALESCE(referral_count, 0) + 1,
        fav_slots = LEAST(COALESCE(fav_slots, 3) + 1, 5),
        boost_until = boost_ts
    WHERE referral_code = referrer_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. referral_code UNIQUE 제약 (이미 있으면 무시)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'applicants_referral_code_unique'
    ) THEN
        ALTER TABLE applicants ADD CONSTRAINT applicants_referral_code_unique UNIQUE (referral_code);
    END IF;
END $$;
