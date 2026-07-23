/**
 * Downloads Meta/HDX Population's per-country GeoTIFF from HDX (the CKAN
 * catalogue at data.humdata.org) into the same host-mounted /rasters
 * directory meta-ghsl-importer reads from, then regenerates /manifest.json
 * so the next `docker compose run --rm meta-ghsl-importer` picks up fresh
 * files with no manual editing. Closes the gap NEW_GAME_PLAN.md §4.1
 * flagged: until now this pipeline only ever processed manually-downloaded
 * local files (no metaFetch.ts existed, unlike worldPopFetch.ts/
 * ghslFetch.ts).
 *
 * NOT part of cron.ts's monthly schedule, and deliberately not scheduled
 * anywhere: every served country's HDX package metadata states "as of
 * 2024, Meta's high resolution population density maps are no longer
 * being updated" (live-verified 2026-07-22, see the `caveats` field of
 * https://data.humdata.org/api/3/action/package_show?id=<packageId>) —
 * this dataset is frozen, so a monthly re-download would just refetch
 * byte-identical files for no benefit. Run manually, essentially once:
 *   docker compose run --rm meta-downloader
 *
 * Uses the country_code -> HDX package ID mapping already resolved and
 * seeded by 20260720160000_meta_hdx_population_exposure_source.sql
 * (population_source_country_datasets) — package IDs are never hardcoded
 * here, so a newly-served country only needs a new seed row, not a code
 * change (same reasoning as that migration's own header comment).
 *
 * Each served country's HDX package bundles several resources (general
 * population plus demographic breakdowns — children/elderly/men/women/
 * youth). Live-verified 2026-07-22 against all three served countries'
 * real packages that resource NAMING is inconsistent (Madagascar:
 * "mdg_general_2020_geotiff.zip", Turkey: "population_turkey_2020_tif.zip"
 * — no shared prefix pattern), so this selects the general-population
 * GeoTIFF resource by EXCLUDING the known demographic-breakdown keywords
 * rather than matching an assumed naming convention.
 *
 * Extraction shells out to the system `unzip` (Info-ZIP, added via `apk
 * add unzip` in the Dockerfile) instead of this repo's own
 * unzipSingleEntry.ts, which explicitly does not support ZIP64 — and
 * Meta's archives need it (each entry's UNCOMPRESSED size exceeds 4GB even
 * though the zip file itself is only ~20-60MB, live-verified: Madagascar's
 * real zip is 21.8MB compressed, 12.44GB uncompressed, single entry).
 * Shelling out also means the multi-GB extracted GeoTIFF is streamed
 * straight to disk by `unzip`, never buffered in this process's memory.
 */

const DEMOGRAPHIC_BREAKDOWN_KEYWORDS = ['children', 'elderly', 'youth', 'men', 'women']

interface HdxResource {
  name: string
  url: string
  size: number
}

async function fetchHdxPackage(packageId: string): Promise<{ resources: HdxResource[]; caveats: string }> {
  const res = await fetch(`https://data.humdata.org/api/3/action/package_show?id=${packageId}`)
  if (!res.ok) throw new Error(`HDX package_show failed for ${packageId}: HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(`HDX package_show returned success:false for ${packageId}`)
  return { resources: data.result.resources, caveats: data.result.caveats ?? '' }
}

function findGeneralPopulationResource(resources: HdxResource[]): HdxResource {
  const tifResources = resources.filter((r) => /tif/i.test(r.name))
  const general = tifResources.filter((r) => {
    const lower = r.name.toLowerCase()
    return !DEMOGRAPHIC_BREAKDOWN_KEYWORDS.some((kw) => lower.includes(kw))
  })
  if (general.length !== 1) {
    throw new Error(
      `Expected exactly 1 general-population GeoTIFF resource, found ${general.length}: ${general.map((r) => r.name).join(', ') || '(none)'} ` +
      `(all .tif-named resources: ${tifResources.map((r) => r.name).join(', ')})`,
    )
  }
  return general[0]
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed for ${url}: HTTP ${res.status}`)
  const file = await Deno.open(destPath, { write: true, create: true, truncate: true })
  await res.body.pipeTo(file.writable)
}

