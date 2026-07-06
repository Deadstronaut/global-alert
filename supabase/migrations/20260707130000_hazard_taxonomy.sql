-- =====================================================
-- Hazard Taxonomy Admin (spec 010)
-- Covers: FR-001 through FR-012
--
-- Fixes an existing Constitution Principle I violation: hazard types and
-- their severity thresholds were hardcoded and duplicated across 6+
-- frontend files (ContactFormModal.vue, FileImportForm.vue,
-- ManualEntryForm.vue, SourceFormModal.vue, CapView.vue, IncidentsView.vue)
-- plus src/utils/severity.js. This is a GLOBAL (not country-scoped)
-- registry — hazard taxonomy is shared across every tenant, unlike
-- contacts/sources/boundaries which are per-country.
--
-- Zero-regression requirement (FR-007/FR-009/SC-003): the seed data below
-- reproduces src/utils/severity.js's SEVERITY_FN map exactly for the 5
-- hazard types that have one today (earthquake, wildfire, flood, drought,
-- food_security); the other 4 production hazard types (tsunami, cyclone,
-- volcano, epidemic) are seeded with an EMPTY breakpoints array, matching
-- their current behavior of falling through to severity.js's existing
-- `?? (() => 'low')` fallback — they were never in SEVERITY_FN to begin
-- with, so inventing thresholds for them here would itself be a regression.
-- =====================================================

