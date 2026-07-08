-- =====================================================
-- data_sources: add source_type (adapter registry key) and widen
-- hazard_type CHECK to cover Tier-1 hazard categories not previously
-- representable (tsunami, epidemic) plus a 'multi_hazard' label for
-- adapters like GDACS whose per-record type is decided by internal
-- adapter logic (server/src/sources/gdacs.js's TYPE_MAP), not by this
-- column. This migration only creates editable, inert-to-existing-code
-- rows — server/src/index.js's static Tier-1 imports are untouched and
-- keep running exactly as before until a later, separate change wires
-- these rows into the ingestion pipeline (dual-run behind
-- USE_DB_SOURCES_TIER1, then cutover).
-- Feature: tier1-source-unification
-- =====================================================

ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS source_type TEXT;
COMMENT ON COLUMN data_sources.source_type IS
  'Adapter registry key (server/src/sources/registry.js) for built-in Tier-1 '
  'adapters, e.g. "usgs", "afad", "gdacs_rest". NULL = generic/custom source '
  'driven entirely by endpoint_config.field_map (dynamicSources.js). Never '
  'set via the admin UI on create — only via seed migrations, since it '
  'selects hardcoded parser code, not arbitrary configuration.';

CREATE INDEX IF NOT EXISTS idx_data_sources_source_type ON data_sources (source_type);

-- hazard_type: widen CHECK. NOTE this is a *primary/informational* label for
-- multi-hazard adapters (GDACS) — the actual per-event `type` written to the
-- events tables comes from each adapter's own internal TYPE_MAP / RSS
-- category parsing, NOT from this column, for any row with source_type set.
-- For generic/custom rows (source_type IS NULL) hazard_type IS still
-- authoritative — dynamicSources.js's pollOne() passes row.hazard_type
-- straight through as event.type, unchanged.
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard'
  ));

-- rejected_payloads.hazard_type stores a snapshot of the same domain
-- (records rejected during ingestion for a given source's hazard_type) —
-- widen it in lockstep so Tier-1 sources with the new hazard values can log
-- rejected payloads without violating this CHECK.
ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard'
  ));

-- Guard against accidental duplicate seeding on manual re-application of
-- this file (data_sources has no natural unique key otherwise).
CREATE UNIQUE INDEX IF NOT EXISTS idx_data_sources_name_unique
  ON data_sources (name) WHERE source_type IS NOT NULL;

-- ── Tier-1 seed rows ─────────────────────────────────────────────────────
-- endpoint_url and poll_interval_seconds mirror the hardcoded constants in
-- server/src/sources/*.js exactly, so a future switch to reading these rows
-- changes zero runtime behavior. staleness_threshold_seconds is new (no
-- prior staleness concept existed for these hardcoded modules) — set to a
-- ~4-8x multiple of the poll interval as a reasonable starting point; not
-- load-bearing until Faz 5 wires recordFetchOutcome() for these rows.
--
-- EMSC's poll_interval_seconds is schema-required (NOT NULL, CHECK > 0) but
-- meaningless for it in practice — it's a WebSocket push adapter
-- (server/src/sources/emsc.js: connectEMSC), never timer-driven. The value
-- below is a placeholder only; the future websocket-mode adapter wrapper
-- must not read it as a polling interval.
INSERT INTO data_sources
  (name, hazard_type, source_type, endpoint_url, endpoint_config,
   poll_interval_seconds, staleness_threshold_seconds,
   down_after_consecutive_failures, is_active, health_state, country_code)
VALUES
  ('EMSC',       'earthquake',    'emsc',        'wss://www.seismicportal.eu/standing_order/websocket', '{}', 15,    300,   3, true, 'healthy', NULL),
  ('USGS',       'earthquake',    'usgs',        'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson', '{}', 15,    120,   3, true, 'healthy', NULL),
  ('GEOFON',     'earthquake',    'geofon',      'https://geofon.gfz-potsdam.de/fdsnws/event/1/query', '{}', 120,   600,   3, true, 'healthy', NULL),
  ('GDACS',      'multi_hazard',  'gdacs_rest',  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH', '{}', 300,   1800,  3, true, 'healthy', NULL),
  ('GDACS RSS',  'multi_hazard',  'gdacs_rss',   'https://www.gdacs.org/xml/rss.xml', '{}', 300,   1800,  3, true, 'healthy', NULL),
  ('PTWC',       'tsunami',       'ptwc_rest',   'https://www.tsunami.gov/events/xml/PHEBulletins.xml', '{}', 180,   900,   3, true, 'healthy', NULL),
  ('PTWC RSS',   'tsunami',       'ptwc_rss',    'https://www.tsunami.gov/events/rss.xml', '{}', 180,   900,   3, true, 'healthy', NULL),
  ('NASA FIRMS', 'wildfire',      'nasa_firms',  'https://firms.modaps.eosdis.nasa.gov/api/area/csv', '{}', 900,   3600,  3, true, 'healthy', NULL),
  ('WHO',        'epidemic',      'who',         'https://www.who.int/api/emergencies/diseaseoutbreaknews', '{}', 1800,  7200,  3, true, 'healthy', NULL),
  ('FEWS NET',   'food_security', 'fewsnet',     'https://fdw.fews.net/api/ipcphase/', '{}', 21600, 86400, 3, true, 'healthy', NULL),
  ('AFAD',       'earthquake',    'afad',        'https://deprem.afad.gov.tr/apiv2/event/filter', '{}', 15,    120,   3, true, 'healthy', 'TR'),
  ('Kandilli',   'earthquake',    'kandilli',    'http://www.koeri.boun.edu.tr/scripts/lst0.asp', '{}', 20,    120,   3, true, 'healthy', 'TR')
ON CONFLICT (name) WHERE source_type IS NOT NULL DO NOTHING;
