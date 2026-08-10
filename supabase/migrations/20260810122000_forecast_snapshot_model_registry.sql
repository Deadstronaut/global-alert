-- =====================================================
-- Forecast Model Registry Fields (spec 059)
--
-- forecast_snapshots (spec 055) has never recorded which model
-- cycle/version produced a row, nor any confidence signal — every row looks
-- equally authoritative regardless of lead time. Adds two nullable columns;
-- existing rows stay NULL (no backfill), new rows populated by
-- wind-importer/main.py going forward. Additive only.
-- =====================================================

ALTER TABLE forecast_snapshots
  ADD COLUMN IF NOT EXISTS model_version    TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score DOUBLE PRECISION CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));

COMMENT ON COLUMN forecast_snapshots.model_version IS
  'Identifies the source model + issuance cycle, e.g. "GFS 2026081006Z" — lets two snapshots for the same (variable, valid_at) from different cycles be told apart.';
COMMENT ON COLUMN forecast_snapshots.confidence_score IS
  'Heuristic 0-1 forecast-skill proxy that decreases with lead time (forecast_step_hours) — not a model-native ensemble spread (GFS deterministic runs carry none), documented as a lead-time heuristic in wind-importer/main.py.';
