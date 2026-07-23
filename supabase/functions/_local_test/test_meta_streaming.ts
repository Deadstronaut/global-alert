// Proves rasterToHexagonFile.ts's disk-streaming path works under a tight
// memory constraint (run with --v8-flags=--max-old-space-size=<MB>) —
// unlike aggregateRasterToHexagons's ArrayBuffer path, which needs
// RAM roughly >= file size.
import { aggregateRasterToHexagonsFromFile } from '../shared/rasterToHexagonFile.ts'
import { META_SOURCE_CONFIG } from '../shared/rasterSourceConfig.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TIF_PATH = Deno.env.get('META_TIF_PATH')!
const COUNTRY_CODE = Deno.env.get('META_COUNTRY_CODE')!

console.log(`Fetching ${COUNTRY_CODE} boundary...`)
const res = await fetch(
  `${SUPABASE_URL}/rest/v1/country_boundaries?country_code=eq.${COUNTRY_CODE}&select=geojson`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
)
const rows = await res.json()
if (!rows[0]) throw new Error(`No boundary found for ${COUNTRY_CODE}`)
const geojson = rows[0].geojson
const boundary = geojson.type === 'FeatureCollection'
  ? { type: 'GeometryCollection', geometries: geojson.features.map((f: any) => f.geometry) }
  : geojson.type === 'Feature' ? geojson.geometry : geojson

const fileInfo = await Deno.stat(TIF_PATH)
console.log(`File on disk: ${(fileInfo.size / 1e9).toFixed(2)}GB (never fully loaded into memory)`)

console.log('Running aggregateRasterToHexagonsFromFile (disk-streaming)...')
const t0 = performance.now()
const records = await aggregateRasterToHexagonsFromFile(TIF_PATH, META_SOURCE_CONFIG, boundary, COUNTRY_CODE)
const t1 = performance.now()

const memMB = Deno.memoryUsage().rss / 1e6

console.log(`\n=== RESULT ===`)
console.log(`Aggregation time: ${((t1 - t0) / 1000).toFixed(1)}s`)
console.log(`Peak process RSS memory: ${memMB.toFixed(0)}MB`)
console.log(`Hexagon count: ${records.length}`)
const totalPop = records.reduce((sum, r) => sum + r.populationCount, 0)
console.log(`Total population: ${totalPop.toFixed(0)}`)
