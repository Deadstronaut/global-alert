import { describe, it, expect } from 'vitest'
import { institutionCategoriesForFindings, INSTITUTION_CATEGORIES } from '@/utils/institutionCategoryMap.js'

describe('institutionCategoriesForFindings', () => {
  it('returns [] for empty/missing findings', () => {
    expect(institutionCategoriesForFindings([])).toEqual([])
    expect(institutionCategoriesForFindings(null)).toEqual([])
    expect(institutionCategoriesForFindings(undefined)).toEqual([])
  })

  it('deduplicates categories shared across multiple findings', () => {
    const findings = [
      { institutionCategories: ['fire_department', 'health'] },
      { institutionCategories: ['health', 'disaster_management'] },
    ]
    const result = institutionCategoriesForFindings(findings)
    expect(result.map((c) => c.id).sort()).toEqual(['disaster_management', 'fire_department', 'health'])
  })

  it('silently drops unrecognized category ids instead of fabricating a label', () => {
    const findings = [{ institutionCategories: ['not_a_real_category'] }]
    expect(institutionCategoriesForFindings(findings)).toEqual([])
  })

  it('never returns a real institution name, only category ids from the fixed list', () => {
    const findings = [{ institutionCategories: ['fire_department'] }]
    const result = institutionCategoriesForFindings(findings)
    expect(result).toEqual([{ id: 'fire_department', labelKey: 'lateralRisk.institution.fireDepartment' }])
    expect(INSTITUTION_CATEGORIES.every((c) => typeof c.labelKey === 'string')).toBe(true)
  })
})
