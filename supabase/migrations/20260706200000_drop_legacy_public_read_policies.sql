-- =====================================================
-- Fix: country-scoped map visibility (20260704120100) never actually took
-- effect, because each hazard table also carried an older, differently-named
-- permissive SELECT policy (e.g. "Allow anon select on earthquake",
-- "Enable read access for all users" on disaster) predating that migration,
-- granted TO {public} (which covers `authenticated` too, not just `anon`)
-- with USING (true). Postgres OR's all permissive policies for the same
-- command together, so a logged-in country_admin/org_admin/viewer still saw
-- every country's rows via this leftover policy — confirmed live via a
-- direct authenticated-session query returning ~19.5k rows (all countries)
-- instead of the ~700 scoped to their own country_code.
--
-- Fix: drop the legacy {public} policies. Anonymous read access is already
-- fully covered by the `anon`-only public_read_X policies added in
-- 20260704120100; authenticated access now goes exclusively through
-- country_scoped_read_X as originally intended.
-- =====================================================

DROP POLICY IF EXISTS "Allow anon select on earthquake" ON earthquake;
DROP POLICY IF EXISTS "Allow anon select on wildfire" ON wildfire;
DROP POLICY IF EXISTS "Allow anon select on flood" ON flood;
DROP POLICY IF EXISTS "Allow anon select on drought" ON drought;
DROP POLICY IF EXISTS "Allow anon select on food_security" ON food_security;
DROP POLICY IF EXISTS "Allow public read access on food_security_events" ON food_security;
DROP POLICY IF EXISTS "Allow anon select on tsunami" ON tsunami;
DROP POLICY IF EXISTS "Allow anon select on cyclone" ON cyclone;
DROP POLICY IF EXISTS "Allow anon select on volcano" ON volcano;
DROP POLICY IF EXISTS "Allow anon select on epidemic" ON epidemic;
DROP POLICY IF EXISTS "Enable read access for all users" ON disaster;
