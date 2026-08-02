import { describe, it, expect } from 'vitest'
import { buildFeaturePopupHtml } from '@/utils/exposureFeaturePopup.js'

// Identity translate — these datasets don't set source_name, so
// friendlyDatasetLabel() falls back to dataset.name regardless of what t()
// returns, matching how it behaves for any not-yet-localized source.
const t = (key) => key

describe('buildFeaturePopupHtml', () => {
  it('renders metric value and properties generically', () => {
    const dataset = { name: 'OSM Roads (Turkey)', metric_property_name: 'length_m' }
    const html = buildFeaturePopupHtml(t, dataset, 1250.4, { highway: 'motorway', name: 'O-4', lanes: 4 })
    expect(html).toContain('OSM ROADS (TURKEY)') // header chip, uppercased like the disaster-popup type-chip
    expect(html).toContain('1250.4')
    expect(html).toContain('motorway')
    expect(html).toContain('O-4')
    expect(html).toContain('4')
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
    expect(html).toContain('TR') // still shown, just the compact footer code
  })

  it('title has no "(Country)" suffix — the popup is already scoped to one country', () => {
    const dataset = { name: 'Test', source_name: 'worldpop', country_code: 'tr' }
    const html = buildFeaturePopupHtml(t, dataset, 42, {})
    expect(html).not.toContain('(TR')
  })

  it('drops internal/technical property keys (h3 cell id, raw source, row id, osm bookkeeping)', () => {
    const dataset = { name: 'Buildings' }
    const html = buildFeaturePopupHtml(t, dataset, null, {
      h3_cell: '872dabb59fffff',
      source: 'building_footprints',
      id: 42,
      osmId: 123456,
      osmType: 'way',
      building_count: 77,
    })
    expect(html).not.toContain('872dabb59fffff')
    expect(html).not.toContain('building_footprints')
    expect(html).not.toContain('123456')
    expect(html).toContain('77') // building_count's value still renders
  })

  it('translates a known facilityType value instead of showing the raw OSM tag', () => {
    // Mimics real vue-i18n's t(key, defaultValue) fallback behavior, unlike
    // the plain identity `t` above — this is the one property whose VALUE
    // (not just its key) goes through translation.
    const tWithDict = (key, fallback) => {
      const dict = { 'facilityType.university': 'Üniversite' }
      return dict[key] ?? fallback ?? key
    }
    const dataset = { name: 'Critical Infrastructure' }
    const html = buildFeaturePopupHtml(tWithDict, dataset, null, { facilityType: 'university' })
    expect(html).toContain('Üniversite')
    expect(html).not.toContain('>university<')
  })

  it('falls back to the raw value for an untranslated facilityType', () => {
    const tWithDict = (key, fallback) => fallback ?? key
    const dataset = { name: 'Critical Infrastructure' }
    const html = buildFeaturePopupHtml(tWithDict, dataset, null, { facilityType: 'some_future_tag' })
    expect(html).toContain('some_future_tag')
  })

  describe('osm-buildings (generic card, no bespoke treatment)', () => {
    // The map marker already labels the facility by name, so a bespoke
    // icon+name card duplicating it read as redundant rather than an
    // improvement — this source deliberately goes through the same
    // generic path as any other, still with the facilityType value
    // translated and its metric shown like any other dataset's.
    const dataset = { source_name: 'osm-buildings', country_code: 'tr' }

    it('renders name/facilityType generically, not via the density card', () => {
      const tWithDict = (key, fallback) => (key === 'facilityType.hospital' ? 'Hastane' : fallback ?? key)
      const html = buildFeaturePopupHtml(tWithDict, dataset, 1, { facilityType: 'hospital', name: 'Şehir Hastanesi' })
      expect(html).toContain('Hastane')
      expect(html).toContain('Şehir Hastanesi')
      expect(html).not.toContain('density-popup')
    })

    it('never shows the meaningless "Count: 1" row (metric_value is always 1 for this source)', () => {
      const html = buildFeaturePopupHtml(t, dataset, 1, { facilityType: 'school', name: 'Cebeli Bereket Ortaokulu' })
      expect(html).not.toMatch(/>\s*Count\s*<\/b>/i)
    })

    it('shows a facility-kind icon in the header', () => {
      const html = buildFeaturePopupHtml(t, dataset, 1, { facilityType: 'school' })
      expect(html).toContain('facility-popup-icon')
      expect(html).toContain('🏫')
    })
  })

  describe('building_footprints (bespoke density card)', () => {
    const dataset = { source_name: 'building_footprints', country_code: 'tr' }

    it('leads with the building count, never a facility type/name (this source never has one)', () => {
      const html = buildFeaturePopupHtml(t, dataset, 127, { h3Cell: '872dabb59fffff', source: 'building_footprints' })
      expect(html).toContain('127')
      expect(html).toContain('density-popup')
      expect(html).not.toContain('872dabb59fffff')
    })
  })
})
