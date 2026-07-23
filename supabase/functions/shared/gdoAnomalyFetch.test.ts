import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { douglasPeucker, simplifyGeometry } from './gdoAnomalyFetch.ts'

Deno.test('douglasPeucker: keeps endpoints, drops near-collinear midpoints below tolerance', () => {
  const line = [[0, 0], [1, 0.001], [2, -0.001], [3, 0.001], [4, 0]]
  const result = douglasPeucker(line, 0.01)
  assertEquals(result[0], [0, 0])
  assertEquals(result[result.length - 1], [4, 0])
  assert(result.length < line.length, 'should drop at least one near-collinear point')
})

Deno.test('douglasPeucker: keeps a real corner (distance exceeds tolerance)', () => {
  const line = [[0, 0], [1, 5], [2, 0]]
  const result = douglasPeucker(line, 0.1)
  assertEquals(result, line)
})

Deno.test('douglasPeucker: drastically reduces a dense wiggly coastline-like ring', () => {
  // Simulates a "detailed coastline" — thousands of points wiggling within
  // a small tolerance band, which is exactly what makes Madagascar's real
  // boundary (~700KB GeoJSON) expensive per this file's header comment.
  const ring: number[][] = []
  const n = 5000
  for (let i = 0; i <= n; i++) {
    const angle = (i / n) * Math.PI * 2
    const wiggle = Math.sin(i * 0.7) * 0.0001 // sub-tolerance noise
    ring.push([Math.cos(angle) * 10 + wiggle, Math.sin(angle) * 10 + wiggle])
  }
  const simplified = douglasPeucker(ring, 0.05)
  assert(simplified.length < ring.length / 10, `expected >10x reduction, got ${ring.length} -> ${simplified.length}`)
})

Deno.test('simplifyGeometry: Polygon — a point well inside the simplified shape is still classified inside', () => {
  // A near-circular polygon with dense noisy vertices (same shape as the
  // douglasPeucker wiggly-ring test above) — the simplification must not
  // change whether an obviously-interior point (the origin) is inside.
  const ring: number[][] = []
  const n = 2000
  for (let i = 0; i <= n; i++) {
    const angle = (i / n) * Math.PI * 2
    const wiggle = Math.sin(i * 0.9) * 0.0001
    ring.push([Math.cos(angle) * 10 + wiggle, Math.sin(angle) * 10 + wiggle])
  }
  ring[ring.length - 1] = ring[0] // close the ring
  const geometry: GeoJSON.Geometry = { type: 'Polygon', coordinates: [ring] }
  const simplified = simplifyGeometry(geometry, 0.05) as GeoJSON.Polygon

  assert(simplified.coordinates[0].length < ring.length / 5, 'ring should be substantially simplified')
  // Re-verify with the same ray-casting logic this module actually uses
  // (duplicated minimally here rather than importing an unexported
  // internal — see gdoAnomalyFetch.ts for the real implementation this
  // mirrors).
  function pointInRing(point: [number, number], r: number[][]): boolean {
    const [x, y] = point
    let inside = false
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i]
      const [xj, yj] = r[j]
      const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
      if (intersects) inside = !inside
    }
    return inside
  }
  assertEquals(pointInRing([0, 0], simplified.coordinates[0]), true)
  assertEquals(pointInRing([100, 100], simplified.coordinates[0]), false)
})

Deno.test('simplifyGeometry: tiny ring (below 4 points after simplification) falls back to the original', () => {
  const ring = [[0, 0], [0.001, 0.001], [0.002, 0], [0, 0]]
  const geometry: GeoJSON.Geometry = { type: 'Polygon', coordinates: [ring] }
  const simplified = simplifyGeometry(geometry, 10) as GeoJSON.Polygon // huge tolerance would collapse it
  assertEquals(simplified.coordinates[0], ring)
})

Deno.test('simplifyGeometry: GeometryCollection recurses into each member', () => {
  const ring = [[0, 0], [1, 5], [2, 0], [0, 0]]
  const geometry: GeoJSON.Geometry = {
    type: 'GeometryCollection',
    geometries: [{ type: 'Polygon', coordinates: [ring] }],
  }
  const simplified = simplifyGeometry(geometry, 0.01) as GeoJSON.GeometryCollection
  assertEquals(simplified.type, 'GeometryCollection')
  assertEquals((simplified.geometries[0] as GeoJSON.Polygon).coordinates[0], ring)
})
