/**
 * Fetches the latest wind/ocean-current flow snapshot (spec 053) and
 * resolves it into the shape @sakitam-gis/maplibre-wind's ImageSource
 * expects — contracts/flow-snapshot-contract.md's "Frontend → Consumer"
 * steps 1-3, kept separate from MapView.vue so it's testable without a
 * real map instance (matches this repo's convention of extracting pure/
 * fetchable logic into src/utils/, e.g. disasterSourceBadges.js).
 */
import { supabase } from '@/services/api/config.js'

/**
 * [west, south, east, north] -> maplibre-wind's ImageSourceOptions.coordinates
 * shape: [top-left, top-right, bottom-right, bottom-left].
 */
export function boundsToImageCoordinates([west, south, east, north]) {
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ]
}

/**
 * @param {'wind'|'ocean_current'} layerType
 * @returns {Promise<{
 *   textureUrl: string,
 *   coordinates: [[number,number],[number,number],[number,number],[number,number]],
 *   dataRange: [[number,number],[number,number]],
 *   issuedAt: string,
 * } | null>} null when no snapshot exists yet (e.g. importer never run) —
 *   callers should treat this the same as a fetch failure (FR-006's
 *   graceful "unavailable" state), not throw.
 */
export async function fetchLatestFlowSnapshot(layerType) {
  const { data, error } = await supabase
    .from('flow_snapshots')
    .select('texture_storage_path, u_min, u_max, v_min, v_max, bounds, issued_at')
    .eq('layer_type', layerType)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const { data: urlData } = supabase.storage.from('flow-snapshots').getPublicUrl(data.texture_storage_path)
  if (!urlData?.publicUrl) return null

  return {
    textureUrl: urlData.publicUrl,
    bounds: data.bounds, // [west, south, east, north] — SimpleWindLayer's own sampling shape
    coordinates: boundsToImageCoordinates(data.bounds),
    dataRange: [
      [data.u_min, data.u_max],
      [data.v_min, data.v_max],
    ],
    issuedAt: data.issued_at,
  }
}

/**
 * Spec 054 US2 — parallel to fetchLatestFlowSnapshot, but for the
 * pre-colored, scalar Overlay (contracts/overlay-snapshot-contract.md).
 * The returned PNG is already RGBA-colored server-side (overlay_texture.py)
 * — the frontend just draws it as a plain MapLibre image/raster source, no
 * decode step needed, unlike the vector flow-snapshot texture above.
 * @param {'air_quality_pm25'} overlayType
 * @returns {Promise<{
 *   textureUrl: string,
 *   coordinates: [[number,number],[number,number],[number,number],[number,number]],
 *   valueRange: [number, number],
 *   issuedAt: string,
 * } | null>}
 */
export async function fetchLatestOverlaySnapshot(overlayType) {
  const { data, error } = await supabase
    .from('overlay_snapshots')
    .select('texture_storage_path, value_min, value_max, bounds, issued_at')
    .eq('overlay_type', overlayType)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const { data: urlData } = supabase.storage.from('overlay-snapshots').getPublicUrl(data.texture_storage_path)
  if (!urlData?.publicUrl) return null

  return {
    textureUrl: urlData.publicUrl,
    coordinates: boundsToImageCoordinates(data.bounds),
    valueRange: [data.value_min, data.value_max],
    issuedAt: data.issued_at,
  }
}
