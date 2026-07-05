-- =====================================================
-- Country/org-scoped user management for profiles (spec 004, gap 2)
--
-- Today only super_admin and "own row" (users_read_own_profile) can read
-- profiles; there is no policy letting a country_admin see other users in
-- their own country, or an org_admin see other users in their own
-- organization — so the existing Users-tab UI silently returns almost
-- nothing for those roles despite looking functional.
--
-- Two new SECURITY DEFINER helpers (current_profile_country_code,
-- current_profile_org_id) mirror the existing current_profile_role()
-- pattern (20260703120300_fix_profiles_rls_recursion.sql) to avoid
-- re-introducing the infinite-recursion bug that pattern was created to fix.
-- =====================================================

CREATE OR REPLACE FUNCTION current_profile_country_code() RETURNS VARCHAR(2)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT country_code FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION current_profile_org_id() RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid()
$$;

-- ── SELECT: country_admin sees every profile in their own country ──────────
DROP POLICY IF EXISTS "country_admin_read_own_country_profiles" ON profiles;
CREATE POLICY "country_admin_read_own_country_profiles" ON profiles
  FOR SELECT USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

-- ── SELECT: org_admin sees every profile in their own org ───────────────────
DROP POLICY IF EXISTS "org_admin_read_own_org_profiles" ON profiles;
CREATE POLICY "org_admin_read_own_org_profiles" ON profiles
  FOR SELECT USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
    AND org_id = current_profile_org_id()
  );

-- ── UPDATE: country_admin may edit org_admin/viewer rows in their country ──
-- USING governs which existing rows are editable; WITH CHECK governs what the
-- resulting new row is allowed to look like — Postgres does NOT default
-- WITH CHECK from USING, both must be written out (research.md §2).
DROP POLICY IF EXISTS "country_admin_update_own_country_profiles" ON profiles;
CREATE POLICY "country_admin_update_own_country_profiles" ON profiles
  FOR UPDATE USING (
    current_profile_role() = 'country_admin'
    AND role IN ('org_admin', 'viewer')
    AND country_code = current_profile_country_code()
  )
  WITH CHECK (
    current_profile_role() = 'country_admin'
    AND role IN ('org_admin', 'viewer')
    AND country_code = current_profile_country_code()
  );

-- ── UPDATE: org_admin may edit viewer rows in their own org only ───────────
DROP POLICY IF EXISTS "org_admin_update_own_org_profiles" ON profiles;
CREATE POLICY "org_admin_update_own_org_profiles" ON profiles
  FOR UPDATE USING (
    current_profile_role() = 'org_admin'
    AND role = 'viewer'
    AND country_code = current_profile_country_code()
    AND org_id = current_profile_org_id()
  )
  WITH CHECK (
    current_profile_role() = 'org_admin'
    AND role = 'viewer'
    AND country_code = current_profile_country_code()
    AND org_id = current_profile_org_id()
  );
