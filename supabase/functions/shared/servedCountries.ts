/**
 * "Served countries" — the single source of truth for which countries this
 * deployment serves, derived from country_boundaries (populated once per
 * country at onboarding, e.g. 20260706220000_seed_tr_country_boundary.sql).
 *
 * MUST be used instead of any hardcoded country list, and instead of the
 * frontend-only src/data/boundaries/*.json files (unreachable from an Edge
 * Function, and themselves the static-per-country-file pattern this system
 * is moving away from) — see spec 038 data-model.md §4a.
 */

import { getServiceClient } from './upsert.ts'

export async function getServedCountryCodes(): Promise<string[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('country_boundaries')
    .select('country_code')

  if (error) {
    throw new Error(`Failed to load served country codes: ${error.message}`)
  }

  const codes = new Set<string>((data ?? []).map((row: { country_code: string }) => row.country_code))
  return Array.from(codes)
}
