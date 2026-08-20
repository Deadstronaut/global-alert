-- =====================================================
-- exposure_feature_h3_cells — vector-layer H3 correlation index
-- (spec-less follow-up, 2026-08-20: "bütün katmanlar h3 hücresi
-- korelasyonuyla çalışmalı... vektör katmanlara adaptörle adapte etmemiz
-- gerekiyor").
--
-- Every disaster event already carries an h3_id (server/src/processors/
-- normalizer.js, resolution 7) and every RASTER exposure source already
-- gets one h3 cell per pixel (rasterToHexagon.ts — the hexagon IS the
-- feature's own geom there). This table is the missing piece for VECTOR
-- exposure sources (HydroBASINS polygons, HydroRivers lines, OSM buildings)
-- whose real, precise geometry stays exactly as-is in exposure_features.geom
-- — this is a purely additive lookup index alongside it (populated by
-- supabase/functions/shared/vectorToH3.ts via writeExposureDataset.ts), not
-- a replacement for the geometry or for cascade_rules' own ST_Distance
-- proximity checks (spec 048), which remain the more precise mechanism for
-- "how far is this event from the nearest feature". This table answers a
-- different, complementary question — "what vector features does THIS h3
-- cell touch" — in one indexed join, the same shape as how
-- get_aggregated_disasters already groups events by h3_id.
--
-- One row per (feature, cell) pair — a polygon/line feature spans many
-- cells, so this is intentionally NOT one-row-per-feature.
-- =====================================================

CREATE TABLE IF NOT EXISTS exposure_feature_h3_cells (
  id          BIGSERIAL PRIMARY KEY,
  feature_id  UUID NOT NULL REFERENCES exposure_features(id) ON DELETE CASCADE,
  dataset_id  UUID NOT NULL REFERENCES exposure_datasets(id) ON DELETE CASCADE,
  h3_cell     TEXT NOT NULL
);

-- The actual correlation lookup: "which features touch h3 cell X".
CREATE INDEX IF NOT EXISTS idx_exposure_feature_h3_cells_cell ON exposure_feature_h3_cells (h3_cell);
-- Cascade delete support + re-import cleanup (writeExposureDataset.ts
-- deletes the superseded dataset's exposure_features, which cascades here).
CREATE INDEX IF NOT EXISTS idx_exposure_feature_h3_cells_dataset ON exposure_feature_h3_cells (dataset_id);
-- Re-running the h3 adapter for an already-indexed feature (e.g. a retried
-- backfill) must never duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_exposure_feature_h3_cells_feature_cell
  ON exposure_feature_h3_cells (feature_id, h3_cell);

ALTER TABLE exposure_feature_h3_cells ENABLE ROW LEVEL SECURITY;

-- Same visibility rule as exposure_features itself (20260706170000) — this
-- index reveals exactly the same "which cells does this dataset cover"
-- information the real geometry already does, so it inherits the identical
-- role-scoping, not a separate/looser policy.
DROP POLICY IF EXISTS "exposure_feature_h3_cells_visible_with_dataset" ON exposure_feature_h3_cells;
CREATE POLICY "exposure_feature_h3_cells_visible_with_dataset" ON exposure_feature_h3_cells
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM exposure_datasets d
      WHERE d.id = exposure_feature_h3_cells.dataset_id
        AND (
          current_profile_role() = 'super_admin'
          OR (current_profile_role() = 'country_admin' AND d.country_code = current_profile_country_code())
          OR (current_profile_role() = 'org_admin' AND d.country_code = current_profile_country_code() AND d.org_id = current_profile_org_id())
        )
    )
  );

-- ── find_exposure_features_at_h3_cells ──────────────────────────────────
-- Cross-hazard correlation entry point: given a hazard event's own h3_id
-- (and its k-ring neighbors, computed client/edge-function-side via h3-js's
-- gridDisk — same as lateralRiskRules.js already does for event-to-event
-- correlation), which vector exposure features does that cell set touch.
-- STABLE + SECURITY DEFINER so it's callable the same way
-- evaluate_cascade_rules() already is, regardless of the caller's RLS
-- context (an anon dashboard view included).
CREATE OR REPLACE FUNCTION find_exposure_features_at_h3_cells(
  p_h3_cells TEXT[],
  p_source_names TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  feature_id UUID,
  dataset_id UUID,
  source_name TEXT,
  country_code VARCHAR(2),
  metric_value DOUBLE PRECISION,
  properties JSONB,
  matched_h3_cells TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ef.id,
    ef.dataset_id,
    ed.source_name,
    ed.country_code,
    ef.metric_value,
    ef.properties,
    array_agg(DISTINCT hc.h3_cell)
  FROM exposure_feature_h3_cells hc
  JOIN exposure_features ef ON ef.id = hc.feature_id
  JOIN exposure_datasets ed ON ed.id = ef.dataset_id
  WHERE hc.h3_cell = ANY(p_h3_cells)
    AND (p_source_names IS NULL OR ed.source_name = ANY(p_source_names))
  GROUP BY ef.id, ef.dataset_id, ed.source_name, ed.country_code, ef.metric_value, ef.properties
  LIMIT 500;
$$;
