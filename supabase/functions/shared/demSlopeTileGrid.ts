/**
 * Copernicus GLO-30 DEM (30m global elevation) tile grid — same "1x1 degree,
 * plain COG per tile, public S3, no auth" shape as this project's other
 * tiled sources (see ghslTileGrid.ts for the 10-degree GHSL equivalent).
 * Live-verified reachable with no credentials:
 *   Copernicus_DSM_COG_10_N37_00_E037_00_DEM/Copernicus_DSM_COG_10_N37_00_E037_00_DEM.tif
 * Tile name is derived from the floor() of each 1-degree cell's south-west
 * corner — e.g. the cell covering [37,38)°N / [37,38)°E is "N37_00_E037_00",
 * the cell covering [-8,-7)°N / [-1,0)°E is "S08_00_W001_00".
 */

export interface DemTile {
  latFloor: number
  lngFloor: number
  name: string
}

function pad(n: number, width: number): string {
  return Math.abs(n).toString().padStart(width, '0')
}

export function demTileName(latFloor: number, lngFloor: number): string {
  const ns = latFloor >= 0 ? 'N' : 'S'
  const ew = lngFloor >= 0 ? 'E' : 'W'
  return `Copernicus_DSM_COG_10_${ns}${pad(latFloor, 2)}_00_${ew}${pad(lngFloor, 3)}_00_DEM`
}

export function demTileUrl(tile: DemTile): string {
  return `https://copernicus-dem-30m.s3.amazonaws.com/${tile.name}/${tile.name}.tif`
}

// [minLng, minLat, maxLng, maxLat] -> every 1-degree tile whose cell
// overlaps the box (inclusive of both edges, matching ghslTileGrid.ts's
// convention of over-covering rather than under-covering a boundary).
export function demTilesForBoundingBox(bbox: [number, number, number, number]): DemTile[] {
  const [minLng, minLat, maxLng, maxLat] = bbox
  const tiles: DemTile[] = []
  for (let lat = Math.floor(minLat); lat <= Math.floor(maxLat); lat++) {
    for (let lng = Math.floor(minLng); lng <= Math.floor(maxLng); lng++) {
      tiles.push({ latFloor: lat, lngFloor: lng, name: demTileName(lat, lng) })
    }
  }
  return tiles
}
