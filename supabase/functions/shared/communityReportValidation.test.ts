import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateReportPayload } from './communityReportValidation.ts'

const validBase = { hazardType: 'earthquake', description: 'Bina duvarında çatlak', lat: 39.92, lng: 32.85 }

Deno.test('validateReportPayload: valid payload without photo passes', () => {
  assertEquals(validateReportPayload(validBase).valid, true)
})

Deno.test('validateReportPayload: missing hazardType fails', () => {
  const result = validateReportPayload({ ...validBase, hazardType: undefined })
  assertEquals(result.valid, false)
})

Deno.test('validateReportPayload: missing description fails', () => {
  const result = validateReportPayload({ ...validBase, description: '' })
  assertEquals(result.valid, false)
})

Deno.test('validateReportPayload: lat out of range fails', () => {
  const result = validateReportPayload({ ...validBase, lat: 120 })
  assertEquals(result.valid, false)
})

Deno.test('validateReportPayload: lng out of range fails', () => {
  const result = validateReportPayload({ ...validBase, lng: -200 })
  assertEquals(result.valid, false)
})

Deno.test('validateReportPayload: missing lat/lng fails', () => {
  assertEquals(validateReportPayload({ ...validBase, lat: undefined }).valid, false)
  assertEquals(validateReportPayload({ ...validBase, lng: undefined }).valid, false)
})

Deno.test('validateReportPayload: valid photo metadata passes', () => {
  const result = validateReportPayload({ ...validBase, photoMimeType: 'image/png', photoSizeBytes: 1024 })
  assertEquals(result.valid, true)
})

Deno.test('validateReportPayload: unsupported photo MIME type fails', () => {
  const result = validateReportPayload({ ...validBase, photoMimeType: 'application/pdf', photoSizeBytes: 1024 })
  assertEquals(result.valid, false)
})

Deno.test('validateReportPayload: oversized photo fails', () => {
  const result = validateReportPayload({ ...validBase, photoMimeType: 'image/jpeg', photoSizeBytes: 6 * 1024 * 1024 })
  assertEquals(result.valid, false)
})

Deno.test('validateReportPayload: valid audio metadata passes', () => {
  const result = validateReportPayload({ ...validBase, audioMimeType: 'audio/webm', audioSizeBytes: 1024 })
  assertEquals(result.valid, true)
})

Deno.test('validateReportPayload: unsupported audio MIME type fails', () => {
  const result = validateReportPayload({ ...validBase, audioMimeType: 'video/mp4', audioSizeBytes: 1024 })
  assertEquals(result.valid, false)
})

Deno.test('validateReportPayload: oversized audio fails', () => {
  const result = validateReportPayload({ ...validBase, audioMimeType: 'audio/webm', audioSizeBytes: 11 * 1024 * 1024 })
  assertEquals(result.valid, false)
})

Deno.test('validateReportPayload: photo and audio together both pass', () => {
  const result = validateReportPayload({
    ...validBase,
    photoMimeType: 'image/png',
    photoSizeBytes: 1024,
    audioMimeType: 'audio/mpeg',
    audioSizeBytes: 2048,
  })
  assertEquals(result.valid, true)
})
