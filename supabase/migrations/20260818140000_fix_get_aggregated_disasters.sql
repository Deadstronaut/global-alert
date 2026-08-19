-- =====================================================
-- Rewrite of get_aggregated_disasters(), called by
-- src/services/supabaseService.js's fetchAggregatedDisasters() (used by
-- disaster.js's fetchAggregatedData() for the "Petek"/hexbin map mode).
--
-- Its previous definition isn't tracked anywhere in this migration
-- history (created ad-hoc, likely directly in the Supabase Dashboard SQL
-- editor) and live-testing (2026-08-18) found it broken two ways:
--   1. Called with an empty `p_severities` array (the app's own default —
--      no severity filter selected), it returned ZERO rows for every
--      request regardless of `p_types` — an empty-array WHERE-IN-style
--      filter matches nothing in Postgres, not "no filter applied". So the
--      hex/"Petek" aggregation mode has effectively always been empty by
--      default.
--   2. Called with real parameters over a wide window, it hit Postgres'
--      statement_timeout (error 57014) — consistent with the missing
--      time-only indexes fixed in 20260818130000_disaster_time_h3_indexes.sql
--      (the old function likely filtered on `time` the same un-indexed way
--      fetchRecentDisasters() did).
--
-- This version: (a) treats an empty p_types/p_severities array as "no
-- filter" instead of "match nothing", (b) unions all 10 hazard tables (the
-- 9 dedicated ones + the generic `disaster` bucket) so every hazard type
-- can use aggregation, not just whichever ones the old definition covered,
-- (c) filters on `time` first so it can use the new plain time index per
-- table, and (d) groups by h3_id + type, returning per-hex event_count and
-- the worst (max) severity present — the only two fields MapView.vue's own
-- hex-signal code (buildSignalMap/applySignalToGrid, see MapView.vue)
-- actually needs to color and label a hex cell.
-- =====================================================

DROP FUNCTION IF EXISTS get_aggregated_disasters(integer, text[], text[], timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION get_aggregated_disasters(
  p_hours integer DEFAULT 24,
  p_types text[] DEFAULT ARRAY[]::text[],
  p_severities text[] DEFAULT ARRAY[]::text[],
  p_from_date timestamptz DEFAULT NULL,
  p_to_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  h3_id text,
  disaster_type text,
  event_count bigint,
  max_severity text
)
LANGUAGE sql
STABLE
AS $$
  WITH bounds AS (
    SELECT
      COALESCE(p_from_date, now() - make_interval(hours => p_hours)) AS from_ts,
      COALESCE(p_to_date, now()) AS to_ts
  ),
  combined AS (
    SELECT h3_id, type, severity, time FROM earthquake
    UNION ALL
    SELECT h3_id, type, severity, time FROM wildfire
    UNION ALL
    SELECT h3_id, type, severity, time FROM flood
    UNION ALL
    SELECT h3_id, type, severity, time FROM drought
    UNION ALL
    SELECT h3_id, type, severity, time FROM food_security
    UNION ALL
    SELECT h3_id, type, severity, time FROM tsunami
    UNION ALL
    SELECT h3_id, type, severity, time FROM cyclone
    UNION ALL
    SELECT h3_id, type, severity, time FROM volcano
    UNION ALL
    SELECT h3_id, type, severity, time FROM epidemic
    UNION ALL
    SELECT h3_id, type, severity, time FROM disaster
  )
  SELECT
    c.h3_id,
    c.type AS disaster_type,
    count(*) AS event_count,
    (array_agg(c.severity ORDER BY
      CASE c.severity
        WHEN 'critical' THEN 5
        WHEN 'high'     THEN 4
        WHEN 'moderate' THEN 3
        WHEN 'low'      THEN 2
        ELSE 1
      END DESC
    ))[1] AS max_severity
  FROM combined c, bounds b
  WHERE c.h3_id IS NOT NULL
    AND c.time >= b.from_ts
    AND c.time <= b.to_ts
    AND (cardinality(p_types) = 0 OR c.type = ANY(p_types))
    AND (cardinality(p_severities) = 0 OR c.severity = ANY(p_severities))
  GROUP BY c.h3_id, c.type;
$$;

GRANT EXECUTE ON FUNCTION get_aggregated_disasters(integer, text[], text[], timestamptz, timestamptz) TO anon, authenticated;
