-- =====================================================
-- Adds data_sources.automation_kind — surfaces WHICH of three genuinely
-- different automation models a source runs under, so the admin Sources
-- panel can stop showing every source's staleness through the same
-- "green dot / red offline" lens.
--
-- Found live 2026-07-25 auditing GloFAS's "Çevrimdışı" badge: it wasn't a
-- false positive — GloFAS's own raster-importer Docker cron genuinely
-- hadn't run in 3 days (poll_interval_seconds=86400, daily). But the same
-- badge treatment doesn't make sense for a source like Meta/HDX Population,
-- which has NO scheduled trigger at all by design (docker-compose.yml's own
-- comment: "recompute identical output every month [would be pointless].
-- Manual-only, like meta-downloader.") — showing that as urgent red
-- "offline" is actively misleading; it was never supposed to auto-run.
--
-- Three kinds, matching this codebase's actual three automation paths:
--   'continuous' — server/'s always-on aggregator (registry.js), i.e. every
--                  row that already has a non-NULL source_type. Real-time
--                  pollers/websockets; staleness here is a genuine incident.
--   'scheduled'  — pg_cron (Edge Functions) or the raster-importer Docker
--                  containers' internal Deno.cron. Runs daily/weekly/
--                  monthly by design; staleness between cycles is normal,
--                  only alarming once it exceeds its own cadence.
--   'manual'     — no automated trigger exists anywhere for this source;
--                  someone runs the importer by hand when they want fresh
--                  data. Staleness is meaningless here — there's no
--                  "supposed to have run again by now" to violate.
-- =====================================================

ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS automation_kind TEXT
  NOT NULL DEFAULT 'scheduled'
  CHECK (automation_kind IN ('continuous', 'scheduled', 'manual'));

-- Every row with a source_type is registry.js-driven (server/'s always-on
-- aggregator) — the only rows scoped to server/ in this whole table.
UPDATE data_sources SET automation_kind = 'continuous' WHERE source_type IS NOT NULL;

-- The one genuinely trigger-less source, per docker-compose.yml's own
-- "Manual-only" comment on meta-ghsl-importer/meta-downloader.
UPDATE data_sources SET automation_kind = 'manual' WHERE name = 'Meta/HDX Population';

-- Everything else (GHSL/WorldPop/HydroBASINS/HydroRIVERS/OSM/Kontur/GloFAS/
-- GDO SPI+soil-moisture+fAPAR/WFP HungerMap) keeps the 'scheduled' default —
-- each has either a raster-importer Docker cron.ts job or a pg_cron trigger
-- wired (verified per-source against docker-compose.yml / their own
-- migration files while writing this one).
