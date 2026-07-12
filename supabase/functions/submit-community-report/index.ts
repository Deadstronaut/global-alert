/**
 * Edge Function: submit-community-report (spec 036)
 *
 * The only write path into `community_reports` — there is no client-facing
 * INSERT RLS policy (research.md Decision 2). Anonymous citizens call this
 * via `supabase.functions.invoke('submit-community-report', ...)`; the
 * default `verify_jwt = true` config is fine here (unlike ack-dispatch/
 * unsubscribe) because the frontend JS client always attaches at least the
 * anon key as a bearer token — there is no bare, tokenless link involved.
 *
 * Responsibilities: validate the payload (communityReportValidation.ts),
 * resolve country_code from lat/lng server-side (geoCountry.ts) so it can't
 * be spoofed by the client, upload an optional photo to the
 * community-report-photos bucket, and INSERT the row with the service-role
 * client (bypassing RLS by design).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { validateReportPayload, type CommunityReportPayload } from '../shared/communityReportValidation.ts'
import { resolveCountryCode } from '../shared/geoCountry.ts'

interface RequestBody extends CommunityReportPayload {
  photo?: { base64?: string; mimeType?: string }
  audio?: { base64?: string; mimeType?: string }
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const photoBytes = body.photo?.base64 ? decodeBase64(body.photo.base64) : null
  const audioBytes = body.audio?.base64 ? decodeBase64(body.audio.base64) : null

  const validation = validateReportPayload({
    hazardType: body.hazardType,
    description: body.description,
    lat: body.lat,
    lng: body.lng,
    photoMimeType: body.photo?.mimeType,
    photoSizeBytes: photoBytes?.length,
    audioMimeType: body.audio?.mimeType,
    audioSizeBytes: audioBytes?.length,
  })
  if (!validation.valid) return json({ error: validation.error }, 400)

  const lat = body.lat as number
  const lng = body.lng as number
  const countryCode = resolveCountryCode(lat, lng)

  const admin = adminClient()

  let photoPath: string | null = null
  if (photoBytes && body.photo?.mimeType) {
    const ext = EXTENSION_BY_MIME[body.photo.mimeType]
    const path = `${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await admin.storage
      .from('community-report-photos')
      .upload(path, photoBytes, { contentType: body.photo.mimeType })
    if (uploadError) return json({ error: `Photo upload failed: ${uploadError.message}` }, 500)
    photoPath = path
  }

  let audioPath: string | null = null
  if (audioBytes && body.audio?.mimeType) {
    const ext = AUDIO_EXTENSION_BY_MIME[body.audio.mimeType]
    const path = `${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await admin.storage
      .from('community-report-audio')
      .upload(path, audioBytes, { contentType: body.audio.mimeType })
    if (uploadError) return json({ error: `Audio upload failed: ${uploadError.message}` }, 500)
    audioPath = path
  }

  const { data, error: insertError } = await admin
    .from('community_reports')
    .insert({
      hazard_type: body.hazardType,
      description: body.description,
      lat,
      lng,
      country_code: countryCode,
      photo_path: photoPath,
      audio_path: audioPath,
      status: 'pending',
    })
    .select('id, status')
    .single()

  if (insertError || !data) {
    return json({ error: insertError?.message ?? 'Failed to submit report' }, 500)
  }

  return json({ id: data.id, status: data.status })
})

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
