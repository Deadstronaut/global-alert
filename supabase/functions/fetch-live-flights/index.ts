/**
 * Edge Function: fetch-live-flights
 * Source: OpenSky Network REST API (anonymous tier, no API key)
 * Does NOT write to hazard_events — aircraft positions are live/ephemeral,
 * not disaster events (see specs/072-live-flight-ship-tracking/plan.md
 * Storage: N/A). This endpoint returns live data directly to the frontend.
 *
 * Server-side caching is required, not optional: the anonymous OpenSky tier
 * has a 400-credit/day budget shared across the whole deployment (every
 * user of this app hits the same upstream account), not per browser
 * session. Refreshing upstream at most once per CACHE_TTL_MS keeps this
 * well under budget regardless of how many frontends are polling this
 * function (see research.md §1).
 */
import { corsHeaders } from '../shared/cors.ts'

const OPENSKY_URL = 'https://opensky-network.org/api/states/all'
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

// deno-lint-ignore no-explicit-any
type OpenSkyRow = any[]

interface AircraftState {
  icao24: string
  callsign: string | null
  originCountry: string
  lat: number
  lng: number
  altitudeM: number | null
  velocityMs: number | null
  headingDeg: number | null
}

interface FlightsLayerResponse {
  fetchedAt: string
  stale: boolean
  states: AircraftState[]
}

let cache: { fetchedAt: string; states: AircraftState[] } | null = null

function mapRow(row: OpenSkyRow): AircraftState | null {
  const [icao24, callsign, originCountry, , , lng, lat, baroAlt, onGround, velocity, heading] = row
  if (onGround) return null
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  return {
    icao24,
    callsign: typeof callsign === 'string' ? callsign.trim() || null : null,
    originCountry,
    lat,
    lng,
    altitudeM: typeof baroAlt === 'number' ? baroAlt : null,
    velocityMs: typeof velocity === 'number' ? velocity : null,
    headingDeg: typeof heading === 'number' ? heading : null,
  }
}

async function refreshCache(): Promise<void> {
  const res = await fetch(OPENSKY_URL)
  if (!res.ok) throw new Error(`OpenSky ${res.status}`)
  const body = await res.json()
  const rows: OpenSkyRow[] = body.states || []
  const states = rows.map(mapRow).filter((s): s is AircraftState => s !== null)
  cache = { fetchedAt: new Date().toISOString(), states }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cacheAge = cache ? Date.now() - new Date(cache.fetchedAt).getTime() : Infinity
  let stale = false

  if (cacheAge >= CACHE_TTL_MS) {
    try {
      await refreshCache()
    } catch (_e) {
      // Keep serving the previous cache (if any) marked stale, per FR-007 —
      // never fabricate positions, never silently freeze without indicating it.
      stale = true
    }
  }

  const payload: FlightsLayerResponse = cache
    ? { fetchedAt: cache.fetchedAt, stale, states: cache.states }
    : { fetchedAt: new Date().toISOString(), stale: true, states: [] }

  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
