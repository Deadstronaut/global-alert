import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validatePayload } from './validatePayload.ts'

Deno.test('validatePayload: valid earthquake record passes', () => {
  const result = validatePayload({
    id: 'usgs-1',
    lat: 38.5,
    lng: 27.1,
    time: '2026-07-03T12:00:00Z',
    magnitude: 5.2,
  }, 'earthquake')
  assertEquals(result.valid, true)
})

Deno.test('validatePayload: missing required field is rejected with reason', () => {
  const result = validatePayload({
    id: 'usgs-2',
    lat: 38.5,
    // lng missing
    time: '2026-07-03T12:00:00Z',
  }, 'earthquake')
  assertEquals(result.valid, false)
  if (!result.valid) {
    assertEquals(result.reason.includes('lng'), true)
  }
})

Deno.test('validatePayload: out-of-range latitude is rejected', () => {
  const result = validatePayload({
    id: 'usgs-3',
    lat: 137.4,
    lng: 27.1,
    time: '2026-07-03T12:00:00Z',
  }, 'earthquake')
  assertEquals(result.valid, false)
  if (!result.valid) {
    assertEquals(result.reason.toLowerCase().includes('lat'), true)
  }
})

Deno.test('validatePayload: out-of-range longitude is rejected', () => {
  const result = validatePayload({
    id: 'usgs-4',
    lat: 38.5,
    lng: 227.0,
    time: '2026-07-03T12:00:00Z',
  }, 'earthquake')
  assertEquals(result.valid, false)
  if (!result.valid) {
    assertEquals(result.reason.toLowerCase().includes('lng'), true)
  }
})

Deno.test('validatePayload: non-numeric magnitude is rejected', () => {
  const result = validatePayload({
    id: 'usgs-5',
    lat: 38.5,
    lng: 27.1,
    time: '2026-07-03T12:00:00Z',
    magnitude: 'strong',
  }, 'earthquake')
  assertEquals(result.valid, false)
  if (!result.valid) {
    assertEquals(result.reason.toLowerCase().includes('magnitude'), true)
  }
})

Deno.test('validatePayload: missing resolvable timestamp is rejected', () => {
  const result = validatePayload({
    id: 'usgs-6',
    lat: 38.5,
    lng: 27.1,
    time: null,
  }, 'earthquake')
  assertEquals(result.valid, false)
})

Deno.test('validatePayload: never throws on garbage input', () => {
  const result = validatePayload(null, 'earthquake')
  assertEquals(result.valid, false)
})
