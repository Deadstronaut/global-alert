-- =====================================================
-- Fix: every hazard table still carries a legacy permissive UPDATE policy
-- granted TO {public} (covers both anon and authenticated) with USING (true)
-- / WITH CHECK (true) — the write-side counterpart of the read-side bug fixed
-- in 20260706200000. Confirmed via production query:
--   SELECT * FROM pg_policies WHERE tablename IN (...) AND roles = '{public}'
--     AND qual = 'true' AND cmd = 'UPDATE';
-- returned 9 rows ("Allow anon update on X"), meaning an unauthenticated
-- visitor can currently modify any row in these tables — more severe than
-- the read-visibility bug, since it allows tampering with live hazard data.
--
-- Legitimate writes to these tables happen exclusively through the
-- Node.js aggregator (service_role, bypasses RLS) and admin-authenticated
-- flows (manual entry / file import), neither of which needs a public
-- UPDATE policy. Drop them; no replacement policy is required.
-- =====================================================

DROP POLICY IF EXISTS "Allow anon update on earthquake" ON earthquake;
DROP POLICY IF EXISTS "Allow anon update on wildfire" ON wildfire;
DROP POLICY IF EXISTS "Allow anon update on flood" ON flood;
DROP POLICY IF EXISTS "Allow anon update on drought" ON drought;
DROP POLICY IF EXISTS "Allow anon update on tsunami" ON tsunami;
DROP POLICY IF EXISTS "Allow anon update on cyclone" ON cyclone;
DROP POLICY IF EXISTS "Allow anon update on volcano" ON volcano;
DROP POLICY IF EXISTS "Allow anon update on epidemic" ON epidemic;
DROP POLICY IF EXISTS "Allow anon update on food_security" ON food_security;

-- Not reported by the audit query (disaster table wasn't flagged), but
-- dropped defensively under the same naming pattern in case it exists —
-- DROP POLICY IF EXISTS is a no-op when the policy is absent.
DROP POLICY IF EXISTS "Allow anon update on disaster" ON disaster;
