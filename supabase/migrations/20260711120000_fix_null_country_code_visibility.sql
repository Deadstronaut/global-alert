-- =====================================================
-- Production bug fix: disasters invisible to logged-in non-super-admin users.
--
-- Root cause: 20260704120100_country_scoped_disaster_reads.sql restricted
-- `authenticated` reads to `country_code = (caller's profile country_code)`.
-- 20260706200000_drop_legacy_public_read_policies.sql then removed the old
-- permissive fallback for `authenticated`. But most fetch-* Edge Functions
-- (all except fetch-droughts) never populate `country_code` on insert, so
-- most disaster rows have `country_code IS NULL`. In SQL, `NULL = 'tr'`
-- evaluates to NULL (never true), so those rows became invisible to every
-- logged-in country_admin/org_admin/viewer — while anonymous visitors kept
-- seeing everything via the anon-only public_read_X policy (USING(true)).
--
-- Fix: treat country_code IS NULL as "not yet geocoded, show to everyone"
-- (matches the anon behavior) rather than "hide from everyone". Once a row's
-- country_code is actually populated (either by the backfill migration or by
-- a fetch-* function), normal country-scoping applies as originally intended.
-- This does not change super_admin (still sees everything) or anon (still
-- sees everything) — it only restores visibility of un-geocoded rows for
-- authenticated non-super-admin roles.
-- =====================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['earthquake','wildfire','flood','drought','food_security',
                            'tsunami','cyclone','volcano','epidemic','disaster']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'country_scoped_read_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING ('
      || 'current_profile_role() = ''super_admin'' OR '
      || 'country_code IS NULL OR '
      || 'country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())'
      || ')',
      'country_scoped_read_' || t, t
    );
  END LOOP;
END $$;
