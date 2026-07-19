-- =====================================================
-- Country-Locked Map View: per-country default zoom (feature 044)
--
-- Nullable — NULL means "no configured default," and the frontend falls
-- back to fit-to-bounds camera framing (existing zoomToCountry() logic,
-- research.md §4). Lives on country_boundaries because it is per-country
-- config that a country_admin should be able to tune without a code
-- deploy, unlike genuinely fixed geographic reference data (e.g.
-- hydroshedsContinent.ts's continent lookup, which stays a frontend
-- constant on purpose). No new RLS policy needed — country_boundaries'
-- existing row-scoped policies (country_admin own row, super_admin any
-- row) already cover this column.
-- =====================================================

ALTER TABLE country_boundaries ADD COLUMN IF NOT EXISTS default_zoom numeric NULL;

COMMENT ON COLUMN country_boundaries.default_zoom IS
  'Default map zoom level for a country-locked user opening the map on this country (spec 044). '
  'NULL means no configured default — the frontend falls back to fit-to-bounds camera framing.';
