import { describe, it, expect } from 'vitest'
import { disasterSourceBadges } from '@/utils/disasterSourceBadges.js'

describe('disasterSourceBadges', () => {
  it('renders one badge per contributing agency, with magnitude', () => {
    const event = {
      source: 'USGS',
      magnitude: 5.0,
      contributingSources: [
        { source: 'USGS', magnitude: 5.0 },
        { source: 'EMSC', magnitude: 5.1 },
        { source: 'Kandilli', magnitude: 4.9 },
      ],
    }
    const badges = disasterSourceBadges(event)
    expect(badges.map((b) => b.label)).toEqual(['USGS M5.0', 'EMSC M5.1', 'Kandilli M4.9'])
  })

  it('falls back to the event\'s own single source when contributingSources is empty (pre-migration rows)', () => {
    const event = { source: 'AFAD', magnitude: 3.4, contributingSources: [] }
    const badges = disasterSourceBadges(event)
    expect(badges).toEqual([{ source: 'AFAD', label: 'AFAD M3.4' }])
  })

  it('falls back when contributingSources is missing entirely', () => {
    const event = { source: 'Kandilli', magnitude: 1.2 }
    const badges = disasterSourceBadges(event)
    expect(badges).toEqual([{ source: 'Kandilli', label: 'Kandilli M1.2' }])
  })

  it('omits the magnitude suffix when magnitude is not a finite number', () => {
    const event = { source: 'GDACS', magnitude: null, contributingSources: [] }
    const badges = disasterSourceBadges(event)
    expect(badges).toEqual([{ source: 'GDACS', label: 'GDACS' }])
  })

  it('never throws on a missing/null event', () => {
    expect(() => disasterSourceBadges(null)).not.toThrow()
    expect(() => disasterSourceBadges(undefined)).not.toThrow()
    expect(disasterSourceBadges(null)).toEqual([])
  })
})
