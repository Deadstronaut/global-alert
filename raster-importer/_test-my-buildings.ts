// One-off scoped test: validate the whole pipeline (tile fetch, decompress,
// parse, aggregate, write) against just 'my' (fewest tiles, 98) before
// committing to the full TR/MG/MY sweep.
import { fetchBuildingFootprints } from '../supabase/functions/shared/buildingFootprintsFetch.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'

const records = await fetchBuildingFootprints(['my'])
const myRecords = records.get('my')
if (!myRecords || myRecords.length === 0) {
  console.log('No my records produced')
  Deno.exit(1)
}
const { datasetId, featureCount } = await writeExposureDataset(
  'building_footprints', 'my', 'building_count',
  myRecords.map((r) => ({ geometry: r.geometry, metricValue: r.populationCount, properties: r.properties })),
)
console.log(`[my] wrote dataset ${datasetId} (${featureCount} hexagons)`)
