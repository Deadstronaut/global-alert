-- Spec 020: Regional Hazard Threshold Overrides
-- Purely additive — hazard_types/hazard_thresholds and their existing consumers
-- (spec 010) are untouched. Adds a country-scoped override table, reusing the
-- existing breakpoints-validation and updated_at triggers, and reusing
-- current_profile_country_code() (spec 004/010) and current_profile_has_capability()
-- (spec 018) for RLS rather than introducing a new access-control concept.

CREATE TABLE IF NOT EXISTS hazard_threshold_overrides (
  hazard_type_code TEXT NOT NULL REFERENCES hazard_types(code) ON DELETE CASCADE,
  country_code VARCHAR(2) NOT NULL,
  metric_name TEXT,
  unit TEXT,
  breakpoints JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hazard_type_code, country_code)
);

DROP TRIGGER IF EXISTS validate_hazard_threshold_overrides_breakpoints ON hazard_threshold_overrides;
CREATE TRIGGER validate_hazard_threshold_overrides_breakpoints
  BEFORE INSERT OR UPDATE ON hazard_threshold_overrides
  FOR EACH ROW EXECUTE FUNCTION validate_hazard_breakpoints();

DROP TRIGGER IF EXISTS set_hazard_threshold_overrides_updated_at ON hazard_threshold_overrides;
CREATE TRIGGER set_hazard_threshold_overrides_updated_at
  BEFORE UPDATE ON hazard_threshold_overrides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE hazard_threshold_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS super_admin_hazard_overrides_all ON hazard_threshold_overrides;
CREATE POLICY super_admin_hazard_overrides_all ON hazard_threshold_overrides
  FOR ALL
  USING (current_profile_role() = 'super_admin')
  WITH CHECK (current_profile_role() = 'super_admin');

-- Purely capability-gated (FR-006): holding the base country_admin/org_admin
-- role alone is NOT sufficient — matches spec 018's tab-visibility gate and
-- spec 010's own super-admin-only global registry RLS. WITH CHECK mirrors
-- USING so a write cannot target a different country even via a crafted
-- request bypassing the UI's own country lock (FR-008).
DROP POLICY IF EXISTS country_scoped_hazard_overrides_manage ON hazard_threshold_overrides;
CREATE POLICY country_scoped_hazard_overrides_manage ON hazard_threshold_overrides
  FOR ALL
  USING (
    current_profile_has_capability('hazard_taxonomy')
    AND country_code = current_profile_country_code()
  )
  WITH CHECK (
    current_profile_has_capability('hazard_taxonomy')
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS read_hazard_overrides ON hazard_threshold_overrides;
CREATE POLICY read_hazard_overrides ON hazard_threshold_overrides
  FOR SELECT
  TO authenticated
  USING (true);
