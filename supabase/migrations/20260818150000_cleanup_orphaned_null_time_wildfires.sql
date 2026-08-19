-- =====================================================
-- Data cleanup: 3,990 rows in `wildfire` have source = 'nasa-firms' and a
-- NULL `time` column. Live-verified 2026-08-18 (Supabase REST + repo grep)
-- that this exact id/title/source pattern (`nasa-<n>`, title
-- "Wildfire Alert (Temp: <n>K)", source "nasa-firms") does not match any
-- ingestion path currently in this codebase:
--   - server/src/sources/nasaFirms.js always computes `time` from
--     acq_date/acq_time and IDs as `firms-<date>-<time>-<lat>-<lng>`.
--   - supabase/functions/fetch-wildfires/index.ts's own FIRMS fetch is
--     commented out entirely (moved server-only, CUTOVER-2026-07-22).
-- These are orphaned rows from a removed/replaced script, not from any
-- live path — confirmed via repo-wide grep for "Wildfire Alert"/"nasa-firms"
-- turning up nothing outside docs/env examples.
--
-- Why this matters beyond cleanliness: Postgres' default `ORDER BY time DESC`
-- puts NULLs FIRST, so any query path that lists wildfires without an
-- explicit date filter would surface these 3,990 useless rows ahead of any
-- real (dated) wildfire data.
--
-- Scoped tightly to source='nasa-firms' AND time IS NULL — live-verified
-- (2026-08-18) that every NULL-time row in `wildfire` matches this exact
-- combination and no NULL-time row has a different source, so this can't
-- catch anything from a legitimate ingestion path.
-- =====================================================

DELETE FROM wildfire
WHERE time IS NULL
  AND source = 'nasa-firms';
