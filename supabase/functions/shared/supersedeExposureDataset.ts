/**
 * Writes an auto-imported population dataset for one (source, country) pair
 * and supersedes any prior dataset from the same source+country, per spec
 * 038 data-model.md §4 / contracts/import-population-source.md.
 *
 * Mirrors upload-exposure-dataset/index.ts's insert-then-rollback-on-
 * partial-failure pattern, but additionally deletes the *previous*
 * exposure_datasets row for this (source_name, country_code) pair — and
 * only AFTER the new insert has fully succeeded, so a failed re-import
 * never leaves a country with zero population features for that source.
 */

import { getServiceClient } from './upsert.ts'
import { geometryToWkt } from './geometryToWkt.ts'
import type { PopulationRecord } from './populationRecord.ts'

// 'ghsl' and 'meta_hdx' are reserved for future features (see spec.md's
// Amendments 2/3) — this feature only ever calls this with 'kontur'.
export type PopulationSourceName = 'kontur' | 'ghsl' | 'meta_hdx'

// Kontur's H3-hexagon datasets can exceed 400k features per country
// (verified live: Turkey has 458,226) — a single INSERT of that many rows
// would exceed PostgREST's request size limits. Chunking is required, not
// optional, for this source.
const INSERT_CHUNK_SIZE = 2000

export async function writePopulationDataset(
  sourceName: PopulationSourceName,
  countryCode: string,
  records: PopulationRecord[],
): Promise<{ datasetId: string; featureCount: number }> {
  const supabase = getServiceClient()

  const { data: dataset, error: datasetError } = await supabase
    .from('exposure_datasets')
    .insert({
      name: `${sourceName} — ${countryCode} — ${new Date().toISOString().slice(0, 7)}`,
      description: `Auto-imported population data from ${sourceName}`,
      metric_property_name: 'population',
      feature_count: records.length,
      country_code: countryCode,
      org_id: null,
      created_by: null,
      source_name: sourceName,
    })
    .select('id')
    .single()

  if (datasetError || !dataset) {
    throw new Error(datasetError?.message ?? 'Failed to create exposure dataset')
  }

  const rows = records.map((record) => ({
    dataset_id: dataset.id,
    geom: `SRID=4326;${geometryToWkt(record.geometry)}`,
    metric_value: record.population,
    properties: record.properties,
  }))

  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE)
    const { error: featuresError } = await supabase.from('exposure_features').insert(chunk)
    if (featuresError) {
      // Roll back the new dataset row (cascades to any chunks already
      // inserted for it) so a partial write never lingers.
      await supabase.from('exposure_datasets').delete().eq('id', dataset.id)
      throw new Error(`${featuresError.message} (failed at rows ${i}-${i + chunk.length})`)
    }
  }

  // Only now that the new dataset+features have fully committed: remove the
  // prior dataset(s) for this exact (source_name, country_code) pair. Never
  // delete before the new insert succeeds — a failed re-import must leave
  // the prior data intact rather than leaving a country with none at all.
  await supabase
    .from('exposure_datasets')
    .delete()
    .eq('source_name', sourceName)
    .eq('country_code', countryCode)
    .neq('id', dataset.id)

  return { datasetId: dataset.id, featureCount: records.length }
}
