-- =====================================================
-- Fix: infinite recursion in profiles/organizations RLS policies
--
-- Root cause: "super_admin_read_all_profiles" (20260603_profiles.sql) queries
-- `profiles` from within a policy defined ON `profiles` itself. Reading any
-- profiles row that isn't the caller's own (id <> auth.uid()) forces Postgres
-- to re-evaluate that same policy, which queries profiles again -> infinite
-- recursion ("infinite recursion detected in policy for relation profiles").
-- This also transitively broke every OTHER table whose policy checks the
-- caller's role via `EXISTS (SELECT 1 FROM profiles WHERE ...)`, including
-- `organizations` (20260603_organizations.sql) and, before this fix, the new
-- `data_sources`/`source_state_transitions`/`rejected_payloads` tables
-- (20260703_data_sources.sql — already fixed there via current_profile_role()).
--
-- Confirmed via local isolated Postgres testing (not run against production).
-- Fix: route all "is the caller an admin?" checks through current_profile_role(),
-- a SECURITY DEFINER function whose internal profiles lookup runs as the
-- function owner (bypasses RLS), breaking the recursive cycle.
-- =====================================================

-- Reuse the helper defined in 20260703_data_sources.sql (idempotent redefinition
-- here too, in case this migration is ever applied to a DB without that one).
CREATE OR REPLACE FUNCTION current_profile_role() RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- ── profiles ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "super_admin_read_all_profiles" ON profiles;
CREATE POLICY "super_admin_read_all_profiles" ON profiles
  FOR SELECT USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "super_admin_update_profiles" ON profiles;
CREATE POLICY "super_admin_update_profiles" ON profiles
  FOR UPDATE USING (current_profile_role() = 'super_admin');

-- ── organizations ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "super_admin_read_all_orgs" ON organizations;
CREATE POLICY "super_admin_read_all_orgs" ON organizations
  FOR SELECT USING (current_profile_role() = 'super_admin');

-- "country_users_read_own_country_orgs" (20260603_organizations.sql) only reads
-- the CALLER's own profiles row (p.id = auth.uid()), which the non-recursive
-- "users_read_own_profile" policy already satisfies — no change needed there.
