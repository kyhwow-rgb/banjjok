-- Banjjok launch hardening SQL
-- Run in Supabase SQL Editor before the beta test.

-- 1) Admin-only manual matching must be atomic.
CREATE OR REPLACE FUNCTION admin_match_applicants(p_male_id TEXT, p_female_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_male applicants%ROWTYPE;
    v_female applicants%ROWTYPE;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'admin only';
    END IF;

    SELECT * INTO v_male
    FROM applicants
    WHERE id = p_male_id
    FOR UPDATE;

    SELECT * INTO v_female
    FROM applicants
    WHERE id = p_female_id
    FOR UPDATE;

    IF v_male.id IS NULL OR v_female.id IS NULL THEN
        RAISE EXCEPTION 'applicant not found';
    END IF;

    IF v_male.status <> 'approved' OR v_female.status <> 'approved' THEN
        RAISE EXCEPTION 'only approved applicants can be matched';
    END IF;

    IF v_male.gender <> 'male' OR v_female.gender <> 'female' THEN
        RAISE EXCEPTION 'invalid gender pair';
    END IF;

    UPDATE applicants
    SET status = 'matched',
        matched_with = p_female_id
    WHERE id = p_male_id;

    UPDATE applicants
    SET status = 'matched',
        matched_with = p_male_id
    WHERE id = p_female_id;

    UPDATE match_requests
    SET status = 'rejected'
    WHERE status = 'pending'
      AND (
        from_applicant IN (p_male_id, p_female_id)
        OR to_applicant IN (p_male_id, p_female_id)
      );
END;
$$;

-- 2) Mutual favorite auto-match must also be atomic.
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
    SELECT * INTO v_me
    FROM applicants
    WHERE user_id = auth.uid()
    FOR UPDATE;

    SELECT * INTO v_target
    FROM applicants
    WHERE id = p_target_applicant_id
    FOR UPDATE;

    IF v_me.id IS NULL OR v_target.id IS NULL THEN
        RAISE EXCEPTION 'applicant not found';
    END IF;

    IF v_me.status <> 'approved' OR v_target.status <> 'approved' THEN
        RETURN false;
    END IF;

    IF v_me.id = v_target.id THEN
        RETURN false;
    END IF;

    IF v_me.gender = v_target.gender THEN
        RETURN false;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM favorites
        WHERE user_id = auth.uid()
          AND applicant_id = v_target.id
    ) THEN
        RETURN false;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM favorites
        WHERE user_id = v_target.user_id
          AND applicant_id = v_me.id
    ) THEN
        RETURN false;
    END IF;

    UPDATE applicants
    SET status = 'matched',
        matched_with = v_target.id
    WHERE id = v_me.id;

    UPDATE applicants
    SET status = 'matched',
        matched_with = v_me.id
    WHERE id = v_target.id;

    RETURN true;
END;
$$;

-- 3) Invite code update policy should not allow arbitrary row updates.
DO $$
BEGIN
    IF to_regclass('public.invite_codes') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS "invite_codes_update" ON invite_codes';

        EXECUTE 'CREATE POLICY "invite_codes_update" ON invite_codes
            FOR UPDATE
            USING (
                used_at IS NULL
                OR used_by = auth.uid()
                OR auth.uid() IN (SELECT user_id FROM admin_users)
            )
            WITH CHECK (
                (
                    used_at IS NOT NULL
                    AND used_by = auth.uid()
                )
                OR auth.uid() IN (SELECT user_id FROM admin_users)
            )';
    END IF;
END $$;

-- 4) Settings must be admin-only if the table is used at all.
DO $$
BEGIN
    IF to_regclass('public.settings') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE settings ENABLE ROW LEVEL SECURITY';

        EXECUTE 'DROP POLICY IF EXISTS "settings_admin_select" ON settings';
        EXECUTE 'DROP POLICY IF EXISTS "settings_admin_insert" ON settings';
        EXECUTE 'DROP POLICY IF EXISTS "settings_admin_update" ON settings';
        EXECUTE 'DROP POLICY IF EXISTS "settings_admin_delete" ON settings';

        EXECUTE 'CREATE POLICY "settings_admin_select" ON settings
            FOR SELECT
            USING (auth.uid() IN (SELECT user_id FROM admin_users))';

        EXECUTE 'CREATE POLICY "settings_admin_insert" ON settings
            FOR INSERT
            WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users))';

        EXECUTE 'CREATE POLICY "settings_admin_update" ON settings
            FOR UPDATE
            USING (auth.uid() IN (SELECT user_id FROM admin_users))
            WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users))';

        EXECUTE 'CREATE POLICY "settings_admin_delete" ON settings
            FOR DELETE
            USING (auth.uid() IN (SELECT user_id FROM admin_users))';
    END IF;
END $$;
