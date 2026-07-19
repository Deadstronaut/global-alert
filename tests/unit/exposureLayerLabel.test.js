import { describe, it, expect } from 'vitest'
import { friendlyDatasetLabel } from '@/utils/exposureLayerLabel.js'

const t = (key) => {
  const table = {
    'exposureLayers.sourceLabel.osm': 'Yol Ağı',
    'exposureLayers.sourceLabel.kontur': 'Nüfus Yoğunluğu',
    'exposureLayers.countryLabel.tr': 'Türkiye',
    'exposureLayers.countryLabel.mg': 'Madagaskar',
  }
  return table[key] ?? key
}

describe('friendlyDatasetLabel', () => {
  it('builds a friendly "Source (Country)" label for known source+country', () => {
    expect(friendlyDatasetLabel(t, { source_name: 'osm', country_code: 'tr', name: 'osm — tr — 2026-07' })).toBe('Yol Ağı (Türkiye)')
    expect(friendlyDatasetLabel(t, { source_name: 'kontur', country_code: 'mg', name: 'kontur — mg — 2026-07' })).toBe('Nüfus Yoğunluğu (Madagaskar)')
  })

  it('falls back to raw dataset name for an unknown source_name', () => {
    expect(friendlyDatasetLabel(t, { source_name: 'hydrorivers', country_code: 'tr', name: 'hydrorivers — tr — 2026-08' })).toBe('hydrorivers — tr — 2026-08')
  })

  it('falls back to the raw country code (uppercased) for an unknown country', () => {
    expect(friendlyDatasetLabel(t, { source_name: 'osm', country_code: 'zz', name: 'osm — zz — 2026-07' })).toBe('Yol Ağı (ZZ)')
  })

  it('handles null/undefined dataset without throwing', () => {
    expect(friendlyDatasetLabel(t, null)).toBe('')
    expect(friendlyDatasetLabel(t, undefined)).toBe('')
  })
})
