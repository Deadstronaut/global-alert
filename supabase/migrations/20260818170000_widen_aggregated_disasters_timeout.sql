-- =====================================================
-- Follow-up: 20260818140000_fix_get_aggregated_disasters.sql fixed the
-- function's logic (empty-filter handling, table coverage) and
-- 20260818130000_disaster_time_h3_indexes.sql fixed the missing indexes,
-- but live-testing (2026-08-18) a realistic wide window (30 days, all
-- types) still hits the role's default statement_timeout — wildfire alone
-- has 214K+ rows in the last 30 days, and a UNION ALL + GROUP BY h3_id
-- across all 10 hazard tables over that volume is real aggregation work,
-- not something an index alone fixes. disaster.js already avoids calling
-- this for very wide windows in one case (loadCountryHistory's own
-- bbox-loaded guard) but the "SÜRE" duration slider can still request
-- windows of several days to weeks, which now succeed under a properly-
-- indexed query but need more than the platform's default timeout to
-- finish.
--
-- Attaches a per-function statement_timeout override (30s, well below
-- Supabase's own gateway timeout) rather than raising it project-wide,
-- which would affect every other query on the connection.
-- =====================================================

ALTER FUNCTION get_aggregated_disasters(integer, text[], text[], timestamptz, timestamptz)
  SET statement_timeout = '30s';
