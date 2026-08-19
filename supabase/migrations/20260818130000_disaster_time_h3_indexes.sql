-- =====================================================
-- Performance fix: every disaster table only had a composite
-- (country_code, time DESC) index (see 20260603120100_country_code.sql /
-- 20260727000000_hazard_types_icon_color_and_generic_fk.sql). Per Postgres'
-- leftmost-prefix rule, that index cannot be used by a query that filters
-- on `time` alone without `country_code` — which is exactly what
-- fetchRecentDisasters() in src/services/supabaseService.js does on every
-- app load (`.gte('time', fromDate)`, no country_code filter; bbox is a
-- separate, optional lat/lng filter, not this index's leading column
-- either). Live-verified 2026-08-18: a simple filtered count query against
-- `wildfire` (395K+ rows) timed out (PostgREST error 57014) — consistent
-- with a full sequential scan, not an index scan. This is the likely cause
-- of "eskiden hemen çıkıyordu şimdi zor çıkıyor" (used to load instantly,
-- now loads slowly) as these tables have grown.
--
-- Adds a plain `time DESC` index (for the un-scoped fetch path) and a
-- `(h3_id, time DESC)` partial index (for get_aggregated_disasters' own
-- GROUP BY h3_id + time-range filter, added in the next migration) to
-- every disaster table, including the generic `disaster` bucket table.
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_earthquake_time    ON earthquake    (time DESC);
CREATE INDEX IF NOT EXISTS idx_wildfire_time      ON wildfire      (time DESC);
CREATE INDEX IF NOT EXISTS idx_flood_time         ON flood         (time DESC);
CREATE INDEX IF NOT EXISTS idx_drought_time       ON drought       (time DESC);
CREATE INDEX IF NOT EXISTS idx_food_security_time ON food_security (time DESC);
CREATE INDEX IF NOT EXISTS idx_tsunami_time       ON tsunami       (time DESC);
CREATE INDEX IF NOT EXISTS idx_cyclone_time       ON cyclone       (time DESC);
CREATE INDEX IF NOT EXISTS idx_volcano_time       ON volcano       (time DESC);
CREATE INDEX IF NOT EXISTS idx_epidemic_time      ON epidemic      (time DESC);
CREATE INDEX IF NOT EXISTS idx_disaster_time      ON disaster      (time DESC);

CREATE INDEX IF NOT EXISTS idx_earthquake_h3_time    ON earthquake    (h3_id, time DESC) WHERE h3_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wildfire_h3_time      ON wildfire      (h3_id, time DESC) WHERE h3_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flood_h3_time         ON flood         (h3_id, time DESC) WHERE h3_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drought_h3_time       ON drought       (h3_id, time DESC) WHERE h3_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_food_security_h3_time ON food_security (h3_id, time DESC) WHERE h3_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tsunami_h3_time       ON tsunami       (h3_id, time DESC) WHERE h3_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cyclone_h3_time       ON cyclone       (h3_id, time DESC) WHERE h3_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_volcano_h3_time       ON volcano       (h3_id, time DESC) WHERE h3_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_epidemic_h3_time      ON epidemic      (h3_id, time DESC) WHERE h3_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disaster_h3_time      ON disaster      (h3_id, time DESC) WHERE h3_id IS NOT NULL;
