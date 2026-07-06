-- =====================================================
-- Admin Panel Capability Grants (spec 018)
-- Covers: FR-001 through FR-011
--
-- Scoped, additive alternative to a full configurable-permission redesign
-- (MHEWS-FR-0136). Does NOT touch profiles.role, current_profile_role(), or
-- any of the ~50+ existing role-keyed RLS policies elsewhere in this project
-- (verified by codebase audit before this spec was written) — it only adds
-- a new opt-in layer letting a super_admin delegate one or more of 4 named
-- admin areas (Hazard Taxonomy, SOP Repository, Map Layers, Audit) to an
-- individual country_admin/org_admin user, without promoting them.
-- =====================================================

CREATE TABLE IF NOT EXISTS profile_capability_grants (
  profile_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  capability  TEXT        NOT NULL CHECK (capability IN ('hazard_taxonomy', 'sop_repository', 'map_layers', 'audit')),
  granted_by  UUID        NOT NULL REFERENCES profiles(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, capability)
);

-- ── FR-003: only country_admin/org_admin may be a grant target, enforced at
--    the DB layer (not just the admin UI) — mirrors the existing
--    prevent_self_role_escalation() trigger's style for role-adjacent guards.
CREATE OR REPLACE FUNCTION prevent_invalid_capability_grantee()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_role TEXT;
BEGIN
  SELECT role INTO target_role FROM profiles WHERE id = NEW.profile_id;
  IF target_role IS NULL OR target_role NOT IN ('country_admin', 'org_admin') THEN
    RAISE EXCEPTION 'capability grants may only target country_admin or org_admin profiles (got %)', target_role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invalid_capability_grantee ON profile_capability_grants;
CREATE TRIGGER trg_prevent_invalid_capability_grantee
  BEFORE INSERT ON profile_capability_grants
  FOR EACH ROW EXECUTE FUNCTION prevent_invalid_capability_grantee();

-- ── New helper function, mirrors current_profile_role()'s suspension
--    short-circuit exactly, but is a wholly independent choke point used
--    only by the new additive policies below — current_profile_role() is
--    untouched.
CREATE OR REPLACE FUNCTION current_profile_has_capability(cap TEXT) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profile_capability_grants g
    JOIN profiles p ON p.id = g.profile_id
    WHERE g.profile_id = auth.uid() AND g.capability = cap AND p.is_active
  )
$$;

-- ── RLS on profile_capability_grants itself ─────────────────────────────────
ALTER TABLE profile_capability_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_capability_grants_all" ON profile_capability_grants;
CREATE POLICY "super_admin_capability_grants_all" ON profile_capability_grants
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "self_read_own_capability_grants" ON profile_capability_grants;
CREATE POLICY "self_read_own_capability_grants" ON profile_capability_grants
  FOR SELECT USING (profile_id = auth.uid());

-- ── Additive policies on the 4 covered tables — none of the existing
--    super_admin_* policies below are modified or removed; each of these is
--    a brand new CREATE POLICY that ORs in alongside them (Postgres RLS
--    policies are OR'd together within the same command type).
DROP POLICY IF EXISTS "capability_granted_hazard_taxonomy_all" ON hazard_types;
CREATE POLICY "capability_granted_hazard_taxonomy_all" ON hazard_types
  FOR ALL USING (current_profile_has_capability('hazard_taxonomy'));

DROP POLICY IF EXISTS "capability_granted_hazard_thresholds_all" ON hazard_thresholds;
CREATE POLICY "capability_granted_hazard_thresholds_all" ON hazard_thresholds
  FOR ALL USING (current_profile_has_capability('hazard_taxonomy'));

DROP POLICY IF EXISTS "capability_granted_sop_repository_all" ON sop_documents;
CREATE POLICY "capability_granted_sop_repository_all" ON sop_documents
  FOR ALL USING (current_profile_has_capability('sop_repository'));

DROP POLICY IF EXISTS "capability_granted_map_layers_all" ON map_layers;
CREATE POLICY "capability_granted_map_layers_all" ON map_layers
  FOR ALL USING (current_profile_has_capability('map_layers'));

-- audit_log has no write path via RLS today (INSERT is trigger-only via
-- log_table_change(), UPDATE/DELETE are hard-denied) — this grant is
-- read-only, matching super_admin_read_audit's own scope exactly.
DROP POLICY IF EXISTS "capability_granted_audit_read" ON audit_log;
CREATE POLICY "capability_granted_audit_read" ON audit_log
  FOR SELECT USING (current_profile_has_capability('audit'));
