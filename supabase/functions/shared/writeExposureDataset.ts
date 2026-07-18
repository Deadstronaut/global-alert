/**
 * Generalized auto-imported-exposure-dataset writer for one (source,
 * country) pair — supersedes any prior dataset from the same source+country,
 * per spec 038 data-model.md §4 / contracts/import-population-source.md and
 * spec 040 data-model.md's Writer section.
 *
 * Extracted from supersedeExposureDataset.ts's original writePopulationDataset
 * (spec 038) so both Kontur Population and OSM Roads (spec 040) share one
 * insert-then-supersede implementation instead of two copies that would need
 * to stay behaviorally identical by hand (spec 040 plan.md Complexity
 * Tracking). writePopulationDataset is now a thin wrapper over this function
 * — see supersedeExposureDataset.ts.
 *
 * Mirrors upload-exposure-dataset/index.ts's insert-then-rollback-on-
 * partial-failure pattern, but additionally deletes the *previous*
 * exposure_datasets row for this (source_name, country_code) pair — and only
 * AFTER the new insert has fully succeeded, so a failed re-import never
 * leaves a country with zero features for that source.
 */

import { getServiceClient } from './upsert.ts'
import { geometryToWkt } from './geometryToWkt.ts'

export interface ExposureFeatureInput {
  geometry: { type: string; coordinates: unknown }
  metricValue: number
  properties: Record<string, unknown>
}

// Kontur's H3-hexagon datasets can exceed 400k features per country
// (verified live: Turkey has 458,226) — a single INSERT of that many rows
// would exceed PostgREST's request size limits. Chunking is required, not
// optional, for any source using this writer.
const INSERT_CHUNK_SIZE = 2000

export async function writeExposureDataset(
  sourceName: string,
  countryCode: string,
  metricPropertyName: string,
  features: ExposureFeatureInput[],
): Promise<{ datasetId: string; featureCount: number }> {
  const supabase = getServiceClient()

  const { data: dataset, error: datasetError } = await supabase
    .from('exposure_datasets')
    .insert({
      name: `${sourceName} — ${countryCode} — ${new Date().toISOString().slice(0, 7)}`,
      description: `Auto-imported ${metricPropertyName} data from ${sourceName}`,
      metric_property_name: metricPropertyName,
      feature_count: features.length,
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

  const rows = features.map((feature) => ({
    dataset_id: dataset.id,
    geom: `SRID=4326;${geometryToWkt(feature.geometry)}`,
    metric_value: feature.metricValue,
    properties: feature.properties,
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

  return { datasetId: dataset.id, featureCount: features.length }
}
