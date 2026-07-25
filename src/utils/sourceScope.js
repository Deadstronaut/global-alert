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

// Sources tab sort control (2026-07-25 request) — the default fetch order
// (sources.js's .order('hazard_type').order('name')) is fine as a default
// but gives no way to e.g. pull failing sources to the top when doing
// maintenance, so this is a distinct, explicit sort applied before grouping.
const STATUS_PRIORITY = { down: 0, degraded: 1, healthy: 2, disabled: 3 };

export const SOURCE_SORT_MODES = [
  { value: 'hazard', label: 'Afet Tipine Göre' },
  { value: 'name', label: 'İsme Göre (A-Z)' },
  { value: 'created', label: 'Eklenme Tarihine Göre (yeni önce)' },
  { value: 'status', label: 'Duruma Göre (arızalı önce)' },
]

export function sortSources(sources, mode) {
  const list = [...(sources ?? [])]
  switch (mode) {
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    case 'created':
      return list.sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
    case 'status':
      return list.sort((a, b) => (STATUS_PRIORITY[a.health_state] ?? 9) - (STATUS_PRIORITY[b.health_state] ?? 9))
    case 'hazard':
    default:
      return list.sort((a, b) => a.hazard_type.localeCompare(b.hazard_type) || a.name.localeCompare(b.name, 'tr'))
  }
}
