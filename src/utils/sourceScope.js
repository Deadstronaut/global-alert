/**
 * Groups data sources into global vs. local (country-scoped) buckets for display.
 * Feature: 002-source-scoping
 *
 * Read visibility itself is enforced by RLS (see supabase/migrations/20260706_data_sources_country_scope.sql) —
 * by the time `sources` reaches this function it already contains only rows the
 * viewer is permitted to see. This function is purely a display grouping, not a
 * security boundary.
 *
 * @param {Array<{country_code?: string|null}>} sources
 * @param {string|null} [viewerCountryCode] - unused for filtering (RLS already scoped
 *   `sources`), kept for API clarity/future use.
 * @returns {{ global: Array, local: Array }}
 */
export function groupSourcesByScope(sources) {
  const list = sources ?? [];
  return {
    global: list.filter((s) => s.country_code == null),
    local: list.filter((s) => s.country_code != null),
  };
}
