/**
 * Edge Function: upload-exposure-dataset
 * Validates an uploaded GeoJSON FeatureCollection (spec 008, US1) and, on
 * success, inserts one exposure_datasets row plus one exposure_features row
 * per feature, scoped to the caller's own country_code/org_id. Rejects
 * non-admin roles. Nothing is written if validation fails (FR-002).
 * Called by: ExposureDatasetManager.vue
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { validateGeojson } from '../shared/geojsonValidation.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

const ADMIN_ROLES = ['org_admin', 'country_admin', 'super_admin']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const admin = adminClient()

  const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (callerAuthError || !callerAuth.user) return json({ error: 'Invalid session' }, 401)

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('profiles')
    .select('role, country_code, org_id')
    .eq('id', callerAuth.user.id)
    .maybeSingle()
  if (callerProfileError || !callerProfile) return json({ error: 'Caller profile not found' }, 403)

  if (!ADMIN_ROLES.includes(callerProfile.role)) {
    return json({ error: 'Only org_admin, country_admin, or super_admin may upload exposure datasets' }, 403)
  }

  let body: { name?: string; description?: string; metricPropertyName?: string; geojson?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { name, description, metricPropertyName, geojson } = body
  if (!name || typeof name !== 'string') return json({ error: 'name is required' }, 400)
  if (!metricPropertyName || typeof metricPropertyName !== 'string') {
    return json({ error: 'metricPropertyName is required' }, 400)
  }

  const validation = validateGeojson(geojson, metricPropertyName)
  if (!validation.valid) return json({ error: validation.error }, 400)

  const features = (geojson as { features: Array<{ geometry: unknown; properties: Record<string, unknown> }> }).features

  const { data: dataset, error: datasetError } = await admin
    .from('exposure_datasets')
    .insert({
      name,
      description: description ?? null,
      metric_property_name: metricPropertyName,
      feature_count: features.length,
      country_code: callerProfile.country_code,
      org_id: callerProfile.org_id,
      created_by: callerAuth.user.id,
    })
    .select('id')
    .single()

  if (datasetError || !dataset) {
    return json({ error: datasetError?.message ?? 'Failed to create exposure dataset' }, 500)
  }

  let rows: Array<{
    dataset_id: string
    geom: string
    metric_value: number
    properties: Record<string, unknown>
    asset_category: string | null
    sector: string | null
    admin_boundary_code: string | null
  }>
  try {
    rows = features.map((feature) => ({
      dataset_id: dataset.id,
      geom: `SRID=4326;${geometryToWkt(feature.geometry as { type: string; coordinates: unknown })}`,
      metric_value: Number(feature.properties[metricPropertyName]),
      properties: feature.properties,
      // spec 034 (US1/US3): optional tagging read straight from the
      // GeoJSON feature's own properties, using fixed key names — no new
      // upload-form fields, no schema/config change needed to add a value
      // (hazard-agnostic/model-driven principle). Absent => null =>
      // "unclassified" downstream (FR-003/FR-009).
      asset_category: normalizeTagValue(feature.properties.asset_category),
      sector: normalizeTagValue(feature.properties.sector),
      admin_boundary_code: normalizeTagValue(feature.properties.admin_boundary_code),
    }))
  } catch (err) {
    await admin.from('exposure_datasets').delete().eq('id', dataset.id)
    return json({ error: err instanceof Error ? err.message : 'Unsupported geometry type' }, 400)
  }

  const { error: featuresError } = await admin.from('exposure_features').insert(rows)
  if (featuresError) {
    // Roll back the dataset row so a partial upload never lingers (FR-002).
    await admin.from('exposure_datasets').delete().eq('id', dataset.id)
    return json({ error: featuresError.message }, 500)
  }

  return json({ datasetId: dataset.id, featureCount: features.length })
})

// Optional tagging properties (asset_category/sector/admin_boundary_code)
// come from arbitrary user-uploaded GeoJSON — coerce anything non-string
// (including empty string) to null rather than storing "undefined"/"[object
// Object]" style garbage.
function normalizeTagValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// Minimal GeoJSON-geometry-to-WKT converter covering the geometry types
// realistically produced by common GIS export tools (Point/Polygon/
// MultiPolygon) — sufficient for exposure-dataset uploads without pulling in
// a full GIS conversion library (Principle VIII).
function geometryToWkt(geometry: { type: string; coordinates: unknown }): string {
  const ring = (coords: number[][]) => `(${coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`
  switch (geometry.type) {
    case 'Point': {
      const [lng, lat] = geometry.coordinates as number[]
      return `POINT(${lng} ${lat})`
    }
    case 'Polygon': {
      const rings = geometry.coordinates as number[][][]
      return `POLYGON(${rings.map(ring).join(', ')})`
    }
    case 'MultiPolygon': {
      const polys = geometry.coordinates as number[][][][]
      return `MULTIPOLYGON(${polys.map((rings) => `(${rings.map(ring).join(', ')})`).join(', ')})`
    }
    default:
      throw new Error(`Unsupported geometry type: ${geometry.type}`)
  }
}
