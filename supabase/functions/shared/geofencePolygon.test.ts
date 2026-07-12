import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { polygonAllowsContact } from './geofencePolygon.ts'

Deno.test('polygonAllowsContact: true (inside polygon) allows the contact', () => {
  assertEquals(polygonAllowsContact(true), true)
})

Deno.test('polygonAllowsContact: false (outside polygon) excludes the contact', () => {
  assertEquals(polygonAllowsContact(false), false)
})

Deno.test('polygonAllowsContact: null (undeterminable) never excludes', () => {
  assertEquals(polygonAllowsContact(null), true)
})

Deno.test('polygonAllowsContact: undefined (RPC not called for this contact) never excludes', () => {
  assertEquals(polygonAllowsContact(undefined), true)
})
