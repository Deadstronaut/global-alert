import { describe, it, expect } from 'vitest'
import { friendlyDatasetLabel } from '@/utils/exposureLayerLabel.js'

const t = (key) => {
  const table = {
    'exposureLayers.sourceLabel.osm': 'Yol Ağı',
    'exposureLayers.sourceLabel.kontur': 'Nüfus Yoğunluğu',
    'exposureLayers.sourceLabel.hydrorivers': 'Nehir Ağı',
    'exposureLayers.sourceLabel.hydrobasins': 'Havza Sınırları',
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

  it('builds a friendly label for the newly-added hydrorivers/hydrobasins sources', () => {
    expect(friendlyDatasetLabel(t, { source_name: 'hydrorivers', country_code: 'tr', name: 'hydrorivers — tr — 2026-07' })).toBe('Nehir Ağı (Türkiye)')
    expect(friendlyDatasetLabel(t, { source_name: 'hydrobasins', country_code: 'mg', name: 'hydrobasins — mg — 2026-07' })).toBe('Havza Sınırları (Madagaskar)')
  })

  it('falls back to raw dataset name for a genuinely unknown source_name', () => {
    expect(friendlyDatasetLabel(t, { source_name: 'future_source', country_code: 'tr', name: 'future_source — tr — 2026-08' })).toBe('future_source — tr — 2026-08')
  })

  it('falls back to the raw country code (uppercased) for an unknown country', () => {
    expect(friendlyDatasetLabel(t, { source_name: 'osm', country_code: 'zz', name: 'osm — zz — 2026-07' })).toBe('Yol Ağı (ZZ)')
  })

  it('handles null/undefined dataset without throwing', () => {
    expect(friendlyDatasetLabel(t, null)).toBe('')
    expect(friendlyDatasetLabel(t, undefined)).toBe('')
  })

  it('prefers display_name over the curated source+country label when set', () => {
    expect(
      friendlyDatasetLabel(t, {
        source_name: 'osm',
        country_code: 'tr',
        name: 'osm — tr — 2026-07',
        display_name: 'Türkiye Yol Ağı (Özel)',
      }),
    ).toBe('Türkiye Yol Ağı (Özel)')
  })

  it('prefers display_name over the raw-name fallback for an unknown source', () => {
    expect(
      friendlyDatasetLabel(t, {
        source_name: 'future_source',
        country_code: 'tr',
        name: 'future_source — tr — 2026-08',
        display_name: 'Yeni Kaynak (Türkiye)',
      }),
    ).toBe('Yeni Kaynak (Türkiye)')
  })

  it('ignores a blank/whitespace-only display_name and falls through normally', () => {
    expect(
      friendlyDatasetLabel(t, { source_name: 'osm', country_code: 'tr', name: 'osm — tr — 2026-07', display_name: '   ' }),
    ).toBe('Yol Ağı (Türkiye)')
  })
})
