-- =====================================================
-- MFA foundational tables (spec 005): recovery codes + per-role policy
--
-- Supabase Auth's native MFA covers TOTP factor enroll/challenge/verify/
-- unenroll (auth.mfa_factors, not owned by this schema) but has no built-in
-- recovery-code mechanism, and no per-role "is MFA mandatory" concept — both
-- are added here as small, purpose-built tables (research.md §3/§4).
-- =====================================================

-- ── mfa_recovery_codes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user ON mfa_recovery_codes (user_id);

ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_recovery_codes" ON mfa_recovery_codes;
CREATE POLICY "users_read_own_recovery_codes" ON mfa_recovery_codes
  FOR SELECT USING (auth.uid() = user_id);

-- Users may insert their OWN freshly generated codes at enrollment time
-- (client-side generated/hashed, per research.md §3) — no UPDATE policy for
-- regular users; only the verify-recovery-code Edge Function (service role)
-- may mark a row used.
DROP POLICY IF EXISTS "users_insert_own_recovery_codes" ON mfa_recovery_codes;
CREATE POLICY "users_insert_own_recovery_codes" ON mfa_recovery_codes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users may delete their own UNUSED codes only (to clear a stale set when
-- re-enrolling) — a used code's row must remain for audit purposes, so this
-- policy intentionally excludes rows where used_at IS NOT NULL.
DROP POLICY IF EXISTS "users_delete_own_unused_recovery_codes" ON mfa_recovery_codes;
CREATE POLICY "users_delete_own_unused_recovery_codes" ON mfa_recovery_codes
  FOR DELETE USING (auth.uid() = user_id AND used_at IS NULL);

-- Reuse the existing generic audit trigger (spec 004 pattern) — captures
-- recovery-code generation/use automatically, no new logging code needed.
DROP TRIGGER IF EXISTS audit_mfa_recovery_codes ON mfa_recovery_codes;
CREATE TRIGGER audit_mfa_recovery_codes
  AFTER INSERT OR UPDATE ON mfa_recovery_codes
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── mfa_role_policy ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_role_policy (
  role        TEXT PRIMARY KEY CHECK (role IN ('super_admin', 'country_admin', 'org_admin', 'viewer')),
  required    BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO mfa_role_policy (role, required) VALUES
  ('super_admin', false),
  ('country_admin', false),
  ('org_admin', false),
  ('viewer', false)
ON CONFLICT (role) DO NOTHING;

ALTER TABLE mfa_role_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_mfa_role_policy" ON mfa_role_policy;
CREATE POLICY "authenticated_read_mfa_role_policy" ON mfa_role_policy
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "super_admin_update_mfa_role_policy" ON mfa_role_policy;
CREATE POLICY "super_admin_update_mfa_role_policy" ON mfa_role_policy
  FOR UPDATE USING (current_profile_role() = 'super_admin');

-- ── log_mfa_event: audit hook for Supabase-internal MFA state changes ──────
-- Enrollment/removal of a TOTP factor happens inside Supabase Auth's own
-- auth.mfa_factors table, which this app cannot attach a trigger to. This
-- SECURITY DEFINER function lets the authenticated client itself log the
-- event immediately after a successful enroll/unenroll call (research.md §5).
CREATE OR REPLACE FUNCTION log_mfa_event(action TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_log (action, table_name, record_id, changed_by, new_data)
  VALUES (action, 'auth.mfa_factors', auth.uid()::text, auth.uid(), jsonb_build_object('user_id', auth.uid()));
END;
$$;