async function extractSingleTif(zipPath: string, extractDir: string): Promise<string> {
  await Deno.mkdir(extractDir, { recursive: true })
  // clearEnv + explicit PATH-only env: Deno's --allow-run=unzip scoping
  // also gates inherited env vars (live-verified 2026-07-22: denied,
  // asking for permission to spawn "with LD_LIBRARY_PATH environment
  // variable", otherwise) — but clearing the environment entirely then
  // breaks PATH-based command lookup ("Failed to spawn 'unzip': entity
  // not found", also live-verified). PATH alone is enough for `unzip` to
  // resolve and run correctly with no other inherited variables.
  const cmd = new Deno.Command('unzip', {
    args: ['-o', zipPath, '-d', extractDir],
    stdout: 'piped',
    stderr: 'piped',
    clearEnv: true,
    env: { PATH: Deno.env.get('PATH') ?? '/usr/bin:/bin' },
  })
  const { code, stderr } = await cmd.output()
  if (code !== 0) throw new Error(`unzip failed (exit ${code}): ${new TextDecoder().decode(stderr)}`)

  const tifs: string[] = []
  for await (const entry of Deno.readDir(extractDir)) {
    if (entry.isFile && entry.name.toLowerCase().endsWith('.tif')) tifs.push(entry.name)
  }
  if (tifs.length !== 1) throw new Error(`Expected exactly 1 .tif in extracted archive, found ${tifs.length}: ${tifs.join(', ')}`)
  return `${extractDir}/${tifs[0]}`
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RASTERS_DIR = Deno.env.get('RASTERS_DIR') ?? '/rasters'
const MANIFEST_PATH = Deno.env.get('RASTER_IMPORT_MANIFEST') ?? '/manifest.json'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set')
  Deno.exit(1)
}

const res = await fetch(
  `${SUPABASE_URL}/rest/v1/population_source_country_datasets?source_name=eq.meta_hdx&select=country_code,dataset_reference`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
)
if (!res.ok) {
  console.error(`Failed to load population_source_country_datasets: HTTP ${res.status}`)
  Deno.exit(1)
}
const datasets: { country_code: string; dataset_reference: string }[] = await res.json()
console.log(`Found ${datasets.length} meta_hdx country dataset(s): ${datasets.map((d) => d.country_code).join(', ')}`)

const manifestEntries: { source: 'meta_hdx'; countryCode: string; tifPath: string }[] = []
const failed: string[] = []

for (const { country_code: countryCode, dataset_reference: packageId } of datasets) {
  const zipPath = `${RASTERS_DIR}/_download_${countryCode}.zip`
  const extractDir = `${RASTERS_DIR}/_extract_${countryCode}`
  const finalTifPath = `${RASTERS_DIR}/meta_hdx_${countryCode}.tif`

  try {
    console.log(`[${countryCode}] resolving HDX package ${packageId}...`)
    const { resources, caveats } = await fetchHdxPackage(packageId)
    if (/no longer being updated/i.test(caveats)) {
      console.log(`[${countryCode}] note: HDX package caveats confirm this dataset is frozen (no new data expected)`)
    }
    const resource = findGeneralPopulationResource(resources)
    console.log(`[${countryCode}] downloading ${resource.name} (${(resource.size / 1e6).toFixed(1)}MB)...`)
    await downloadToFile(resource.url, zipPath)

    console.log(`[${countryCode}] extracting (unzip, disk-to-disk, ZIP64-capable)...`)
    const extractedTifPath = await extractSingleTif(zipPath, extractDir)
    await Deno.rename(extractedTifPath, finalTifPath)
    await Deno.remove(zipPath)
    await Deno.remove(extractDir, { recursive: true })

    const stat = await Deno.stat(finalTifPath)
    console.log(`[${countryCode}] ready: ${finalTifPath} (${(stat.size / 1e9).toFixed(2)}GB)`)
    manifestEntries.push({ source: 'meta_hdx', countryCode, tifPath: finalTifPath })
  } catch (e) {
    console.error(`[${countryCode}] FAILED: ${e instanceof Error ? e.message : e}`)
    failed.push(countryCode)
  }
}

if (manifestEntries.length > 0) {
  await Deno.writeTextFile(MANIFEST_PATH, JSON.stringify(manifestEntries, null, 2))
  console.log(`\nWrote ${MANIFEST_PATH} with ${manifestEntries.length} entr${manifestEntries.length === 1 ? 'y' : 'ies'}`)
}

console.log(`\n=== DONE: ${manifestEntries.length}/${datasets.length} succeeded ===`)
if (failed.length > 0) {
  console.error(`Failed: ${failed.join(', ')}`)
  Deno.exit(1)
}
