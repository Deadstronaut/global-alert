import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildAdminBoundaryResolver } from './adminBoundaryLookup.ts'

const SQUARE_DISTRICT = {
  type: 'FeatureCollection',
  features: [
    {
      properties: { shapeName: 'TestDistrict' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]] },
    },
  ],
}

function fakeSupabase(row: { geojson: unknown; name_property: string } | null) {
  return {
    from() {
      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        async maybeSingle() {
          return { data: row, error: null }
        },
      }
    },
  }
}

Deno.test('buildAdminBoundaryResolver: resolves a feature centroid to its district', async () => {
  const supabase = fakeSupabase({ geojson: SQUARE_DISTRICT, name_property: 'shapeName' })
  const resolve = await buildAdminBoundaryResolver(supabase, 'tr')
  const featureGeometry = { type: 'Polygon', coordinates: [[[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]]] }
  assertEquals(resolve(featureGeometry), 'TestDistrict')
})

Deno.test('buildAdminBoundaryResolver: null for a feature outside every district', async () => {
  const supabase = fakeSupabase({ geojson: SQUARE_DISTRICT, name_property: 'shapeName' })
  const resolve = await buildAdminBoundaryResolver(supabase, 'tr')
  const featureGeometry = { type: 'Polygon', coordinates: [[[500, 500], [500, 506], [506, 506], [506, 500], [500, 500]]] }
  assertEquals(resolve(featureGeometry), null)
})

Deno.test('buildAdminBoundaryResolver: falls back to a no-op resolver when no district set is seeded', async () => {
  const supabase = fakeSupabase(null)
  const resolve = await buildAdminBoundaryResolver(supabase, 'zz')
  assertEquals(resolve({ type: 'Polygon', coordinates: [[[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]]] }), null)
})
