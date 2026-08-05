-- Wind / ocean-current flow-texture snapshots — spec 053.
-- See specs/053-wind-flow-visualization/data-model.md for the full field
-- rationale. Deliberately NOT exposure_features/exposure_datasets' shape
-- (one-row-per-hex scalar) — wind/current data is a vector field rendered
-- as an animated whole, not a per-location number, and is global rather
-- than per-country like every existing exposure layer (research.md §3).

CREATE TABLE IF NOT EXISTS flow_snapshots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_type             TEXT NOT NULL CHECK (layer_type IN ('wind', 'ocean_current')),
  issued_at              TIMESTAMPTZ NOT NULL,
  imported_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  texture_storage_path   TEXT NOT NULL,
  u_min                  DOUBLE PRECISION NOT NULL,
  u_max                  DOUBLE PRECISION NOT NULL,
  v_min                  DOUBLE PRECISION NOT NULL,
  v_max                  DOUBLE PRECISION NOT NULL,
  bounds                 DOUBLE PRECISION[4] NOT NULL, -- [west, south, east, north]
  source_name            TEXT NOT NULL,
  CHECK (u_min <= u_max),
  CHECK (v_min <= v_max)
);

-- "Current" snapshot per layer_type = latest issued_at — this index makes
-- that lookup (contracts/flow-snapshot-contract.md's
-- `ORDER BY issued_at DESC LIMIT 1`) cheap without a separate status column.
CREATE INDEX IF NOT EXISTS idx_flow_snapshots_layer_type_issued_at
  ON flow_snapshots (layer_type, issued_at DESC);

ALTER TABLE flow_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read, same convention as the earthquake/wildfire/etc. hazard
-- tables (20260410_rls.sql) — this data has no per-country/tenant
-- sensitivity (data-model.md's Relationships note: wind/current fields are
-- global, not country-scoped like every exposure layer).
DROP POLICY IF EXISTS "public_read_flow_snapshots" ON flow_snapshots;
CREATE POLICY "public_read_flow_snapshots" ON flow_snapshots
  FOR SELECT USING (true);

-- Write: service-role only (the wind-importer container), matching
-- community-report-photos' storage-bucket convention below — no
-- authenticated/anon INSERT policy is created, so only the service-role
-- key (which bypasses RLS entirely) can write.

DROP TRIGGER IF EXISTS audit_flow_snapshots ON flow_snapshots;
CREATE TRIGGER audit_flow_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON flow_snapshots
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- Retention: old snapshots are kept (not deleted on insert) so a staleness
-- check can still see the last known-good issued_at if the latest import
-- failed (data-model.md's Validation/invariants) — pruned instead by the
-- existing retention-policy job pattern (Polish task T029), not here.

-- ── Storage: flow-snapshots bucket ──────────────────────────────────────────
-- Public-read (frontend loads the PNG texture directly), write restricted
-- to the service-role client inside wind-importer — same shape as
-- community-report-photos' bucket policy above it in this repo's history.
INSERT INTO storage.buckets (id, name, public)
VALUES ('flow-snapshots', 'flow-snapshots', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_flow_snapshots_storage" ON storage.objects;
CREATE POLICY "public_read_flow_snapshots_storage" ON storage.objects
  FOR SELECT USING (bucket_id = 'flow-snapshots');
