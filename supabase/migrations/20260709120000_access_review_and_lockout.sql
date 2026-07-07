-- =====================================================
-- Spec 028: Access Review Report & Account Lockout
--
-- Adds two nullable/default columns to `profiles` for failed-login tracking,
-- plus 4 SECURITY DEFINER functions:
--   - record_failed_login(p_email): anon-callable, increments the counter and
--     locks the account once the threshold is crossed. Never reveals whether
--     the email exists (silent no-op on no match).
--   - clear_own_login_lock(): authenticated, resets the caller's own counter
--     after a successful password verification.
--   - unlock_profile(p_profile_id): super_admin-only manual override.
--   - get_access_review(): super_admin-only report joining profiles,
--     profile_capability_grants, and auth.users.last_sign_in_at.
--
-- Supabase Auth's own signInWithPassword/session issuance is NEVER modified —
-- lockout is enforced entirely in the application layer (auth.js), mirroring
-- the existing is_active suspension precedent (20260706130100).
--
-- profiles UPDATEs from these functions are automatically captured by the
-- existing audit_profiles trigger (20260605120000) — no additional audit
-- code needed here (Constitution Principle V already satisfied).
-- =====================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- ── record_failed_login ─────────────────────────────────────────────────────
-- anon-callable (no session exists yet when a password is wrong). Silently
-- no-ops if no profile matches p_email — never reveals account existence.
-- Deliberate: once the threshold (5) is crossed, every further failed attempt
-- re-extends locked_until by another 15 minutes (prevents waiting out the
-- clock while still guessing).
DROP FUNCTION IF EXISTS record_failed_login(TEXT);
CREATE OR REPLACE FUNCTION record_failed_login(p_email TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET failed_login_attempts = failed_login_attempts + 1,
      locked_until = CASE
        WHEN failed_login_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
        ELSE locked_until
      END
  WHERE email = p_email;
END;
$$;

GRANT EXECUTE ON FUNCTION record_failed_login(TEXT) TO anon, authenticated;

-- ── clear_own_login_lock ─────────────────────────────────────────────────────
-- Called by auth.js right after a successful password check (and confirming
-- the account isn't currently locked) — resets the counter (FR-006).
DROP FUNCTION IF EXISTS clear_own_login_lock();
CREATE OR REPLACE FUNCTION clear_own_login_lock()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET failed_login_attempts = 0,
      locked_until = NULL
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION clear_own_login_lock() TO authenticated;

-- ── unlock_profile ───────────────────────────────────────────────────────────
-- Super Admin manual override (FR-007) — target profile need not be the
-- caller's own row.
DROP FUNCTION IF EXISTS unlock_profile(UUID);
CREATE OR REPLACE FUNCTION unlock_profile(p_profile_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_profile_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'not authorized to unlock profiles';
  END IF;

  UPDATE profiles
  SET failed_login_attempts = 0,
      locked_until = NULL
  WHERE id = p_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION unlock_profile(UUID) TO authenticated;

-- ── get_access_review ────────────────────────────────────────────────────────
-- Super Admin-only report (FR-001/FR-002): current role/scope/capabilities per
-- user plus last_sign_in_at from auth.users. No auth.users column beyond
-- last_sign_in_at is ever read (no credentials/tokens exposed).
DROP FUNCTION IF EXISTS get_access_review();
CREATE OR REPLACE FUNCTION get_access_review()
RETURNS TABLE(
  profile_id UUID,
  email TEXT,
  role TEXT,
  country_code TEXT,
  org_id UUID,
  is_active BOOLEAN,
  capabilities TEXT[],
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_profile_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'not authorized to view access review';
  END IF;

  RETURN QUERY
    SELECT
      p.id,
      p.email,
      p.role,
      p.country_code,
      p.org_id,
      p.is_active,
      COALESCE(array_agg(g.capability) FILTER (WHERE g.capability IS NOT NULL), ARRAY[]::text[]),
      u.last_sign_in_at,
      p.created_at
    FROM profiles p
    LEFT JOIN profile_capability_grants g ON g.profile_id = p.id
    LEFT JOIN auth.users u ON u.id = p.id
    GROUP BY p.id, u.last_sign_in_at
    ORDER BY p.email;
END;
$$;

GRANT EXECUTE ON FUNCTION get_access_review() TO authenticated;
