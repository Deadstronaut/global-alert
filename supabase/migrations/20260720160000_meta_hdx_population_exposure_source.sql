-- =====================================================
-- Meta/HDX Population — resolved but NOT wired (spec 044 attempt)
--
-- "Meta/HDX Population" line item, Data Sources Inventory §8. Attempted a
-- full port reusing spec 043's source-agnostic raster->hexagon pipeline
-- (rasterToHexagon.ts), same as rasterSourceConfig.ts's own header comment
-- anticipated ("a small config addition") — that assumption turned out
-- wrong. Meta's per-country GeoTIFFs are ~10-11GB UNCOMPRESSED (live-
-- verified for Madagascar: a 21.8MB zip expands to 10,745,446,400 bytes —
-- confirmed independently via Windows' own zip extractor, not just this
-- codebase's zip-parsing code). That is an order of magnitude larger than
-- WorldPop's ~100m rasters and cannot be processed inside a Supabase Edge
-- Function's memory/timeout budget (the same WORKER_RESOURCE_LIMIT ceiling
-- osmRoadsFetch.ts already documents hitting at far smaller sizes), and a
-- one-time local-script import (Kontur's original workaround for its own
-- oversized first load) is also not viable on typical development hardware
-- without deliberate disk-streaming — 3 countries at ~10GB+ each does not
-- fit on most laptops' free disk space.
--
-- What IS done and worth keeping: the HDX dataset resolution. resolveHdx-
-- CountryDataset.ts's automatic groups:<iso3> filter does not reliably
-- match Meta's HDX packages (live-verified: it returned unrelated Meta
-- datasets for Turkey and Madagascar, not their population packages) —
-- the three served countries' real package IDs were found by manual HDX
-- search instead (data.humdata.org package_search, 2026-07-20) and are
-- seeded below so a future attempt (e.g. from an environment with proper
-- streaming/large-disk capacity, or a Supabase Storage-side processing
-- approach) does not have to redo that lookup.
--
-- hazard_type 'population_raster' already exists in the CHECK constraint
-- (added by 20260719150000 for WorldPop) — no widening needed here.
-- No Edge Function or pg_cron trigger exists for this source — same
-- "configured but no fetch code" state as PTWC/WHO were before
-- 20260720130000, until someone builds a working import path.
-- =====================================================

-- ── 1. Seed data_sources row ──────────────────────────────────────────────────
-- poll_interval_seconds = 2592000 (30d) is aspirational (matches WorldPop's
-- cadence) — irrelevant until a fetch function actually exists to schedule.
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
VALUES
  ('Meta/HDX Population', 'population_raster', 'https://data.humdata.org/api/3/action/package_show', '{}', 2592000, 31536000, 3, true, 'healthy', NULL);

-- ── 2. Seed population_source_country_datasets rows ──────────────────────────
-- resolveHdxCountryDataset.ts's automatic groups:<iso3> filter does not
-- reliably match Meta's HDX packages (live-verified during implementation:
-- the filtered search returned unrelated Meta datasets for Turkey and
-- Madagascar, not their population packages) — these three IDs were found
-- by manual HDX search instead (data.humdata.org package_search,
-- 2026-07-20), same 'manual_disambiguation' convention Kontur's own seed
-- rows already use for the identical reason (see the three 'kontur' rows
-- in this table).
INSERT INTO population_source_country_datasets
  (source_name, country_code, dataset_reference, resolved_at, resolved_by)
VALUES
  ('meta_hdx', 'tr', 'dd6ae158-e35b-45e2-8eb8-dca248b8c3d6', NOW(), 'manual_disambiguation'),
  ('meta_hdx', 'mg', '9e7ff424-7b9c-42cc-b869-5756fcad0956', NOW(), 'manual_disambiguation'),
  ('meta_hdx', 'my', 'f165a732-7125-4321-baad-1b7005ed93d0', NOW(), 'manual_disambiguation')
ON CONFLICT (source_name, country_code) DO UPDATE SET
  dataset_reference = EXCLUDED.dataset_reference,
  resolved_at = EXCLUDED.resolved_at,
  resolved_by = EXCLUDED.resolved_by;
