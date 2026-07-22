/**
 * Container-facing raster import — disk-streaming variant of
 * rasterToHexagon.ts's Edge Function path. Live-tested 2026-07-21: a bare
 * `fromArrayBuffer` read of Meta/HDX Madagascar's 12.4GB GeoTIFF worked
 * fine on a 127GB-RAM dev machine (5.7s to read, 37.4s to aggregate,
 * 16,404 hexagons, ~23.1M total population — sane) but that only proves
 * the aggregation LOGIC is correct, not that it will run on a modest
 * self-hosted production VM, which is very unlikely to have 12+GB of free
 * RAM to spare for one import job.
 *
 * `npm:geotiff`'s `fromFile` source (Node's `fs`-backed lazy reader, which
 * Deno's npm: compat resolves) never loads the whole file into memory —
 * `readRasters({ window })` triggers real `fs.read()` calls for only the
 * byte ranges the requested window's strips/tiles actually need. Combined
 * with rasterToHexagon.ts's existing row-block loop (already windowed,
 * ROW_BLOCK_SIZE=512 rows at a time) and bbox cropping, peak memory usage
 * becomes roughly "one row-block's worth of pixels", not "the whole file"
 * — independent of whether the source file is 100MB or 50GB.
 *
 * Only meant to run in a real Deno process with filesystem/npm access
 * (the planned Meta/GHSL container — see docker-compose.yml), never in
 * Supabase's Edge Runtime (no local files there, and no workerPolyfill.ts
 * import here — a real Deno CLI process has a working `Worker` global,
 * that polyfill was only needed for the Edge Runtime's missing one).
 */
import { fromFile } from 'npm:geotiff@2.1.3'
import { aggregateRasterToHexagonsFromImage } from './rasterToHexagon.ts'
import type { RasterSourceConfig } from './rasterSourceConfig.ts'
import type { PopulationRasterRecord } from './populationRasterRecord.ts'

export async function aggregateRasterToHexagonsFromFile(
  filePath: string,
  config: RasterSourceConfig,
  countryBoundary: GeoJSON.Geometry,
  countryCode: string,
): Promise<PopulationRasterRecord[]> {
  const tiff = await fromFile(filePath)
  const image = await tiff.getImage()
  return aggregateRasterToHexagonsFromImage(image, config, countryBoundary, countryCode)
}
