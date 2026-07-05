import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { gdacsSplit, type GdacsFeature } from './gdacsSplit.ts'

function feature(eventtype: string, overrides: Partial<GdacsFeature['properties']> = {}): GdacsFeature {
  return {
    geometry: { coordinates: [125.1965, 5.2392] },
    properties: {
      eventtype,
      eventid: 1,
      name: `Test ${eventtype}`,
      alertlevel: 'Orange',
      country: 'Testland',
      fromdate: '2026-07-06T00:00:00Z',
      severitydata: { severity: 5, severitytext: 'test' },
      ...overrides,
    },
  }
}

Deno.test('gdacsSplit: routes EQ/WF/FL/DR into their respective buckets', () => {
  const result = gdacsSplit([
    feature('EQ'),
    feature('WF'),
    feature('FL'),
    feature('DR'),
  ])
  assertEquals(result.earthquake.length, 1)
  assertEquals(result.wildfire.length, 1)
  assertEquals(result.flood.length, 1)
  assertEquals(result.drought.length, 1)
  assertEquals(result.dropped.length, 0)
})

Deno.test('gdacsSplit: TC and VO are dropped with a reason, not stored', () => {
  const result = gdacsSplit([feature('TC'), feature('VO')])
  assertEquals(result.earthquake.length, 0)
  assertEquals(result.wildfire.length, 0)
  assertEquals(result.flood.length, 0)
  assertEquals(result.drought.length, 0)
  assertEquals(result.dropped.length, 2)
  assertEquals(result.dropped[0].eventtype, 'TC')
  assertEquals(result.dropped[0].reason.includes('TC'), true)
  assertEquals(result.dropped[1].eventtype, 'VO')
})

Deno.test('gdacsSplit: unrecognized/missing eventtype is dropped, not silently ignored', () => {
  const result = gdacsSplit([feature('XX'), { geometry: { coordinates: [0, 0] }, properties: {} }])
  assertEquals(result.dropped.length, 2)
  assertEquals(result.dropped[0].eventtype, 'XX')
  assertEquals(result.dropped[1].eventtype, '(missing)')
})

Deno.test('gdacsSplit: empty or null input produces all-empty buckets, no throw', () => {
  assertEquals(gdacsSplit([]), { earthquake: [], wildfire: [], flood: [], drought: [], dropped: [] })
  assertEquals(gdacsSplit(null), { earthquake: [], wildfire: [], flood: [], drought: [], dropped: [] })
  assertEquals(gdacsSplit(undefined), { earthquake: [], wildfire: [], flood: [], drought: [], dropped: [] })
})

Deno.test('gdacsSplit: does not mutate the input array', () => {
  const input = [feature('EQ')]
  const copy = JSON.parse(JSON.stringify(input))
  gdacsSplit(input)
  assertEquals(input, copy)
})
