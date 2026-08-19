/**
 * Fetches spec 055's forecast_snapshots data and resolves it into the same
 * shape windLayerData.js's fetchLatestOverlaySnapshot returns — spec 056,
 * contracts/forecast-layer-data-contract.md. Kept in its own file (not
 * added to windLayerData.js) since it's a different UI surface's own
 * concern (research.md §4) — FlowControlPanel.vue's Forecast row and
 * MapView.vue's forecast layer, not the nowcast Animate/Overlay layers
 * windLayerData.js already serves.
 */
import { supabase } from '@/services/api/config.js'
import { boundsToImageCoordinates } from '@/utils/windLayerData.js'

// spec 069 follow-up: both ForecastPanel.vue's day-slider AND MapView.vue's
// forecast raster overlay call these same two functions for the same
// (variable, forecastStepHours) pairs — most visibly, ForecastPanel.vue's
// new play/pause loop re-requests every frame on every single lap, hitting
// the network repeatedly for data that hasn't changed (report: playback
// feeling like it "doesn't fill in" smoothly on a second loop). Module-level
// cache here — not per-component — so every caller shares one cache instead
// of each re-fetching independently. A short TTL (not permanent) rather
// than an unbounded cache: new NWP forecast cycles get ingested periodically
// during the day, so a tab left open for hours should eventually see fresh
// data rather than serving session-stale snapshots forever.
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const dayListCache = new Map() // variable -> { value, expiresAt }
const snapshotCache = new Map() // `${variable}:${forecastStepHours}` -> { value, expiresAt }

function getFresh(cache, key) {
  const hit = cache.get(key)
  if (!hit || hit.expiresAt < Date.now()) return undefined
  return hit.value
}

function setCached(cache, key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

/**
 * Returns the ascending, latest-cycle-only list of forecast steps a
 * variable actually has data for — NOT a hardcoded 1-15 day range, since
 * some variables (e.g. uv_index, spec 055) have fewer real steps than
 * others (research.md §3). Returns [] (never null) on error/empty, so
 * callers can treat "no data at all for this variable" and "fetch failed"
 * the same way (Constitution Principle IV — never fabricate a range that
 * doesn't reflect real ingested data).
 * @param {string} variable
 * @returns {Promise<Array<{forecastStepHours: number, validAt: string}>>}
 */
export async function fetchForecastDayList(variable) {
  const cached = getFresh(dayListCache, variable)
  if (cached) return cached

  const { data, error } = await supabase
    .from('forecast_snapshots')
    .select('forecast_step_hours, valid_at, issued_at')
    .eq('variable', variable)
    .order('issued_at', { ascending: false })
    .limit(100) // enough rows to cover the latest cycle's full step set even with some retention overlap

  if (error || !data?.length) return []

  const latestIssuedAt = data.reduce((latest, row) => (row.issued_at > latest ? row.issued_at : latest), data[0].issued_at)
  const result = data
    .filter((row) => row.issued_at === latestIssuedAt)
    .map((row) => ({ forecastStepHours: row.forecast_step_hours, validAt: row.valid_at }))
    .sort((a, b) => a.forecastStepHours - b.forecastStepHours)

  setCached(dayListCache, variable, result)
  return result
}

/**
 * Returns the same shape fetchLatestOverlaySnapshot does (textureUrl,
 * coordinates, valueRange, issuedAt) for one (variable, forecastStepHours)
 * pair — drop-in reusable by MapView.vue's existing raster image-source
 * code. null when no row exists (FR-005's no-data trigger).
 * @param {string} variable
 * @param {number} forecastStepHours
 */
export async function fetchForecastSnapshot(variable, forecastStepHours) {
  const cacheKey = `${variable}:${forecastStepHours}`
  const cached = getFresh(snapshotCache, cacheKey)
  if (cached !== undefined) return cached

  const { data, error } = await supabase
    .from('forecast_snapshots')
    .select('texture_storage_path, value_min, value_max, bounds, issued_at')
    .eq('variable', variable)
    .eq('forecast_step_hours', forecastStepHours)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null // deliberately not cached — a transient fetch error shouldn't lock in "no data" for the TTL window

  const { data: urlData } = supabase.storage.from('forecast-snapshots').getPublicUrl(data.texture_storage_path)
  if (!urlData?.publicUrl) return null

  const result = {
    textureUrl: urlData.publicUrl,
    coordinates: boundsToImageCoordinates(data.bounds),
    valueRange: [data.value_min, data.value_max],
    issuedAt: data.issued_at,
  }
  setCached(snapshotCache, cacheKey, result)
  return result
}
