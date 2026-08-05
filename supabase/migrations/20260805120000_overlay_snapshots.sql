-- Color-graded overlay snapshots (air quality, etc.) — spec 054 US2.
-- See specs/054-flow-visualization-modes/data-model.md's OverlaySnapshot
-- entity for the full field rationale. Deliberately a sibling table to
-- flow_snapshots, not a reused/overloaded row in it — the Overlay is a
-- scalar, pre-colored raster (research.md §4), a different shape than
-- flow_snapshots' vector decode-range columns (u_min/u_max/v_min/v_max).

CREATE TABLE IF NOT EXISTS overlay_snapshots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  overlay_type           TEXT NOT NULL CHECK (overlay_type IN ('air_quality_pm25')),
  issued_at              TIMESTAMPTZ NOT NULL,
  imported_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  texture_storage_path   TEXT NOT NULL,
  value_min              DOUBLE PRECISION NOT NULL,
  value_max              DOUBLE PRECISION NOT NULL,
  bounds                 DOUBLE PRECISION[4] NOT NULL, -- [west, south, east, north]
  source_name            TEXT NOT NULL,
  CHECK (value_min <= value_max)
);

-- "Current" snapshot per overlay_type = latest issued_at, same lookup
-- pattern as idx_flow_snapshots_layer_type_issued_at.
CREATE INDEX IF NOT EXISTS idx_overlay_snapshots_type_issued_at
  ON overlay_snapshots (overlay_type, issued_at DESC);

ALTER TABLE overlay_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read, same convention as flow_snapshots — global, not per-country/
-- tenant sensitive (data-model.md's Relationships note).
DROP POLICY IF EXISTS "public_read_overlay_snapshots" ON overlay_snapshots;
CREATE POLICY "public_read_overlay_snapshots" ON overlay_snapshots
  FOR SELECT USING (true);

-- Write: service-role only (the CAMS-fetching importer), same as
-- flow_snapshots — no authenticated/anon INSERT policy.

DROP TRIGGER IF EXISTS audit_overlay_snapshots ON overlay_snapshots;
CREATE TRIGGER audit_overlay_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON overlay_snapshots
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── Storage: overlay-snapshots bucket ───────────────────────────────────────
-- Public-read (frontend loads the pre-colored PNG directly as a MapLibre
-- raster source), write restricted to the service-role client — same shape
-- as flow-snapshots' bucket policy.
INSERT INTO storage.buckets (id, name, public)
VALUES ('overlay-snapshots', 'overlay-snapshots', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_overlay_snapshots_storage" ON storage.objects;
CREATE POLICY "public_read_overlay_snapshots_storage" ON storage.objects
  FOR SELECT USING (bucket_id = 'overlay-snapshots');
