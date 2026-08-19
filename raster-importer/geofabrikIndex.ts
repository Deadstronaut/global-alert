/**
 * Resolves a served country's ISO2 code to its Geofabrik .osm.pbf download
 * URL, via Geofabrik's own machine-readable region index
 * (https://download.geofabrik.de/index-v1.json) rather than a hand-maintained
 * static table — Geofabrik organizes ~550 regions (continents, countries,
 * and sub-country regions like Turkish/Australian states) in a tree, and
 * each region's GeoJSON Feature carries an `iso3166-1:alpha2` property when
 * it corresponds to a whole country. Resolving dynamically means a newly
 * served country (spec 038 §4a's country_boundaries-driven model) needs no
 * code change here to get PBF support.
 *
 * Used by osmPbfBuildings.ts (raster-importer only — this needs no Deno
 * subprocess/filesystem access itself, but its only caller does, so it
 * lives alongside it rather than in supabase/functions/shared, which Edge
 * Functions also import and which cannot do local-file work anyway).
 */

const INDEX_URL = 'https://download.geofabrik.de/index-v1.json'

interface GeofabrikFeature {
  properties: {
    id: string
    parent?: string
    name: string
    'iso3166-1:alpha2'?: string[]
    urls: { pbf: string }
  }
}

interface GeofabrikIndex {
  features: GeofabrikFeature[]
}

// Fetched once per process (this module's functions are only ever called
// from a single run-to-completion container invocation, never a long-lived
// server), not per-country — the index is ~3.5MB and identical for every
// lookup in that run.
let cachedIndex: GeofabrikIndex | null = null

async function loadIndex(): Promise<GeofabrikIndex> {
  if (cachedIndex) return cachedIndex
  const response = await fetch(INDEX_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch Geofabrik index: HTTP ${response.status}`)
  }
  cachedIndex = (await response.json()) as GeofabrikIndex
  return cachedIndex
}

// Geofabrik's own top-level continent regions — a normal country's `parent`
// is one of these. Live-verified 2026-08-20 against index-v1.json: Turkey
// is the sole feature matching ISO2 "TR", parent "europe"; this constant
// only matters for the (currently unencountered, for tr/mg) case of a
// country whose ISO2 is shared by more than one Geofabrik feature — e.g. a
// dependent territory listed both under its own entry and folded into the
// parent country's.
const CONTINENT_IDS = new Set([
  'africa',
  'antarctica',
  'asia',
  'australia-oceania',
  'central-america',
  'europe',
  'north-america',
  'russia',
  'south-america',
])

/**
 * Returns the Geofabrik PBF download URL for a whole-country extract, or
 * null if no matching region exists (Geofabrik doesn't cover every ISO2
 * code as its own file — some tiny territories are folded into a parent
 * region's extract instead). When more than one feature shares the same
 * ISO2 (a country's own entry plus a dependent territory's), prefers the
 * one whose `parent` is a continent — the country-level entry itself,
 * rather than a subdivision.
 */
export async function resolveGeofabrikPbfUrl(countryCode: string): Promise<string | null> {
  const index = await loadIndex()
  const upper = countryCode.toUpperCase()
  const matches = index.features.filter((f) => f.properties['iso3166-1:alpha2']?.includes(upper))
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0].properties.urls.pbf

  const countryLevel = matches.find((f) => f.properties.parent && CONTINENT_IDS.has(f.properties.parent))
  return (countryLevel ?? matches[0]).properties.urls.pbf
}
