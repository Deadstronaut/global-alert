/**
 * Edge Function: fetch-tsunamis
 * Source: PTWC (Pacific Tsunami Warning Center, NOAA) — PHEBulletins.xml
 * Writes to: tsunami table
 * Called by: pg_cron every 3 minutes (see 20260720130000_ptwc_who_fetch_cron.sql)
 *
 * Ported from server/src/sources/ptwc.js — the old always-on Node aggregator
 * (server/) had this fetch logic working correctly, it just never got moved
 * to this repo's stateless Edge Function + pg_cron pattern like every other
 * hazard source was. One behavior change from the original: that code
 * silently defaulted lat/lng to 0 when a bulletin's free-text description
 * couldn't be parsed for coordinates, plotting a "Null Island" event at
 * (0,0). Here validatePayload() rejects (and logs) that record instead —
 * no event is better than a wrong one on a map.
 */
import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'
import { validatePayload } from '../shared/validatePayload.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'

const FEED_URL = 'https://www.tsunami.gov/events/xml/PHEBulletins.xml'

function extractTag(item: string, tag: string): string | null {
  const m = item.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`),
  )
  return m ? (m[1] || m[2])?.trim() ?? null : null
}

interface PTWCRecord {
  id: string
  lat: number | null
  lng: number | null
  magnitude: number | null
  title: string
  description: string
  time: string
  sourceUrl: string
}

// Mirrors server/src/sources/ptwc.js's parsePTWCXML() — same lightweight
// regex parse (not a full XML parser) of the same feed format.
function parsePTWCXML(xml: string): PTWCRecord[] {
  const records: PTWCRecord[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  while ((match = itemRe.exec(xml)) !== null) {
    const item = match[1]
    const title = extractTag(item, 'title')
    if (!title || title.toLowerCase().includes('test')) continue

    const pubDate = extractTag(item, 'pubDate')
    const link = extractTag(item, 'link')
    const descRaw = extractTag(item, 'description')
    const guid = extractTag(item, 'guid')
    const desc = (descRaw ?? '').replace(/<[^>]+>/g, '').trim()

    const latMatch = desc.match(/lat[itude]*[:\s]+(-?[\d.]+)/i)
    const lngMatch = desc.match(/lon[gitude]*[:\s]+(-?[\d.]+)/i)
    const magMatch = desc.match(/M\s*([\d.]+)/)

    records.push({
      id: `ptwc-${guid || title.slice(0, 40)}`,
      lat: latMatch ? parseFloat(latMatch[1]) : null,
      lng: lngMatch ? parseFloat(lngMatch[1]) : null,
      magnitude: magMatch ? parseFloat(magMatch[1]) : null,
      title,
      description: desc || title,
      time: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      sourceUrl: link || 'https://www.tsunami.gov',
    })
  }
  return records
}

async function fetchPTWC(sourceId: string | null): Promise<ReturnType<typeof normalize>[]> {
  const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(10_000) })
  // No active bulletins is PTWC's normal resting state, not a failure —
  // same "documented, expected outcome" convention used elsewhere (FR-010).
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`PTWC HTTP ${res.status}`)
  const xml = await res.text()
  const records = parsePTWCXML(xml)

  const out: ReturnType<typeof normalize>[] = []
  for (const r of records) {
    const raw = { id: r.id, lat: r.lat, lng: r.lng, time: r.time, magnitude: r.magnitude }
    const validation = validatePayload(raw, 'tsunami')
    if (!validation.valid) {
      await logRejectedPayload(sourceId, 'tsunami', validation.reason, r)
      continue
    }
    out.push(normalize({
      id: r.id,
      type: 'tsunami',
      lat: r.lat!,
      lng: r.lng!,
      magnitude: r.magnitude,
      depth: 0,
      title: r.title,
      description: r.description,
      time: r.time,
      source: 'PTWC',
      sourceUrl: r.sourceUrl,
      extra: { bulletin: true },
    }))
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const fetchErrors: string[] = []
  let events: ReturnType<typeof normalize>[] = []

  const ptwcId = await resolveSourceId('tsunami', 'PTWC')

  if (await isSourceActive(ptwcId)) {
    try {
      events = await fetchPTWC(ptwcId)
      if (ptwcId) await recordFetchOutcome(ptwcId, 'success')
    } catch (e) {
      fetchErrors.push(`PTWC: ${e.message}`)
      if (ptwcId) await recordFetchOutcome(ptwcId, 'failure', e.message)
    }
  }

  const { inserted, errors: dbErrors } = await upsertEvents(events)

  return new Response(JSON.stringify({
    meta: { status: dbErrors.length === 0 ? 'ok' : 'partial', fetched: events.length, inserted, fetchErrors, dbErrors },
    data: events,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
