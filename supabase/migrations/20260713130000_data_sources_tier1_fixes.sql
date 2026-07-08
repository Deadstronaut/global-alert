-- =====================================================
-- Fixes for 20260709000000_data_sources_tier1_source_type.sql, applied
-- AFTER that migration already ran on remote (editing an already-applied
-- migration file has no effect on a live database — this corrects it
-- forward instead). Two issues found in code review:
--
-- 1. 'PTWC RSS' seed row was inserted with poll_interval_seconds=180,
--    but server/src/sources/rss.js's startPTWCRSS() default is
--    2*60_000ms = 120s. Correct the row so the DB-driven path (once
--    cut over) polls at the same cadence the hardcoded path always has.
-- 2. source_type write protection (RLS WITH CHECK + immutability trigger)
--    was written into the original migration file's text, but that file
--    was already applied to remote before this fix landed, so the
--    protection was never actually installed. Re-apply it here.
-- Feature: tier1-source-unification
-- =====================================================

UPDATE data_sources
SET poll_interval_seconds = 120,
    staleness_threshold_seconds = 600
WHERE name = 'PTWC RSS' AND source_type = 'ptwc_rss';

-- ── source_type write protection (see original migration's comment for full rationale) ──

DROP POLICY IF EXISTS "super_admin_write_data_sources" ON data_sources;
CREATE POLICY "super_admin_write_data_sources" ON data_sources
  FOR INSERT WITH CHECK (
    current_profile_role() = 'super_admin' AND source_type IS NULL
  );

DROP POLICY IF EXISTS "country_admin_write_own_country_data_sources" ON data_sources;
CREATE POLICY "country_admin_write_own_country_data_sources" ON data_sources
  FOR INSERT WITH CHECK (
    current_profile_role() = 'country_admin'
    AND country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())
    AND source_type IS NULL
  );

CREATE OR REPLACE FUNCTION prevent_source_type_mutation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_type IS DISTINCT FROM OLD.source_type
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'source_type is immutable via the app API; it may only be changed by a database migration';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS data_sources_prevent_source_type_mutation ON data_sources;
CREATE TRIGGER data_sources_prevent_source_type_mutation
  BEFORE UPDATE ON data_sources
  FOR EACH ROW EXECUTE FUNCTION prevent_source_type_mutation();