CREATE TABLE IF NOT EXISTS hazard_types (
  code          TEXT        PRIMARY KEY,
  display_name  TEXT        NOT NULL,
  category      TEXT        NOT NULL CHECK (category IN ('meteo','hydro','geo','bio','tech')),
  description   TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS hazard_types_updated_at ON hazard_types;
CREATE TRIGGER hazard_types_updated_at
  BEFORE UPDATE ON hazard_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hazard_thresholds (
  hazard_type_code  TEXT        PRIMARY KEY REFERENCES hazard_types(code) ON DELETE CASCADE,
  metric_name       TEXT        NOT NULL,
  unit              TEXT,
  breakpoints       JSONB       NOT NULL DEFAULT '[]',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS hazard_thresholds_updated_at ON hazard_thresholds;
CREATE TRIGGER hazard_thresholds_updated_at
  BEFORE UPDATE ON hazard_thresholds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── FR-006: reject non-ascending breakpoints server-side (defense in depth
--    behind the admin form's own client-side check) ─────────────────────────
CREATE OR REPLACE FUNCTION validate_hazard_breakpoints()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  prev_min NUMERIC := NULL;
  bp JSONB;
BEGIN
  FOR bp IN SELECT * FROM jsonb_array_elements(NEW.breakpoints) LOOP
    IF prev_min IS NOT NULL AND (bp->>'min_value')::NUMERIC <= prev_min THEN
      RAISE EXCEPTION 'invalid_breakpoints: min_value must be strictly ascending (got % after %)', bp->>'min_value', prev_min;
    END IF;
    prev_min := (bp->>'min_value')::NUMERIC;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_hazard_breakpoints ON hazard_thresholds;
CREATE TRIGGER trg_validate_hazard_breakpoints
  BEFORE INSERT OR UPDATE ON hazard_thresholds
  FOR EACH ROW EXECUTE FUNCTION validate_hazard_breakpoints();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE hazard_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hazard_thresholds ENABLE ROW LEVEL SECURITY;

-- Global taxonomy — super_admin only for writes (narrower than the usual
-- super_admin/country_admin/org_admin tiering used elsewhere in this app,
-- because this data is genuinely global, not tenant-scoped). No hard-delete
-- policy is granted to any role in this phase (FR-003) — deactivation only.
DROP POLICY IF EXISTS "super_admin_hazard_types_all" ON hazard_types;
CREATE POLICY "super_admin_hazard_types_all" ON hazard_types
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "read_active_hazard_types" ON hazard_types;
CREATE POLICY "read_active_hazard_types" ON hazard_types
  FOR SELECT TO authenticated USING (
    is_active OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "super_admin_hazard_thresholds_all" ON hazard_thresholds;
CREATE POLICY "super_admin_hazard_thresholds_all" ON hazard_thresholds
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "read_active_hazard_thresholds" ON hazard_thresholds;
CREATE POLICY "read_active_hazard_thresholds" ON hazard_thresholds
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM hazard_types h WHERE h.code = hazard_thresholds.hazard_type_code AND h.is_active)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Audit trail, same pattern as every other admin-managed table.
DROP TRIGGER IF EXISTS audit_hazard_types ON hazard_types;
CREATE TRIGGER audit_hazard_types
  AFTER INSERT OR UPDATE OR DELETE ON hazard_types
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

DROP TRIGGER IF EXISTS audit_hazard_thresholds ON hazard_thresholds;
CREATE TRIGGER audit_hazard_thresholds
  AFTER INSERT OR UPDATE OR DELETE ON hazard_thresholds
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── Seed data (FR-009) — the 9 hazard types already in production use ───────
INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('earthquake',    'Earthquake',    'geo',   'Seismic events measured by magnitude'),
  ('wildfire',      'Wildfire',      'meteo', 'Fire radiative power detected via satellite'),
  ('flood',         'Flood',         'hydro', 'River/coastal flood level events'),
  ('drought',       'Drought',       'hydro', 'Drought severity index events'),
  ('food_security', 'Food Security', 'bio',   'IPC food insecurity phase classification'),
  ('tsunami',       'Tsunami',       'geo',   'Tsunami wave events'),
  ('cyclone',       'Cyclone',       'meteo', 'Tropical cyclone/storm events'),
  ('volcano',       'Volcano',       'geo',   'Volcanic activity events'),
  ('epidemic',      'Epidemic',      'bio',   'Disease outbreak events')
ON CONFLICT (code) DO NOTHING;

-- Reproduces src/utils/severity.js's SEVERITY_FN exactly (research.md §2).
INSERT INTO hazard_thresholds (hazard_type_code, metric_name, unit, breakpoints) VALUES
  ('earthquake', 'magnitude', 'Mw', '[
    {"min_value": 0,   "severity": "minimal"},
    {"min_value": 2.5, "severity": "low"},
    {"min_value": 4.0, "severity": "moderate"},
    {"min_value": 5.5, "severity": "high"},
    {"min_value": 7.0, "severity": "critical"}
  ]'::jsonb),
  ('wildfire', 'frp', 'MW', '[
    {"min_value": 0,   "severity": "minimal"},
    {"min_value": 10,  "severity": "low"},
    {"min_value": 50,  "severity": "moderate"},
    {"min_value": 200, "severity": "high"},
    {"min_value": 500, "severity": "critical"}
  ]'::jsonb),
  ('flood', 'level', NULL, '[
    {"min_value": 0, "severity": "minimal"},
    {"min_value": 1, "severity": "low"},
    {"min_value": 2, "severity": "moderate"},
    {"min_value": 3, "severity": "high"},
    {"min_value": 4, "severity": "critical"}
  ]'::jsonb),
  ('drought', 'level', NULL, '[
    {"min_value": 0, "severity": "low"},
    {"min_value": 2, "severity": "moderate"},
    {"min_value": 3, "severity": "high"},
    {"min_value": 4, "severity": "critical"}
  ]'::jsonb),
  ('food_security', 'phase', 'IPC', '[
    {"min_value": 0, "severity": "minimal"},
    {"min_value": 2, "severity": "low"},
    {"min_value": 3, "severity": "moderate"},
    {"min_value": 4, "severity": "high"},
    {"min_value": 5, "severity": "critical"}
  ]'::jsonb),
  -- Not in today's SEVERITY_FN — empty breakpoints matches their existing
  -- fallback-to-'low' behavior exactly (research.md §2), not a regression.
  ('tsunami', 'height', 'm', '[]'::jsonb),
  ('cyclone', 'wind_speed', 'km/h', '[]'::jsonb),
  ('volcano', 'vei', NULL, '[]'::jsonb),
  ('epidemic', 'cases', NULL, '[]'::jsonb)
ON CONFLICT (hazard_type_code) DO NOTHING;
