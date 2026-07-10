-- =====================================================
-- One-off backfill (spec 039 live-testing finding, tasks.md T035b): the one
-- pre-existing exposure_datasets row uploaded before spec 034's
-- admin_boundary_code convention existed ("Nüfus datası", population by
-- Turkish province) has country_code = NULL and none of its
-- exposure_features rows have admin_boundary_code set. Its province name
-- already lives in each feature's properties->>'il' (e.g. "Istanbul",
-- "Ankara") and was verified live to match country_boundaries' TR
-- shapeName values exactly for the provinces checked (no diacritic/
-- encoding mismatch) — so this backfill is a straight copy, not a guess.
--
-- Scoped to this one dataset by id (not "every exposure_datasets row with
-- NULL country_code") since a NULL country_code could mean something
-- different for a future dataset; this is a one-time fix for this
-- specific known-good case, not a general rule.
-- Safe to re-run: only ever touches rows that are still NULL.
-- =====================================================

UPDATE exposure_datasets
SET country_code = 'tr'
WHERE id = '68814e1b-ef6f-4554-a665-4aa999fab8e7'
  AND country_code IS NULL;

UPDATE exposure_features
SET admin_boundary_code = properties ->> 'il'
WHERE dataset_id = '68814e1b-ef6f-4554-a665-4aa999fab8e7'
  AND admin_boundary_code IS NULL
  AND properties ? 'il';
