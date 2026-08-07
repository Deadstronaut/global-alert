-- Medium/long-range (1-month, 3-month) probabilistic forecast outlooks —
-- spec 055 US2/US3. See specs/055-hazard-forecasting-dashboard/data-model.md's
-- ForecastOutlook entity for the full field rationale. Deliberately tabular,
-- not texture-backed like forecast_snapshots — CFSv2 output here is a
-- discrete per-region anomaly/likelihood class (research.md §3), not a
-- continuous field worth rendering as a map raster.
--
-- Not written by the US1 (15-day) MVP pass — this table is created now so
-- US2/US3's ingestion (T015-T022, a later implementation pass) has schema
-- ready, matching this feature's Setup phase (T001-T004 all land together).

CREATE TABLE IF NOT EXISTS forecast_outlooks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horizon                TEXT NOT NULL CHECK (horizon IN ('1mo', '3mo')),
  variable               TEXT NOT NULL CHECK (variable IN ('precipitation', 'temperature')),
  region_code            TEXT NOT NULL,
  classification         TEXT NOT NULL CHECK (classification IN ('below_normal', 'near_normal', 'above_normal')),
  confidence             DOUBLE PRECISION CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  valid_period_start     DATE NOT NULL,
  valid_period_end       DATE NOT NULL,
  issued_at              TIMESTAMPTZ NOT NULL,
  imported_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_name            TEXT NOT NULL,
  CHECK (valid_period_start <= valid_period_end)
);

-- Panel's primary lookup shape: "latest outlook for this horizon+region+variable"
-- (contracts/forecast-read-contract.md's `.eq('horizon',...).eq('region_code',...).order('issued_at', desc).limit(1)`).
CREATE INDEX IF NOT EXISTS idx_forecast_outlooks_lookup
  ON forecast_outlooks (horizon, region_code, variable, issued_at DESC);

ALTER TABLE forecast_outlooks ENABLE ROW LEVEL SECURITY;

-- Public read, same convention as forecast_snapshots/flow_snapshots/overlay_snapshots.
DROP POLICY IF EXISTS "public_read_forecast_outlooks" ON forecast_outlooks;
CREATE POLICY "public_read_forecast_outlooks" ON forecast_outlooks
  FOR SELECT USING (true);

-- Write: service-role only (the forecast-1mo/3mo-importer-scheduled containers) —
-- no authenticated/anon INSERT policy.

DROP TRIGGER IF EXISTS audit_forecast_outlooks ON forecast_outlooks;
CREATE TRIGGER audit_forecast_outlooks
  AFTER INSERT OR UPDATE OR DELETE ON forecast_outlooks
  FOR EACH ROW EXECUTE FUNCTION log_table_change();
