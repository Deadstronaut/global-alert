/**
 * Writes an auto-imported population dataset for one (source, country) pair
 * and supersedes any prior dataset from the same source+country, per spec
 * 038 data-model.md §4 / contracts/import-population-source.md.
 *
 * As of spec 040, this is a thin, behavior-preserving wrapper over the
 * generalized shared/writeExposureDataset.ts (extracted so OSM Roads can
 * reuse the identical chunked-insert/rollback/supersede mechanics without a
 * second hand-maintained copy — see spec 040 plan.md Complexity Tracking).
 * The insert/rollback/supersede logic itself now lives there.
 */

import { writeExposureDataset } from './writeExposureDataset.ts'
import type { PopulationRecord } from './populationRecord.ts'

// 'ghsl' and 'meta_hdx' are reserved for future features (see spec.md's
// Amendments 2/3) — this feature only ever calls this with 'kontur'.
export type PopulationSourceName = 'kontur' | 'ghsl' | 'meta_hdx'

export async function writePopulationDataset(
  sourceName: PopulationSourceName,
  countryCode: string,
  records: PopulationRecord[],
): Promise<{ datasetId: string; featureCount: number }> {
  return writeExposureDataset(
    sourceName,
    countryCode,
    'population',
    records.map((record) => ({
      geometry: record.geometry,
      metricValue: record.population,
      properties: record.properties,
    })),
  )
}
