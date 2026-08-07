-- Short-range (15-day) deterministic forecast snapshots — spec 055 US1.
-- See specs/055-hazard-forecasting-dashboard/data-model.md's ForecastSnapshot
-- entity for the full field rationale. Sibling table to overlay_snapshots
-- (20260805120000_overlay_snapshots.sql) — same texture-storage shape,
-- since this is a continuous scalar field rendered as a pre-colored PNG,
-- distinguished from the nowcast overlay by adding forecast_step_hours/
-- valid_at (the "which future day is this" axis overlay_snapshots has no
-- need for).

CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variable               TEXT NOT NULL CHECK (variable IN ('wind_speed', 'precipitation', 'temperature')),
  forecast_step_hours    INTEGER NOT NULL CHECK (forecast_step_hours > 0),
  valid_at               TIMESTAMPTZ NOT NULL,
  issued_at              TIMESTAMPTZ NOT NULL,
  imported_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  texture_storage_path   TEXT NOT NULL,
  value_min              DOUBLE PRECISION NOT NULL,
  value_max              DOUBLE PRECISION NOT NULL,
  bounds                 DOUBLE PRECISION[4] NOT NULL, -- [west, south, east, north]
  source_name            TEXT NOT NULL,
  CHECK (value_min <= value_max)
);

-- "Latest cycle's step set" lookup (contracts/forecast-read-contract.md's
-- `.eq('variable', ...).gte('issued_at', latestCycleFloor).order('forecast_step_hours')`).
CREATE INDEX IF NOT EXISTS idx_forecast_snapshots_variable_issued_at
  ON forecast_snapshots (variable, issued_at DESC);

-- "Which step is this forecast for" lookup, used by the day-by-day panel view.
CREATE INDEX IF NOT EXISTS idx_forecast_snapshots_variable_valid_at
  ON forecast_snapshots (variable, valid_at);

ALTER TABLE forecast_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read, same convention as flow_snapshots/overlay_snapshots — global
-- weather forecast data, no per-country/tenant sensitivity.
DROP POLICY IF EXISTS "public_read_forecast_snapshots" ON forecast_snapshots;
CREATE POLICY "public_read_forecast_snapshots" ON forecast_snapshots
  FOR SELECT USING (true);

-- Write: service-role only (the forecast-15d-importer-scheduled container) —
-- no authenticated/anon INSERT policy, same as flow_snapshots/overlay_snapshots.

DROP TRIGGER IF EXISTS audit_forecast_snapshots ON forecast_snapshots;
CREATE TRIGGER audit_forecast_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON forecast_snapshots
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── Storage: forecast-snapshots bucket ──────────────────────────────────────
-- Public-read (frontend loads the PNG texture directly), write restricted
-- to the service-role client inside wind-importer — same shape as
-- overlay-snapshots' bucket policy.
INSERT INTO storage.buckets (id, name, public)
VALUES ('forecast-snapshots', 'forecast-snapshots', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_forecast_snapshots_storage" ON storage.objects;
CREATE POLICY "public_read_forecast_snapshots_storage" ON storage.objects
  FOR SELECT USING (bucket_id = 'forecast-snapshots');
