-- =====================================================
-- Shelters: OSM-imported source support.
--
-- `shelters` (spec 027) was scaffolded with schema + RLS + a manual admin
-- CRUD form, but no import mechanism ever existed — live-verified
-- 2026-07-26 the table had zero rows for TR/MG/MY, which is why the map's
-- "Sığınakları Göster" toggle showed nothing. This adds the columns needed
-- for an idempotent OSM importer (raster-importer/import-osm-shelters.ts)
-- to upsert real emergency=assembly_point / social_facility=shelter /
-- evacuation_center=yes points without duplicating rows on its weekly
-- re-run, while leaving hand-entered rows (source='manual',
-- external_id=NULL) completely untouched.
-- =====================================================

ALTER TABLE shelters ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE shelters ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Partial unique index (only when external_id IS NOT NULL) — hand-entered
-- rows all have external_id=NULL and Postgres treats each NULL as
-- distinct, so manual rows never collide with each other or with OSM rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shelters_source_external_id
  ON shelters (source, external_id) WHERE external_id IS NOT NULL;

-- hazard_types row so data_sources.hazard_type's FK (20260727000000
-- migration) accepts 'shelters' — an exposure/informational category like
-- 'buildings'/'roads', not a real hazard event type.
INSERT INTO hazard_types (code, display_name, category, description, icon, supports_custom_source)
VALUES (
  'shelters',
  'Shelters / Assembly Points',
  'exposure',
  'Disaster shelters and emergency assembly points — not a hazard event, an exposure/response-capacity layer.',
  '🏠',
  false
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
VALUES
  ('OSM Shelters', 'shelters', 'https://overpass-api.de/api/interpreter', '{}', 604800, 2592000, 3, true, 'healthy', NULL);
