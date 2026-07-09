/**
 * One-time-at-onboarding HDX dataset resolution for Kontur/Meta population
 * data (spec 038 data-model.md §5a). NOT called by the scheduled import
 * functions themselves — those read the already-resolved row from
 * population_source_country_datasets. Live-verified during planning
 * (research.md §4): HDX's `groups` field is a structured, controlled ISO3
 * country-code filter, e.g. `fq=organization:kontur+AND+groups:tur`
 * reliably resolves Turkey's Kontur Population package.
 *
 * On zero or multiple matches, returns null and writes nothing — this is
 * surfaced to the caller (onboarding flow / admin action) as "needs manual
 * entry," never guessed (Principle IV).
 */

import { getServiceClient } from './upsert.ts'
import { iso3ToIso2 } from './iso3166.ts'

const HDX_SEARCH_URL = 'https://data.humdata.org/api/3/action/package_search'

interface HdxPackageSearchResult {
  success: boolean
  result?: {
    count: number
    results: Array<{ id: string; title: string }>
  }
}

export type PopulationHdxSourceOrg = 'kontur' | 'meta'

const SOURCE_NAME_BY_ORG: Record<PopulationHdxSourceOrg, 'kontur' | 'meta_hdx'> = {
  kontur: 'kontur',
  meta: 'meta_hdx',
}

/**
 * Pure decision function — no I/O — so match selection can be unit tested
 * without a live HDX call (see resolveHdxCountryDataset.test.ts), matching
 * this codebase's existing convention (sourceHealth.ts's computeNextState).
 * Zero or multiple results are treated identically: do not guess which one
 * is right (Principle IV) — only an unambiguous single match is accepted.
 */
export function selectHdxMatch(
  results: Array<{ id: string; title: string }>,
): { datasetId: string; title: string } | null {
  if (results.length !== 1) return null
  const [match] = results
  return { datasetId: match.id, title: match.title }
}

export async function resolveHdxCountryDataset(
  sourceOrg: PopulationHdxSourceOrg,
  countryIso3Lower: string,
): Promise<{ datasetId: string; title: string } | null> {
  const url = `${HDX_SEARCH_URL}?fq=organization:${sourceOrg}+AND+groups:${countryIso3Lower}&rows=5`

  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) {
    throw new Error(`HDX package_search failed: HTTP ${response.status}`)
  }

  const body = (await response.json()) as HdxPackageSearchResult
  if (!body.success || !body.result) {
    throw new Error('HDX package_search returned an unsuccessful response')
  }

  const match = selectHdxMatch(body.result.results)
  if (!match) {
    // Zero or ambiguous matches — do not guess (Principle IV).
    return null
  }

  const sourceName = SOURCE_NAME_BY_ORG[sourceOrg]

  const countryCode = iso3ToIso2(countryIso3Lower)
  if (!countryCode) {
    throw new Error(`Unknown ISO3 country code: ${countryIso3Lower}`)
  }

  const supabase = getServiceClient()

  const { error } = await supabase
    .from('population_source_country_datasets')
    .upsert(
      {
        source_name: sourceName,
        country_code: countryCode,
        dataset_reference: match.datasetId,
        resolved_at: new Date().toISOString(),
        resolved_by: 'hdx_search',
      },
      { onConflict: 'source_name,country_code' },
    )

  if (error) {
    throw new Error(`Failed to persist resolved HDX dataset: ${error.message}`)
  }

  return match
}
