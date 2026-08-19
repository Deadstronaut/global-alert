-- =====================================================
-- spec 072-live-flight-ship-tracking: live_flights table.
--
-- Ephemeral, replace-all-each-cycle aircraft positions from OpenSky —
-- NOT hazard_events (these aren't disaster events, see plan.md Storage:
-- N/A). Written by raster-importer/import-live-flights.ts (its own
-- Deno.cron, same self-hosted-per-country pattern as every other source
-- in that container — see cron.ts's header) rather than a Supabase Edge
-- Function: live-tested 2026-08-20, OpenSky never responds at all to
-- requests from Supabase's edge egress IPs (works instantly from a normal
-- residential IP), so the fetch has to happen from the Docker container
-- instead. This table is what the frontend reads directly.
--
-- No history/retention: importer DELETEs+re-INSERTs the full set every
-- run, matching the "live snapshot, not a log" nature of the data.
-- =====================================================

CREATE TABLE IF NOT EXISTS live_flights (
  icao24 text PRIMARY KEY,
  callsign text,
  origin_country text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  altitude_m double precision,
  velocity_ms double precision,
  heading_deg double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE live_flights ENABLE ROW LEVEL SECURITY;

-- anon-sees-all for this table too, same as every other globe layer (spec
-- 072's other layers — choropleth, terminator — are equally global/
-- unrestricted regardless of a deployment's own country lock).
CREATE POLICY "live_flights_select_all" ON live_flights
  FOR SELECT
  USING (true);

-- Only the importer (service role) writes; no anon/authenticated INSERT/
-- UPDATE/DELETE policy is created, so RLS blocks those by default.
