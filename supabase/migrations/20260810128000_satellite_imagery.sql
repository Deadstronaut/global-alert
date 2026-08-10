-- =====================================================
-- Satellite Imagery (spec 066, unblocked)
--
-- MHEWS gap (Observations & Forecasting pillar): no satellite imagery
-- ingestion existed — parked in spec 066 pending a provider account. Now
-- unblocked via Copernicus Data Space Ecosystem's free Sentinel Hub Process
-- API (Sentinel-2 L2A), authenticated with a project-level OAuth client
-- (COPERNICUS_CLIENT_ID/COPERNICUS_CLIENT_SECRET Edge Function secrets —
-- never stored in this database). On-demand, not a blanket per-country
-- cron import: a country's full extent at useful resolution would burn
-- through the free processing-unit quota fast and isn't what rapid damage
-- assessment actually needs — an admin requests imagery for a specific
-- bounding box (typically an active incident's area) instead.
-- =====================================================

CREATE TABLE IF NOT EXISTS satellite_imagery (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code    VARCHAR(2) NOT NULL,
  bbox            DOUBLE PRECISION[4] NOT NULL, -- [west, south, east, north]
  collection      TEXT NOT NULL DEFAULT 'sentinel-2-l2a',
  requested_from  TIMESTAMPTZ NOT NULL,
  requested_to    TIMESTAMPTZ NOT NULL,
  storage_path    TEXT NOT NULL,
  source_name     TEXT NOT NULL DEFAULT 'Copernicus Sentinel-2 (CDSE)',
  requested_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_satellite_imagery_country ON satellite_imagery (country_code, created_at DESC);

ALTER TABLE satellite_imagery ENABLE ROW LEVEL SECURITY;

-- Read: same 3-tier scoping as other operational tables (not public — a
-- deployment's imagery-request pattern/location shouldn't be anon-readable).
DROP POLICY IF EXISTS "super_admin_satellite_imagery_all" ON satellite_imagery;
CREATE POLICY "super_admin_satellite_imagery_all" ON satellite_imagery
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_satellite_imagery_own" ON satellite_imagery;
CREATE POLICY "country_admin_satellite_imagery_own" ON satellite_imagery
  FOR ALL USING (
    current_profile_role() IN ('country_admin', 'org_admin')
    AND country_code = current_profile_country_code()
  );

DROP TRIGGER IF EXISTS audit_satellite_imagery ON satellite_imagery;
CREATE TRIGGER audit_satellite_imagery
  AFTER INSERT OR UPDATE OR DELETE ON satellite_imagery
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── Storage: satellite-imagery bucket ────────────────────────────────────
-- Public-read (frontend loads the PNG directly, same shape as
-- forecast-snapshots' bucket), write restricted to the service-role client
-- inside import-satellite-imagery.
INSERT INTO storage.buckets (id, name, public)
VALUES ('satellite-imagery', 'satellite-imagery', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_satellite_imagery_storage" ON storage.objects;
CREATE POLICY "public_read_satellite_imagery_storage" ON storage.objects
  FOR SELECT USING (bucket_id = 'satellite-imagery');
