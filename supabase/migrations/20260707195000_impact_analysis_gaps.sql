-- =====================================================
-- Impact Analysis Gaps (spec 034)
-- Covers: MHEWS-FR-0078/FR-0171 (critical infrastructure tagging),
--         MHEWS-FR-0020 (impact snapshot on CAP broadcast),
--         MHEWS-FR-0337/FR-0345 (sector/admin-boundary breakdown),
--         MHEWS-FR-0260 (data completeness score)
--
-- Additive only: compute_zonal_stats() and the exposure_datasets/
-- exposure_features/impact_scenarios schema from spec 008 are untouched.
-- =====================================================

-- ── US1: critical infrastructure / sector / admin-boundary tagging ─────────
ALTER TABLE exposure_features ADD COLUMN IF NOT EXISTS asset_category TEXT;
ALTER TABLE exposure_features ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE exposure_features ADD COLUMN IF NOT EXISTS admin_boundary_code TEXT;

CREATE INDEX IF NOT EXISTS idx_exposure_features_asset_category ON exposure_features (asset_category);

-- ── US2: impact_snapshots (frozen copy of the impact result at CAP broadcast time) ──
CREATE TABLE IF NOT EXISTS impact_snapshots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cap_draft_id         UUID NOT NULL REFERENCES cap_drafts(id) ON DELETE CASCADE,
  impact_scenario_id   UUID REFERENCES impact_scenarios(id) ON DELETE SET NULL,
  data_available       BOOLEAN NOT NULL,
  snapshot_data        JSONB,
  country_code         VARCHAR(2),
  org_id               UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impact_snapshots_cap_draft ON impact_snapshots (cap_draft_id);

ALTER TABLE impact_snapshots ENABLE ROW LEVEL SECURITY;

-- Read-only for everyone but super_admin: no INSERT/UPDATE/DELETE policy on
-- any role (FR-006 — a snapshot must never change after it's archived). Rows
-- are only ever written by archive_impact_snapshot(), a SECURITY DEFINER
-- trigger function which bypasses RLS entirely, same pattern as
-- log_table_change() (spec 007/029).
DROP POLICY IF EXISTS "super_admin_impact_snapshots_select" ON impact_snapshots;
CREATE POLICY "super_admin_impact_snapshots_select" ON impact_snapshots
  FOR SELECT USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_impact_snapshots_select" ON impact_snapshots;
CREATE POLICY "country_admin_impact_snapshots_select" ON impact_snapshots
  FOR SELECT USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS "org_admin_impact_snapshots_select" ON impact_snapshots;
CREATE POLICY "org_admin_impact_snapshots_select" ON impact_snapshots
  FOR SELECT USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
    AND org_id = current_profile_org_id()
  );

-- archive_impact_snapshot(): fires when a cap_drafts row transitions to
-- 'broadcast' (the same status transition notify_dispatch_on_broadcast()
-- already hooks, 20260707120200_cap_broadcast_dispatch_trigger.sql) and
-- copies the most recent matching impact_scenarios.result_snapshot into a
-- new, immutable impact_snapshots row. A separate trigger function (rather
-- than extending notify_dispatch_on_broadcast) keeps the pg_net dispatch
-- call and this DB-internal archival independent of each other.
CREATE OR REPLACE FUNCTION archive_impact_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  matched_scenario_id UUID;
  matched_snapshot     JSONB;
