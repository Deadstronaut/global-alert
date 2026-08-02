-- Earthquake events reported by more than one agency (AFAD/EMSC/Kandilli/
-- USGS/GEOFON) were previously deduplicated down to just the first-arrived
-- source's row — every other agency's own magnitude/source_url report was
-- silently discarded, so the popup card could only ever show one source
-- badge. contributing_sources retains all of them (merged in, not
-- overwritten, by server/src/processors/deduplicator.js and
-- server/src/output/supabaseWriter.js) so the UI can render "AFAD M1.2 ·
-- EMSC M1.2 · Kandilli M1.2" instead of just one.

ALTER TABLE earthquake
  ADD COLUMN IF NOT EXISTS contributing_sources JSONB NOT NULL DEFAULT '[]'::jsonb;

DROP VIEW IF EXISTS earthquake_view;
CREATE VIEW earthquake_view AS
SELECT id, type, lat, lng, h3_id, severity, magnitude, depth,
       title, description, time, source, source_url, extra, received_at,
       country_code, contributing_sources
FROM earthquake
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;
