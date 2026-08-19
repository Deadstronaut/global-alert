-- =====================================================
-- Follow-up to 20260818140000_fix_get_aggregated_disasters.sql: that
-- migration's `DROP FUNCTION IF EXISTS get_aggregated_disasters(integer,
-- text[], text[], timestamptz, timestamptz)` assumed the original
-- (untracked) function's `p_hours` parameter was `integer`. Deploying it
-- live-revealed (2026-08-18, PostgREST error PGRST203) the original was
-- actually `p_hours double precision` — the DROP didn't match it, so both
-- versions now coexist as an ambiguous overload pair, and PostgREST can no
-- longer resolve ANY call to get_aggregated_disasters (every request
-- fails with "Could not choose the best candidate function").
--
-- Drops the double-precision original explicitly by its actual signature,
-- leaving only the integer-based version this app calls with (`p_hours:
-- selectedTimeRange.value`, always an integer number of hours in
-- disaster.js).
-- =====================================================

DROP FUNCTION IF EXISTS get_aggregated_disasters(double precision, text[], text[], timestamptz, timestamptz);
