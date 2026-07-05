-- =====================================================
-- Impact Analysis & Exposure Modelling (spec 008)
--
-- Enables PostGIS (a Postgres extension, not a new service — Principle VIII)
-- and adds real spatial storage for uploaded exposure datasets (e.g.
-- population density), plus a zonal-statistics RPC used to compute exposure
-- sums within a hazard event's affected area, and a scenario-save table.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── exposure_datasets ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exposure_datasets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT,
  metric_property_name  TEXT NOT NULL,
  feature_count         INTEGER NOT NULL DEFAULT 0,
  country_code          VARCHAR(2),
  org_id                UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exposure_datasets_country ON exposure_datasets (country_code);

ALTER TABLE exposure_datasets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_exposure_datasets_all" ON exposure_datasets;
CREATE POLICY "super_admin_exposure_datasets_all" ON exposure_datasets
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_exposure_datasets_own" ON exposure_datasets;
CREATE POLICY "country_admin_exposure_datasets_own" ON exposure_datasets
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS "org_admin_exposure_datasets_own" ON exposure_datasets;
CREATE POLICY "org_admin_exposure_datasets_own" ON exposure_datasets
  FOR ALL USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
    AND org_id = current_profile_org_id()
  );

DROP TRIGGER IF EXISTS audit_exposure_datasets ON exposure_datasets;
CREATE TRIGGER audit_exposure_datasets
  AFTER INSERT OR UPDATE OR DELETE ON exposure_datasets
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── exposure_features ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exposure_features (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id    UUID NOT NULL REFERENCES exposure_datasets(id) ON DELETE CASCADE,
  geom          geometry(Geometry, 4326) NOT NULL,
  metric_value  DOUBLE PRECISION NOT NULL,
  properties    JSONB
);

CREATE INDEX IF NOT EXISTS idx_exposure_features_geom ON exposure_features USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_exposure_features_dataset ON exposure_features (dataset_id);

ALTER TABLE exposure_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exposure_features_visible_with_dataset" ON exposure_features;
CREATE POLICY "exposure_features_visible_with_dataset" ON exposure_features
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM exposure_datasets d
      WHERE d.id = exposure_features.dataset_id
        AND (
          current_profile_role() = 'super_admin'
          OR (current_profile_role() = 'country_admin' AND d.country_code = current_profile_country_code())
          OR (current_profile_role() = 'org_admin' AND d.country_code = current_profile_country_code() AND d.org_id = current_profile_org_id())
        )
    )
  );

-- ── impact_scenarios ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS impact_scenarios (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  hazard_event_snapshot  JSONB NOT NULL,
  exposure_dataset_id    UUID REFERENCES exposure_datasets(id) ON DELETE SET NULL,
  radius_km_override     DOUBLE PRECISION,
  result_snapshot        JSONB,
  country_code           VARCHAR(2),
  org_id                 UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE impact_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_impact_scenarios_all" ON impact_scenarios;
CREATE POLICY "super_admin_impact_scenarios_all" ON impact_scenarios
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_impact_scenarios_own" ON impact_scenarios;
CREATE POLICY "country_admin_impact_scenarios_own" ON impact_scenarios
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS "org_admin_impact_scenarios_own" ON impact_scenarios;
CREATE POLICY "org_admin_impact_scenarios_own" ON impact_scenarios
  FOR ALL USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
    AND org_id = current_profile_org_id()
  );

DROP TRIGGER IF EXISTS audit_impact_scenarios ON impact_scenarios;
CREATE TRIGGER audit_impact_scenarios
  AFTER INSERT OR UPDATE OR DELETE ON impact_scenarios
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── compute_zonal_stats: sum metric_value within radius_km of a point ───────
CREATE OR REPLACE FUNCTION compute_zonal_stats(
  dataset_id UUID,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION
)
RETURNS TABLE(total_value DOUBLE PRECISION, feature_count INTEGER)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(SUM(metric_value), 0)::DOUBLE PRECISION AS total_value,
    COUNT(*)::INTEGER AS feature_count
  FROM exposure_features
  WHERE exposure_features.dataset_id = compute_zonal_stats.dataset_id
    AND ST_DWithin(
      geom::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
      radius_km * 1000
    );
$$;

-- ── get_intersecting_features: per-feature rows for GeoJSON export ─────────
CREATE OR REPLACE FUNCTION get_intersecting_features(
  dataset_id UUID,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION
)
RETURNS TABLE(id UUID, geom_geojson TEXT, metric_value DOUBLE PRECISION, properties JSONB)
LANGUAGE sql STABLE AS $$
  SELECT
    exposure_features.id,
    ST_AsGeoJSON(geom) AS geom_geojson,
    exposure_features.metric_value,
    exposure_features.properties
  FROM exposure_features
  WHERE exposure_features.dataset_id = get_intersecting_features.dataset_id
    AND ST_DWithin(
      geom::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
      radius_km * 1000
    );
$$;
