import { describe, it, expect } from 'vitest'
import { groupSourcesByScope } from '@/utils/sourceScope.js'

describe('groupSourcesByScope', () => {
  it('splits mixed global and local sources', () => {
    const sources = [
      { id: '1', country_code: null },
      { id: '2', country_code: 'TR' },
      { id: '3', country_code: null },
    ]
    const { global: globalSources, local } = groupSourcesByScope(sources)
    expect(globalSources.map((s) => s.id)).toEqual(['1', '3'])
    expect(local.map((s) => s.id)).toEqual(['2'])
  })

  it('returns an empty local group when every source is global', () => {
    const sources = [{ id: '1', country_code: null }]
    const { global: globalSources, local } = groupSourcesByScope(sources)
    expect(globalSources).toHaveLength(1)
    expect(local).toEqual([])
  })

  it('handles an empty input without throwing', () => {
    expect(groupSourcesByScope([])).toEqual({ global: [], local: [] })
    expect(groupSourcesByScope(undefined)).toEqual({ global: [], local: [] })
  })

  it('preserves each local source\'s own country_code for multi-country (super_admin) labeling', () => {
    const sources = [
      { id: '1', country_code: 'TR' },
      { id: '2', country_code: 'MG' },
    ]
    const { local } = groupSourcesByScope(sources)
    expect(local.map((s) => s.country_code)).toEqual(['TR', 'MG'])
  })

  it('does not mutate the input array', () => {
    const sources = [{ id: '1', country_code: null }]
    const copy = [...sources]
    groupSourcesByScope(sources)
    expect(sources).toEqual(copy)
  })
})
