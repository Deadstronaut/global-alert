-- Spec 021: Shelter Management
-- New, purely additive table — no existing table modified. Follows the exact
-- CRUD/RLS shape established for `contacts` (spec 009), with one deliberate
-- deviation: shelter capacity/status is life-safety information, so any
-- authenticated user (any role, any country) may read active shelters,
-- unlike contacts (never public) or even incidents' own country-scoped
-- viewer read policy.

CREATE TABLE IF NOT EXISTS shelters (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  name                TEXT        NOT NULL,
  country_code        VARCHAR(2)  NOT NULL,
  org_id              UUID        REFERENCES organizations(id) ON DELETE SET NULL,

  lat                 DOUBLE PRECISION,
  lng                 DOUBLE PRECISION,

  capacity_total       INTEGER     NOT NULL,
  capacity_occupied    INTEGER     NOT NULL DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'open',

  is_active           BOOLEAN     NOT NULL DEFAULT true,
  linked_incident_id  UUID        REFERENCES incidents(id) ON DELETE SET NULL,

  created_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- FR-003: total capacity must be positive
  CONSTRAINT chk_shelter_capacity_positive CHECK (capacity_total > 0),
  -- FR-002: occupancy can never exceed total capacity
  CONSTRAINT chk_shelter_capacity CHECK (capacity_occupied <= capacity_total),
  -- FR-001
  CONSTRAINT chk_shelter_status CHECK (status IN ('open', 'closed', 'full'))
);

CREATE INDEX IF NOT EXISTS idx_shelters_country  ON shelters (country_code);
CREATE INDEX IF NOT EXISTS idx_shelters_org       ON shelters (org_id);
CREATE INDEX IF NOT EXISTS idx_shelters_active    ON shelters (is_active);
CREATE INDEX IF NOT EXISTS idx_shelters_incident  ON shelters (linked_incident_id);

DROP TRIGGER IF EXISTS shelters_updated_at ON shelters;
CREATE TRIGGER shelters_updated_at
  BEFORE UPDATE ON shelters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE shelters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS super_admin_shelters_all ON shelters;
CREATE POLICY super_admin_shelters_all ON shelters
  FOR ALL USING (
    current_profile_role() = 'super_admin'
  );

-- country_admin/org_admin: SELECT/INSERT/UPDATE only within their own
-- country — deliberately NOT FOR ALL. FR-005 requires deactivation
-- (is_active = false), not hard delete, for these roles; only super_admin
-- may delete (mirrors contacts' spec 009 precedent).
DROP POLICY IF EXISTS country_scoped_shelters_select ON shelters;
CREATE POLICY country_scoped_shelters_select ON shelters
  FOR SELECT USING (
    current_profile_role() IN ('country_admin', 'org_admin')
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS country_scoped_shelters_insert ON shelters;
CREATE POLICY country_scoped_shelters_insert ON shelters
  FOR INSERT WITH CHECK (
    current_profile_role() IN ('country_admin', 'org_admin')
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS country_scoped_shelters_update ON shelters;
CREATE POLICY country_scoped_shelters_update ON shelters
  FOR UPDATE USING (
    current_profile_role() IN ('country_admin', 'org_admin')
    AND country_code = current_profile_country_code()
  );

-- FR-008: shelter availability is life-safety information — any signed-in
-- user (any role, any country) may read active shelters, unlike contacts
-- (never public) or incidents' own country-scoped viewer read policy.
DROP POLICY IF EXISTS authenticated_shelters_read ON shelters;
CREATE POLICY authenticated_shelters_read ON shelters
  FOR SELECT
  TO authenticated
  USING (is_active);

-- Audit trail, same pattern as every other admin-managed table.
DROP TRIGGER IF EXISTS audit_shelters ON shelters;
CREATE TRIGGER audit_shelters
  AFTER INSERT OR UPDATE OR DELETE ON shelters
  FOR EACH ROW EXECUTE FUNCTION log_table_change();
