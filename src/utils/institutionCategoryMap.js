/**
 * Spec 071 (Çapraz-Afet Risk Çıkarımı ve Öngörü Raporu) — a fixed list of
 * general institution CATEGORIES (fire department, health, etc.), never a
 * real institution's name or contact info. FR-008: the report only ever
 * suggests "this kind of institution should probably be informed", never
 * names or contacts a specific one — that stays entirely the user's own
 * call (FR-009: this system never sends anything itself).
 */

// The ONE copy of this list (Constitution I) — a LateralRiskRule's
// `institutionCategories` field references these ids.
export const INSTITUTION_CATEGORIES = [
  { id: 'fire_department', labelKey: 'lateralRisk.institution.fireDepartment' },
  { id: 'health', labelKey: 'lateralRisk.institution.health' },
  { id: 'disaster_management', labelKey: 'lateralRisk.institution.disasterManagement' },
  { id: 'water_infrastructure', labelKey: 'lateralRisk.institution.waterInfrastructure' },
]

const CATEGORY_BY_ID = new Map(INSTITUTION_CATEGORIES.map((c) => [c.id, c]))

/**
 * @param {{ institutionCategories?: string[] }[]} findings
 * @returns {{ id: string, labelKey: string }[]} deduplicated, in
 *   INSTITUTION_CATEGORIES' own order — unrecognized ids are silently
 *   dropped rather than fabricating a label for them.
 */
export function institutionCategoriesForFindings(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return []
  const wanted = new Set()
  for (const finding of findings) {
    for (const id of finding?.institutionCategories ?? []) wanted.add(id)
  }
  return INSTITUTION_CATEGORIES.filter((c) => wanted.has(c.id))
}
