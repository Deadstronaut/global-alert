-- =====================================================
-- Data Sources — country scoping (global vs. per-country sources)
-- Feature: 002-source-scoping
--
-- Adds an optional country_code to data_sources (feature 001) so a source can be
-- either global (country_code IS NULL — e.g. USGS, NASA FIRMS) or scoped to a
-- single country (e.g. Kandilli/AFAD -> 'TR'). No CHECK constraint on the value:
-- country codes are an open, admin-managed set, matching profiles.country_code's
-- existing convention (see data-model.md).
-- =====================================================

ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS country_code TEXT;

CREATE INDEX IF NOT EXISTS idx_data_sources_country_code ON data_sources (country_code);

-- ── Read visibility: global (NULL) + own country + super_admin sees all ────────
-- Mirrors the country_scoped_read_* pattern from 20260704_country_scoped_disaster_reads.sql.
-- 001's "public_read_data_sources" policy had no TO clause (applied to anon AND
-- authenticated). Narrow it to anon only, then add an authenticated-only policy
-- that additionally allows global (NULL) sources through for every role.

DROP POLICY IF EXISTS "public_read_data_sources" ON data_sources;
CREATE POLICY "public_read_data_sources" ON data_sources
  FOR SELECT TO anon USING (true);

CREATE POLICY "country_scoped_read_data_sources" ON data_sources
  FOR SELECT TO authenticated USING (
    current_profile_role() = 'super_admin'
    OR country_code IS NULL
    OR country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())
  );

-- ── Write access: country_admin restricted to their own country's rows ────────
-- 001's admins_write_data_sources / admins_update_data_sources allowed
-- super_admin and country_admin unconditionally. Replace with role-conditional
-- checks: super_admin keeps unrestricted access; country_admin may only write
-- rows scoped to their own country (never NULL/global, never another country).

DROP POLICY IF EXISTS "admins_write_data_sources" ON data_sources;
CREATE POLICY "super_admin_write_data_sources" ON data_sources
  FOR INSERT WITH CHECK (current_profile_role() = 'super_admin');

CREATE POLICY "country_admin_write_own_country_data_sources" ON data_sources
  FOR INSERT WITH CHECK (
    current_profile_role() = 'country_admin'
    AND country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "admins_update_data_sources" ON data_sources;
CREATE POLICY "super_admin_update_data_sources" ON data_sources
  FOR UPDATE USING (current_profile_role() = 'super_admin');

CREATE POLICY "country_admin_update_own_country_data_sources" ON data_sources
  FOR UPDATE USING (
    current_profile_role() = 'country_admin'
    AND country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())
  );

-- admins_delete_data_sources (001) is left unchanged (super_admin + country_admin,
-- unconditional) — deletion scope-restriction was not requested by spec 002 and
-- would be a separate, explicit decision (out of scope per spec Assumptions).
