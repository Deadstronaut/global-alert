/**
 * Container entrypoint for live flight tracking (spec 072).
 *
 * Fetches OpenSky's anonymous /states/all endpoint and APPENDS one row per
 * aircraft to `live_flights` (insert-only, then prunes rows older than
 * RETENTION_MS) — this is a short real-position history now, not a single
 * current-snapshot-per-aircraft table, so the globe can draw a real
 * trailing path behind each aircraft (2026-08-20 follow-up: "kısa iz/
 * kuyruk çizgisi ekle") built from actually-recorded positions, never an
 * extrapolated/fabricated one.
 *
 * Why here and not a Supabase Edge Function (which is what this feature
 * originally shipped as): live-tested 2026-08-20, OpenSky never responds
 * at all to requests from Supabase's edge egress IPs (instant from a
 * normal residential IP, indefinite hang from Supabase's) — same class of
 * "cloud IP gets silently blocked" issue as several other sources already
 * moved into this container (see cron.ts's header). A container running
 * on this deployment's own host has a normal, non-datacenter-flagged IP.
 *
 * Run via `docker compose run --rm live-flights-importer` (see docker-compose.yml).
 */

const OPENSKY_URL = 'https://opensky-network.org/api/states/all'
const FETCH_TIMEOUT_MS = 15_000
// Cron runs this every 5 minutes (cron.ts) — 25 minutes keeps ~5 recorded
// points per aircraft for the trail, without the table growing unbounded.
const RETENTION_MS = 25 * 60 * 1000

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// deno-lint-ignore no-explicit-any
type OpenSkyRow = any[]

interface FlightRow {
  icao24: string
  callsign: string | null
  origin_country: string
  lat: number
  lng: number
  altitude_m: number | null
  velocity_ms: number | null
  heading_deg: number | null
}

function requireEnv(): { supabaseUrl: string; serviceKey: string } {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set')
  return { supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY }
}

function mapRow(row: OpenSkyRow): FlightRow | null {
  const [icao24, callsign, originCountry, , , lng, lat, baroAlt, onGround, velocity, heading] = row
  if (onGround) return null
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  return {
    icao24,
    callsign: typeof callsign === 'string' ? callsign.trim() || null : null,
    origin_country: originCountry,
    lat,
    lng,
    altitude_m: typeof baroAlt === 'number' ? baroAlt : null,
    velocity_ms: typeof velocity === 'number' ? velocity : null,
    heading_deg: typeof heading === 'number' ? heading : null,
  }
}

async function fetchOpenSkyStates(): Promise<FlightRow[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(OPENSKY_URL, { signal: controller.signal })
    if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`)
    const body = await res.json()
    const rows: OpenSkyRow[] = body.states || []
    return rows.map(mapRow).filter((r): r is FlightRow => r !== null)
  } finally {
    clearTimeout(timeout)
  }
}

/** Runs the live-flights fetch+replace once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runLiveFlightsImport(): Promise<void> {
  const { supabaseUrl, serviceKey } = requireEnv()

  console.log('Fetching live aircraft positions from OpenSky...')
  const flights = await fetchOpenSkyStates()
  console.log(`Fetched ${flights.length} airborne aircraft`)

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  // Append this cycle's positions (each gets its own recorded_at via the
  // column default), then prune anything older than the retention window —
  // insert-then-prune, not delete-then-insert, so there's never a gap
  // where the table (and the globe) has zero aircraft mid-cycle.
  if (flights.length > 0) {
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/live_flights`, {
      method: 'POST',
      headers,
      body: JSON.stringify(flights),
    })
    if (!insertRes.ok) {
      throw new Error(`live_flights INSERT failed: HTTP ${insertRes.status} ${await insertRes.text()}`)
    }
  }

  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString()
  const pruneRes = await fetch(`${supabaseUrl}/rest/v1/live_flights?recorded_at=lt.${encodeURIComponent(cutoff)}`, {
    method: 'DELETE',
    headers,
  })
  if (!pruneRes.ok) throw new Error(`live_flights prune failed: HTTP ${pruneRes.status} ${await pruneRes.text()}`)

  console.log(`\n=== DONE: ${flights.length} aircraft positions recorded, pruned rows older than ${cutoff} ===`)
}

if (import.meta.main) {
  try {
    await runLiveFlightsImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