BEGIN
  SELECT id, result_snapshot INTO matched_scenario_id, matched_snapshot
  FROM impact_scenarios
  WHERE impact_scenarios.country_code IS NOT DISTINCT FROM NEW.country_code
    AND impact_scenarios.org_id IS NOT DISTINCT FROM NEW.org_id
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO impact_snapshots (cap_draft_id, impact_scenario_id, data_available, snapshot_data, country_code, org_id)
  VALUES (
    NEW.id,
    matched_scenario_id,
    matched_scenario_id IS NOT NULL,
    matched_snapshot,
    NEW.country_code,
    NEW.org_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_impact_snapshot ON cap_drafts;
CREATE TRIGGER trg_archive_impact_snapshot
  AFTER UPDATE OF status ON cap_drafts
  FOR EACH ROW
  WHEN (NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION archive_impact_snapshot();

-- ── US1: critical infrastructure features within the analysis radius ───────
-- A dedicated function (not an extension of get_intersecting_features'
-- signature, spec 008) so existing callers of that function are unaffected.
CREATE OR REPLACE FUNCTION get_critical_infrastructure_features(
  dataset_id UUID,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION
)
RETURNS TABLE(id UUID, geom_geojson TEXT, metric_value DOUBLE PRECISION, asset_category TEXT, properties JSONB)
LANGUAGE sql STABLE AS $$
  SELECT
    exposure_features.id,
    ST_AsGeoJSON(geom) AS geom_geojson,
    exposure_features.metric_value,
    exposure_features.asset_category,
    exposure_features.properties
  FROM exposure_features
  WHERE exposure_features.dataset_id = get_critical_infrastructure_features.dataset_id
    AND exposure_features.asset_category LIKE 'critical_infrastructure_%'
    AND ST_DWithin(
      geom::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
      radius_km * 1000
    );
$$;

-- ── US3: sector / admin-boundary breakdown (compute_zonal_stats untouched) ──
CREATE OR REPLACE FUNCTION compute_sector_breakdown(
  dataset_id UUID,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION
)
RETURNS TABLE(group_key TEXT, total_value DOUBLE PRECISION, feature_count INTEGER)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(sector, 'unclassified') AS group_key,
    COALESCE(SUM(metric_value), 0)::DOUBLE PRECISION AS total_value,
    COUNT(*)::INTEGER AS feature_count
  FROM exposure_features
  WHERE exposure_features.dataset_id = compute_sector_breakdown.dataset_id
    AND ST_DWithin(
      geom::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
      radius_km * 1000
    )
  GROUP BY COALESCE(sector, 'unclassified');
$$;

CREATE OR REPLACE FUNCTION compute_boundary_breakdown(
  dataset_id UUID,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION
)
RETURNS TABLE(group_key TEXT, total_value DOUBLE PRECISION, feature_count INTEGER)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(admin_boundary_code, 'unclassified') AS group_key,
    COALESCE(SUM(metric_value), 0)::DOUBLE PRECISION AS total_value,
    COUNT(*)::INTEGER AS feature_count
  FROM exposure_features
  WHERE exposure_features.dataset_id = compute_boundary_breakdown.dataset_id
    AND ST_DWithin(
      geom::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
      radius_km * 1000
    )
  GROUP BY COALESCE(admin_boundary_code, 'unclassified');
$$;

-- ── US4: data completeness score ────────────────────────────────────────────
-- Note: metric_value is NOT NULL by schema (spec 008) so it can never be the
-- source of "missing data" here — completeness instead measures how much of
-- the newly-added sector/asset_category tagging is filled in, since that is
-- what US1/US3's breakdowns actually depend on (research.md Decision 3).
CREATE OR REPLACE FUNCTION compute_data_completeness(
  dataset_id UUID,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION
)
RETURNS TABLE(total_features INTEGER, tagged_features INTEGER, completeness_ratio DOUBLE PRECISION)
LANGUAGE sql STABLE AS $$
  SELECT
    COUNT(*)::INTEGER AS total_features,
    COUNT(*) FILTER (WHERE sector IS NOT NULL OR asset_category IS NOT NULL)::INTEGER AS tagged_features,
    CASE WHEN COUNT(*) = 0 THEN NULL
         ELSE (COUNT(*) FILTER (WHERE sector IS NOT NULL OR asset_category IS NOT NULL))::DOUBLE PRECISION / COUNT(*)::DOUBLE PRECISION
    END AS completeness_ratio
  FROM exposure_features
  WHERE exposure_features.dataset_id = compute_data_completeness.dataset_id
    AND ST_DWithin(
      geom::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
      radius_km * 1000
    );
$$;
