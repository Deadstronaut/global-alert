/**
 * Kontur Population fetch module (spec 038, US1). For each served country,
 * looks up its resolved HDX dataset (population_source_country_datasets,
 * set once at onboarding by resolveHdxCountryDataset.ts — never queried
 * live here), downloads that dataset's GeoPackage resource, and maps every
 * H3-hexagon feature into a PopulationRecord.
 *
 * Verified live during implementation against a real Kontur package
 * (Turkey, kontur_population_TR_20231101.gpkg): 90MB uncompressed,
 * 458,226 rows, loads and queries via sql.js (WASM SQLite) in well under a
 * second — the GeoPackage-reading dependency decision (plan.md Complexity
 * Tracking, data-model.md's "New dependency" section) holds up in practice.
 *
 * Geometry: Kontur's `geom` column is EPSG:3857 Polygon — reprojected to
 * EPSG:4326 by geopackageBlob.ts's parseGeoPackageGeometry().
 */

import initSqlJs from 'https://esm.sh/sql.js@1.11.0'
import { getServiceClient } from './upsert.ts'
import { parseGeoPackageGeometry } from './geopackageBlob.ts'
import type { PopulationRecord } from './populationRecord.ts'

const HDX_PACKAGE_SHOW_URL = 'https://data.humdata.org/api/3/action/package_show'
const SQLJS_WASM_URL = 'https://esm.sh/sql.js@1.11.0/dist/sql-wasm.wasm'

interface HdxResource {
  format: string
  download_url: string
}

interface HdxPackageShowResult {
  success: boolean
  result?: { resources: HdxResource[] }
}

/**
 * Resolves the most recent Geopackage resource's download URL for an
 * already-resolved HDX package ID (data-model.md §5's dataset_reference).
 */
async function getLatestGeopackageDownloadUrl(datasetReference: string): Promise<string> {
  const response = await fetch(`${HDX_PACKAGE_SHOW_URL}?id=${datasetReference}`, {
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    throw new Error(`HDX package_show failed for ${datasetReference}: HTTP ${response.status}`)
  }
  const body = (await response.json()) as HdxPackageShowResult
  if (!body.success || !body.result) {
    throw new Error(`HDX package_show returned an unsuccessful response for ${datasetReference}`)
  }

  const gpkgResources = body.result.resources.filter((r) => r.format === 'Geopackage')
  if (gpkgResources.length === 0) {
    throw new Error(`No Geopackage resource found for HDX package ${datasetReference}`)
  }
  // Resources are listed newest-first on HDX (verified live) — take the first.
  return gpkgResources[0].download_url
}

let sqlJsModulePromise: ReturnType<typeof initSqlJs> | null = null
function getSqlJs() {
  if (!sqlJsModulePromise) {
    sqlJsModulePromise = (async () => {
      const wasmResp = await fetch(SQLJS_WASM_URL, { signal: AbortSignal.timeout(20_000) })
      if (!wasmResp.ok) throw new Error(`Failed to fetch sql.js WASM: HTTP ${wasmResp.status}`)
      const wasmBinary = await wasmResp.arrayBuffer()
      return initSqlJs({ wasmBinary })
    })()
  }
  return sqlJsModulePromise
}

async function downloadAndDecompressGpkg(downloadUrl: string): Promise<Uint8Array> {
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download Kontur .gpkg.gz: HTTP ${response.status}`)
  }
  const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'))
  const buffer = await new Response(decompressed).arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * Maps one country's downloaded+decompressed .gpkg bytes into
 * PopulationRecord[]. Rows whose geometry fails to parse are skipped (not
 * thrown) — validatePopulationRecord() is the single point of truth for
 * what's "invalid" downstream; this function's job is shape-mapping, not
 * validation, but a genuinely unparseable blob can't be mapped at all, so
 * it's dropped here with a console warning rather than aborting the whole
 * country's import over one bad row.
 */
function mapGpkgToPopulationRecords(gpkgBytes: Uint8Array, SQL: Awaited<ReturnType<typeof initSqlJs>>, countryCode: string): PopulationRecord[] {
  const db = new SQL.Database(gpkgBytes)
  try {
    const contentsResult = db.exec(
      "SELECT table_name FROM gpkg_contents WHERE data_type = 'features' LIMIT 1",
    )
    const featureTable = contentsResult[0]?.values[0]?.[0] as string | undefined
    if (!featureTable) {
      throw new Error('No feature table found in gpkg_contents')
    }

    const rows = db.exec(`SELECT geom, population FROM "${featureTable}"`)
    if (rows.length === 0) return []

    const records: PopulationRecord[] = []
    for (const row of rows[0].values) {
      const [geomBlob, population] = row as [Uint8Array, number]
      try {
        const geometry = parseGeoPackageGeometry(geomBlob)
        records.push({
          geometry,
          population,
          countryCode,
          properties: { source: 'kontur' },
        })
      } catch (err) {
        console.warn(`[konturFetch] skipping unparseable geometry: ${err instanceof Error ? err.message : err}`)
      }
    }
    return records
  } finally {
    db.close()
  }
}

export async function fetchKonturPopulation(countryCodes: string[]): Promise<Map<string, PopulationRecord[]>> {
  const supabase = getServiceClient()
  const results = new Map<string, PopulationRecord[]>()

  const { data: configRows, error } = await supabase
    .from('population_source_country_datasets')
    .select('country_code, dataset_reference')
    .eq('source_name', 'kontur')
    .in('country_code', countryCodes)

  if (error) {
    throw new Error(`Failed to load population_source_country_datasets: ${error.message}`)
  }

  const SQL = await getSqlJs()

  for (const row of configRows ?? []) {
    const { country_code: countryCode, dataset_reference: datasetReference } = row as {
      country_code: string
      dataset_reference: string
    }
    const downloadUrl = await getLatestGeopackageDownloadUrl(datasetReference)
    const gpkgBytes = await downloadAndDecompressGpkg(downloadUrl)
    results.set(countryCode, mapGpkgToPopulationRecords(gpkgBytes, SQL, countryCode))
  }

  return results
}
