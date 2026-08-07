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
  const { data, error } = await supabase
    .from('forecast_snapshots')
    .select('forecast_step_hours, valid_at, issued_at')
    .eq('variable', variable)
    .order('issued_at', { ascending: false })
    .limit(100) // enough rows to cover the latest cycle's full step set even with some retention overlap

  if (error || !data?.length) return []

  const latestIssuedAt = data.reduce((latest, row) => (row.issued_at > latest ? row.issued_at : latest), data[0].issued_at)
  return data
    .filter((row) => row.issued_at === latestIssuedAt)
    .map((row) => ({ forecastStepHours: row.forecast_step_hours, validAt: row.valid_at }))
    .sort((a, b) => a.forecastStepHours - b.forecastStepHours)
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
  const { data, error } = await supabase
    .from('forecast_snapshots')
    .select('texture_storage_path, value_min, value_max, bounds, issued_at')
    .eq('variable', variable)
    .eq('forecast_step_hours', forecastStepHours)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const { data: urlData } = supabase.storage.from('forecast-snapshots').getPublicUrl(data.texture_storage_path)
  if (!urlData?.publicUrl) return null

  return {
    textureUrl: urlData.publicUrl,
    coordinates: boundsToImageCoordinates(data.bounds),
    valueRange: [data.value_min, data.value_max],
    issuedAt: data.issued_at,
  }
}
