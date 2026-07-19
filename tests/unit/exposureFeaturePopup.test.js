import { describe, it, expect } from 'vitest'
import { buildFeaturePopupHtml } from '@/utils/exposureFeaturePopup.js'

// Identity translate — these datasets don't set source_name, so
// friendlyDatasetLabel() falls back to dataset.name regardless of what t()
// returns, matching how it behaves for any not-yet-localized source.
const t = (key) => key

describe('buildFeaturePopupHtml', () => {
  it('renders metric value and properties generically', () => {
    const dataset = { name: 'OSM Roads (Turkey)', metric_property_name: 'length_m' }
    const html = buildFeaturePopupHtml(t, dataset, 1250.4, { highway: 'motorway', name: 'O-4', osmId: 123 })
    expect(html).toContain('OSM ROADS (TURKEY)') // header chip, uppercased like the disaster-popup type-chip
    expect(html).toContain('1250.4')
    expect(html).toContain('motorway')
    expect(html).toContain('O-4')
    expect(html).toContain('123')
  })

  it('renders only the metric value when properties are empty/missing, without crashing', () => {
    const dataset = { name: 'Population Zones', metric_property_name: 'population' }
    expect(() => buildFeaturePopupHtml(t, dataset, 4200, {})).not.toThrow()
    expect(() => buildFeaturePopupHtml(t, dataset, 4200, null)).not.toThrow()
    expect(() => buildFeaturePopupHtml(t, dataset, 4200, undefined)).not.toThrow()
    const html = buildFeaturePopupHtml(t, dataset, 4200, null)
    expect(html).toContain('4200')
  })

  it('renders arbitrary/unknown property keys generically, not dropped', () => {
    const dataset = { name: 'HydroBASINS' }
    const html = buildFeaturePopupHtml(t, dataset, null, { pfaf_id: 'PF12345', basin_area_km2: 23745.5, someUnknownFutureKey: 'x' })
    expect(html).toContain('PF12345')
    expect(html).toContain('23745.5')
    expect(html).toContain('x')
  })

  it('never throws on missing dataset metadata', () => {
    expect(() => buildFeaturePopupHtml(t, null, null, null)).not.toThrow()
    expect(() => buildFeaturePopupHtml(t, {}, undefined, {})).not.toThrow()
  })

  it('escapes HTML in property values to avoid injecting markup', () => {
    const html = buildFeaturePopupHtml(t, { name: 'Test' }, null, { name: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('reuses the same card skeleton as the disaster-event popup for visual consistency', () => {
    const html = buildFeaturePopupHtml(t, { name: 'Test', source_name: 'worldpop', country_code: 'tr' }, 42, {})
    expect(html).toContain('disaster-popup-modern')
    expect(html).toContain('popup-header')
    expect(html).toContain('popup-metrics')
    expect(html).toContain('popup-footer')
    expect(html).toContain('WORLDPOP') // raw source, uppercased — matches the footer source-chip's logic elsewhere
    expect(html).toContain('TR')
  })
})
