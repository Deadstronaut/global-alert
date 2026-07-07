import { describe, it, expect } from 'vitest'
import { filterSopDocuments } from '@/services/sopFilter.js'

const docs = [
  { id: '1', title: 'Earthquake Response Plan', category: 'SOP' },
  { id: '2', title: 'Flood Legislation Summary', category: 'Legislation' },
  { id: '3', title: 'Wildfire Checklist', category: null },
]

describe('filterSopDocuments', () => {
  it('filters by category only', () => {
    const result = filterSopDocuments(docs, { category: 'SOP' })
    expect(result.map((d) => d.id)).toEqual(['1'])
  })

  it('filters by search term only, case-insensitive partial match', () => {
    const result = filterSopDocuments(docs, { searchTerm: 'flood' })
    expect(result.map((d) => d.id)).toEqual(['2'])
  })

  it('applies both filters together (AND)', () => {
    const result = filterSopDocuments(docs, { category: 'Legislation', searchTerm: 'flood' })
    expect(result.map((d) => d.id)).toEqual(['2'])
  })

  it('returns all documents when category and searchTerm are empty/undefined', () => {
    expect(filterSopDocuments(docs, {})).toHaveLength(3)
    expect(filterSopDocuments(docs)).toHaveLength(3)
  })

  it('keeps a document with a null category when no category filter is applied', () => {
    const result = filterSopDocuments(docs, { searchTerm: 'wildfire' })
    expect(result.map((d) => d.id)).toEqual(['3'])
  })
})
