-- =====================================================
-- spec 072 follow-up: live_flights becomes a short append-only history
-- instead of a single current-position snapshot per aircraft, so the globe
-- can draw a real (not extrapolated/fabricated) trailing path behind each
-- aircraft from its actual last ~20 minutes of recorded positions
-- ("kısa iz/kuyruk çizgisi" request, 2026-08-20).
--
-- import-live-flights.ts switches from delete-all+insert-fresh to
-- insert-only (one new row per aircraft per 5-min cycle) + pruning rows
-- older than the retention window, so recorded_at now means "when this
-- position was actually observed", not "last time we refreshed".
-- =====================================================

ALTER TABLE live_flights RENAME COLUMN updated_at TO recorded_at;
ALTER TABLE live_flights DROP CONSTRAINT live_flights_pkey;
ALTER TABLE live_flights ADD COLUMN id bigserial;
ALTER TABLE live_flights ADD PRIMARY KEY (id);

CREATE INDEX idx_live_flights_icao24_recorded_at ON live_flights (icao24, recorded_at);
