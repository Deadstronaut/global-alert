import { describe, it, expect } from 'vitest'
import { buildFeaturePopupHtml } from '@/utils/exposureFeaturePopup.js'

describe('buildFeaturePopupHtml', () => {
  it('renders metric value and properties generically', () => {
    const dataset = { name: 'OSM Roads (Turkey)', metric_property_name: 'length_m' }
    const html = buildFeaturePopupHtml(dataset, 1250.4, { highway: 'motorway', name: 'O-4', osmId: 123 })
    expect(html).toContain('OSM Roads (Turkey)')
    expect(html).toContain('1250.4')
    expect(html).toContain('motorway')
    expect(html).toContain('O-4')
    expect(html).toContain('123')
  })

  it('renders only the metric value when properties are empty/missing, without crashing', () => {
    const dataset = { name: 'Population Zones', metric_property_name: 'population' }
    expect(() => buildFeaturePopupHtml(dataset, 4200, {})).not.toThrow()
    expect(() => buildFeaturePopupHtml(dataset, 4200, null)).not.toThrow()
    expect(() => buildFeaturePopupHtml(dataset, 4200, undefined)).not.toThrow()
    const html = buildFeaturePopupHtml(dataset, 4200, null)
    expect(html).toContain('4200')
  })

  it('renders arbitrary/unknown property keys generically, not dropped', () => {
    const dataset = { name: 'HydroBASINS' }
    const html = buildFeaturePopupHtml(dataset, null, { pfaf_id: 'PF12345', basin_area_km2: 23745.5, someUnknownFutureKey: 'x' })
    expect(html).toContain('PF12345')
    expect(html).toContain('23745.5')
    expect(html).toContain('x')
  })

  it('never throws on missing dataset metadata', () => {
    expect(() => buildFeaturePopupHtml(null, null, null)).not.toThrow()
    expect(() => buildFeaturePopupHtml({}, undefined, {})).not.toThrow()
  })

  it('escapes HTML in property values to avoid injecting markup', () => {
    const html = buildFeaturePopupHtml({ name: 'Test' }, null, { name: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
