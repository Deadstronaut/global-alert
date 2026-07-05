/**
 * Edge Function: geocode-search
 * Thin proxy to a per-deployment-configured geocoding provider (spec 008,
 * US5/research.md §5). The provider endpoint/key is an operator-configured
 * secret, never hardcoded to a specific vendor or exposed to the browser.
 * Called by: GeocodingSearch.vue
 */

import { corsHeaders } from '../shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  let body: { query?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const query = body.query?.trim()
  if (!query) return json({ results: [] })

  const apiUrl = Deno.env.get('GEOCODING_API_URL')
  const apiKey = Deno.env.get('GEOCODING_API_KEY')
  if (!apiUrl) {
    // Per-deployment setting not configured yet — a clear, actionable error
    // rather than a silent empty result (this is an operator configuration
    // gap, distinct from a genuine "no results" search outcome).
    return json({ error: 'Geocoding is not configured for this deployment (GEOCODING_API_URL unset)' }, 501)
  }

  try {
    const url = new URL(apiUrl)
    url.searchParams.set('q', query)
    const response = await fetch(url.toString(), {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    })
    if (!response.ok) {
      return json({ error: `Geocoding provider returned ${response.status}` }, 502)
    }
    const raw = await response.json()
    const results = normalizeResults(raw)
    return json({ results })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Geocoding request failed' }, 502)
  }
})

// Normalizes a Nominatim-compatible response shape (the most common
// self-hostable/free geocoding API) into {lat,lng,label}[]. A deployment
// using a different provider's response shape can adjust this mapping
// without touching any other part of the application.
function normalizeResults(raw: unknown): Array<{ lat: number; lng: number; label: string }> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item: any) => ({
      lat: Number(item.lat),
      lng: Number(item.lon ?? item.lng),
      label: String(item.display_name ?? item.label ?? ''),
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
}
