-- =====================================================
-- Country Risk Indices — INFORM Index (and similar yearly, country-level,
-- directly-published composite risk scores).
--
-- Previously flagged "not a code job" because INFORM has no API — it's a
-- static annual publication (a report/table), not something a poller can
-- fetch. Neither existing mechanism fits it:
--   - ManualEntryForm.vue only inserts single lat/lng hazard EVENTS into
--     the 9 per-hazard-type tables — no country-wide score concept.
--   - risk_indicators/risk_area_scores (20260714120000_risk_scenario_
--     modeling.sql) is a COMPUTED, sub-national, hazard-specific pipeline
--     (compute_risk_area_score RPC, requires underlying exposure_datasets
--     rows) — forcing INFORM's "one fixed number per country per year"
--     into that shape would be pure overhead for no benefit.
--
-- This is a small, directly-writable table instead — an admin (or a
-- country_admin for their own country) types the published INFORM
-- sub-scores in once a year.
--
-- RLS follows risk_indicators' exact pattern (same file, lines 35-56):
-- super_admin sees/writes everything, country_admin/org_admin only their
-- own country_code, NO anon/public read policy at all — INFORM's
-- Vulnerability/Lack-of-Coping-Capacity sub-scores are the same
-- sensitive-data category flagged for risk_indicators (spec 001's
-- data-privacy guardrail), so the same cautious default is kept.
-- =====================================================

CREATE TABLE IF NOT EXISTS country_risk_indices (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code                    VARCHAR(2) NOT NULL,
  year                            INT NOT NULL CHECK (year >= 1900 AND year <= 2200),
  hazard_exposure_score           DOUBLE PRECISION,
  vulnerability_score             DOUBLE PRECISION,
  lack_of_coping_capacity_score   DOUBLE PRECISION,
  composite_score                 DOUBLE PRECISION,
  source                          TEXT NOT NULL DEFAULT 'INFORM Index',
  notes                           TEXT,
  created_by                      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_code, year, source)
);

CREATE INDEX IF NOT EXISTS idx_country_risk_indices_country_year
  ON country_risk_indices (country_code, year DESC);

ALTER TABLE country_risk_indices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_country_risk_indices_all" ON country_risk_indices;
CREATE POLICY "super_admin_country_risk_indices_all" ON country_risk_indices
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_country_risk_indices_own" ON country_risk_indices;
CREATE POLICY "country_admin_country_risk_indices_own" ON country_risk_indices
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS "org_admin_country_risk_indices_own" ON country_risk_indices;
CREATE POLICY "org_admin_country_risk_indices_own" ON country_risk_indices
  FOR ALL USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
  );

DROP TRIGGER IF EXISTS audit_country_risk_indices ON country_risk_indices;
CREATE TRIGGER audit_country_risk_indices
  AFTER INSERT OR UPDATE OR DELETE ON country_risk_indices
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- Keep updated_at accurate on every edit, matching hazard_types_updated_at's
-- pattern (20260707130000_hazard_taxonomy.sql).
CREATE OR REPLACE FUNCTION touch_country_risk_indices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS country_risk_indices_updated_at ON country_risk_indices;
CREATE TRIGGER country_risk_indices_updated_at
  BEFORE UPDATE ON country_risk_indices
  FOR EACH ROW EXECUTE FUNCTION touch_country_risk_indices_updated_at();
