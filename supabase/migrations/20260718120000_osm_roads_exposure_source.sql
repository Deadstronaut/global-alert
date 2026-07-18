-- =====================================================
-- OSM/Overpass Road Network Exposure Source (feature 040)
--
-- Adds 'roads' as a new data_sources/rejected_payloads hazard_type value,
-- following the exact precedent set by feature 038's 'population' addition
-- (roads are not a literal disaster hazard either — they reuse the same
-- source-health state machine from feature 001 by the same "primary/
-- informational label" convention).
--
-- Unlike Kontur Population (feature 038), this source needs NO per-country
-- dataset-resolution table: Overpass's own area["ISO3166-1"=<code>] filter
-- takes this system's existing country_code directly at query time — see
-- research.md §5. Nothing to add here beyond the CHECK widening, one
-- hazard_types row, and one data_sources seed row.
-- =====================================================

-- ── 1. Widen hazard_type CHECKs (data-model.md §1) ──────────────────────────
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads'
  ));

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads'
  ));

-- ── 2. hazard_types row (data-model.md §2) ───────────────────────────────────
-- category = 'exposure' already CHECK-allowed since feature 038's migration
-- (20260713140000_population_exposure_sources.sql) — no constraint change
-- needed here. src/stores/hazardTypes.js's alertableHazardTypes computed
-- already filters `category !== 'exposure'` generically (built for
-- 'population'), so this row is automatically excluded from CapView.vue's
-- hazard picker and HazardTaxonomyPanel.vue's threshold editor with zero
-- additional frontend code (tasks.md T021 verifies this, doesn't rebuild it).
INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('roads', 'Road Network', 'exposure', 'Road network exposure data from OpenStreetMap (not an alertable hazard) — used by Impact Analysis')
ON CONFLICT (code) DO NOTHING;

-- ── 3. Seed data_sources row (data-model.md §3) ──────────────────────────────
-- endpoint_url points at the public Overpass API instance; the actual
-- per-country query is built at request time in osmRoadsFetch.ts (country
-- code substituted into the ISO3166-1 area filter), not stored here.
-- poll_interval_seconds = 604800 (7d) matches Kontur's cadence — road
-- networks change far less often than real-time hazard feeds.
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
VALUES
  ('OpenStreetMap Roads', 'roads', 'https://overpass-api.de/api/interpreter', '{}', 604800, 2592000, 3, true, 'healthy', NULL);
-- No ON CONFLICT guard: matches this repo's standard convention (migrations
-- tracked/applied exactly once by the Supabase migration runner), same as
-- feature 038's Kontur seed row.
