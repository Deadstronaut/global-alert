-- =====================================================
-- Population Exposure Data Sources (feature 038)
--
-- Adds 'population' as a new data_sources/rejected_payloads hazard_type
-- value (reusing the existing source-health state machine from feature 001
-- for Kontur Population — not a literal disaster hazard, but this column
-- is already documented as a "primary/informational label" per the
-- tier1-source-unification migration, which set this precedent by adding
-- 'tsunami'/'epidemic'/'multi_hazard').
--
-- Also adds exposure_datasets.source_name (to identify/supersede
-- auto-imported population datasets per source+country) and the new
-- population_source_country_datasets table (per-country HDX dataset
-- resolution for Kontur — see data-model.md §5/§5a).
--
-- WorldPop, Meta/HDX Population, and GHSL are all NOT part of this
-- feature — every one of them turned out, on live verification, to be raw
-- grid/raster-resolution source data (GeoTIFF-only for WorldPop and GHSL;
-- an 18.6M-row-per-country CSV for Meta), which would require either a
-- raster-processing dependency or a spatial-aggregation step this feature
-- deliberately does not take on (Principle VIII) — see spec.md's three
-- Amendments and data-model.md §5b/§5c/§5d. Kontur is the only one of the
-- four originally requested sources that ships pre-aggregated vector data
-- (400m H3 hexagons) small enough to fit this feature's scope.
-- =====================================================

-- ── 1. Widen hazard_type CHECKs (data-model.md §1) ──────────────────────────
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population'
  ));

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population'
  ));

-- ── 2. exposure_datasets.source_name (data-model.md §4) ─────────────────────
-- NULL for manually uploaded datasets (existing rows unaffected). Set to
-- 'kontur' for auto-imported ones. No CHECK constraint (free text) so a
-- future source (e.g. WorldPop, Meta/HDX, GHSL) can reuse this column
-- without a migration.
ALTER TABLE exposure_datasets ADD COLUMN IF NOT EXISTS source_name TEXT;

CREATE INDEX IF NOT EXISTS idx_exposure_datasets_source_country
  ON exposure_datasets (source_name, country_code) WHERE source_name IS NOT NULL;

-- ── 3. population_source_country_datasets (data-model.md §5/§5a) ────────────
-- Per-country HDX dataset resolution for Kontur only (Meta/HDX Population
-- was removed from this feature's scope after implementation-time
-- verification found its CSV resource is raw grid-resolution data, 18.6M
-- rows for Turkey alone — see data-model.md §5c). Rows are written once,
-- automatically, at country onboarding by resolveHdxCountryDataset()
-- (shared/resolveHdxCountryDataset.ts) — never on every scheduled import
-- cycle (research.md §4a explains why a live per-import HDX search was
-- rejected in favor of this persisted-once approach). CHECK constraint
-- covers only 'kontur' today but is written to accept a future 'meta_hdx'
-- value without a second migration, once Meta's aggregation problem is
-- solved by a separate feature.
CREATE TABLE IF NOT EXISTS population_source_country_datasets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name        TEXT NOT NULL CHECK (source_name IN ('kontur', 'meta_hdx')), -- 'meta_hdx' reserved, unused until a future feature solves Meta's aggregation problem
  country_code       VARCHAR(2) NOT NULL,
  dataset_reference  TEXT NOT NULL, -- HDX package ID (result.id from package_search/package_show)
  resolved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by        TEXT NOT NULL DEFAULT 'hdx_search', -- 'hdx_search' (automatic) | a user id (manual override)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_name, country_code)
);

-- RLS — deliberately NOT modeled on data_sources's public-read policy.
-- This table is per-country config; while today's dataset_reference values
-- point at already-public HDX pages, this table is also the natural
-- landing place for any future non-public per-country reference. Defaults
-- to the strictest existing pattern (exposure_datasets's country-scoped
-- RLS) from day one — no country's admin can see another country's row,
-- even in the shared MVP instance. See data-model.md §5's RLS rationale
-- (this was a deliberate response to a country-data-privacy review during
-- planning, not an oversight to be "fixed" later toward public-read).
ALTER TABLE population_source_country_datasets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_population_source_datasets_all" ON population_source_country_datasets;
CREATE POLICY "super_admin_population_source_datasets_all" ON population_source_country_datasets
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_population_source_datasets_own" ON population_source_country_datasets;
CREATE POLICY "country_admin_population_source_datasets_own" ON population_source_country_datasets
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP TRIGGER IF EXISTS audit_population_source_country_datasets ON population_source_country_datasets;
CREATE TRIGGER audit_population_source_country_datasets
  AFTER INSERT OR UPDATE OR DELETE ON population_source_country_datasets
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── 4. hazard_types row for 'population' (feature 038, US2 — SourceFormModal CRUD) ──
-- SourceFormModal.vue's admin CRUD form filters its hazard_type dropdown
-- against hazardTypesStore.activeHazardTypes, not just a hardcoded list, so
-- a hazard_types row is required for admins to manage this source through
-- the existing Sources UI.
--
-- hazard_types.category is CHECK-constrained to ('meteo','hydro','geo',
-- 'bio','tech') — none of which fit "population is not a hazard at all."
-- Widen it additively (same technique as the hazard_type CHECKs above and
-- the tier1-source-unification migration) to add 'exposure', a distinct
-- category so hazard-specific UI (threshold editor, CAP hazard picker) can
-- filter it out by category rather than by hardcoding the 'population'
-- code specifically — see spec 038 tasks.md T030's verification step.
ALTER TABLE hazard_types DROP CONSTRAINT IF EXISTS hazard_types_category_check;
ALTER TABLE hazard_types ADD CONSTRAINT hazard_types_category_check
  CHECK (category IN ('meteo','hydro','geo','bio','tech','exposure'));

INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('population', 'Population', 'exposure', 'Population exposure data (not an alertable hazard) — used by Impact Analysis')
ON CONFLICT (code) DO NOTHING;

-- ── 5. Seed data_sources row (data-model.md §2) ──────────────────────────────
-- Kontur's endpoint_url points at HDX's base API — the actual per-country
-- dataset reference lives in population_source_country_datasets, not here.
-- No WorldPop, Meta/HDX Population, or GHSL row (all three deferred, see
-- spec.md's three Amendments).
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
VALUES
  ('Kontur Population', 'population', 'https://data.humdata.org/api/3/action/', '{}', 604800, 2592000, 3, true, 'healthy', NULL);
-- No ON CONFLICT guard: data_sources has no unique constraint on `name` for
-- rows without `source_type` set (only the tier1-source-unification
-- migration's partial index covers source_type IS NOT NULL rows). Matches
-- this repo's standard convention of migrations being tracked/applied
-- exactly once by the Supabase migration runner, not designed for manual
-- re-application.
