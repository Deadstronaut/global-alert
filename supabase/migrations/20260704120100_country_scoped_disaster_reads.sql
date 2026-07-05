-- =====================================================
-- Country-scoped map visibility for logged-in accounts.
--
-- Previously "public_read_X" policies (20260410_rls.sql) had no TO clause,
-- meaning USING (true) applied to every role including `authenticated` — so
-- a logged-in country_admin/org_admin/viewer could see every country's data,
-- same as an anonymous visitor. Per product decision: the public/anonymous
-- map stays global (unauthenticated visitors keep seeing everything), but a
-- logged-in account (other than super_admin) must see ONLY its own country.
--
-- Fix: narrow "public_read_X" to the `anon` role only, and add a new
-- `authenticated`-only policy that super_admin bypasses (global) while every
-- other role is restricted to rows matching their own profiles.country_code.
-- Postgres RLS policies are OR'd (permissive), so an authenticated user gets
-- access ONLY via the new policy now — never via the anon-only one.
-- =====================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['earthquake','wildfire','flood','drought','food_security',
                            'tsunami','cyclone','volcano','epidemic','disaster']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'public_read_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO anon USING (true)',
      'public_read_' || t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'country_scoped_read_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING ('
      || 'current_profile_role() = ''super_admin'' OR '
      || 'country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())'
      || ')',
      'country_scoped_read_' || t, t
    );
  END LOOP;
END $$;
