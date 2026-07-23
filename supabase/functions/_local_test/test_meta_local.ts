// Local (non-Edge-Function) feasibility test for Meta/HDX Population.
// Temporary — not part of the deployed function set, delete after use.
// Reuses the actual project pipeline code (no reimplementation) against a
// locally-downloaded file, using this machine's real RAM (~127GB) instead
// of a Supabase Edge Function's memory ceiling.
import { aggregateRasterToHexagons } from '../shared/rasterToHexagon.ts'
import { META_SOURCE_CONFIG } from '../shared/rasterSourceConfig.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TIF_PATH = Deno.env.get('META_TIF_PATH')!

console.log('Fetching Madagascar boundary...')
const res = await fetch(
  `${SUPABASE_URL}/rest/v1/country_boundaries?country_code=eq.mg&select=geojson`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
)
const rows = await res.json()
if (!rows[0]) throw new Error('No boundary found for mg')
const geojson = rows[0].geojson
const boundary = geojson.type === 'FeatureCollection'
  ? { type: 'GeometryCollection', geometries: geojson.features.map((f: any) => f.geometry) }
  : geojson.type === 'Feature' ? geojson.geometry : geojson

console.log('Reading 12.4GB TIF from disk...')
const t0 = performance.now()
const fileData = await Deno.readFile(TIF_PATH)
const buffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength)
const t1 = performance.now()
console.log(`File read into memory: ${((t1 - t0) / 1000).toFixed(1)}s, ${(buffer.byteLength / 1e9).toFixed(2)}GB`)

console.log('Running aggregateRasterToHexagons (the real pipeline function)...')
const t2 = performance.now()
const records = await aggregateRasterToHexagons(buffer as ArrayBuffer, META_SOURCE_CONFIG, boundary, 'mg')
const t3 = performance.now()

console.log(`\n=== RESULT ===`)
console.log(`Aggregation time: ${((t3 - t2) / 1000).toFixed(1)}s`)
console.log(`Hexagon count: ${records.length}`)
const totalPop = records.reduce((sum, r) => sum + r.populationCount, 0)
console.log(`Total population: ${totalPop.toFixed(0)}`)
console.log(`Sample record:`, JSON.stringify(records[0], null, 2))
