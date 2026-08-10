/**
 * Edge Function: public-cap-feed (spec 064)
 *
 * MHEWS gap (Warning Dissemination pillar): CAP export (spec 014) only ever
 * ran from the authenticated admin's CapView.vue — nothing let an external
 * consumer (a siren controller, a community radio automation system, any
 * IPAWS/EAS-style downstream) pull active alerts on its own. This exposes a
 * read-only, unauthenticated feed built on exactly the same alert set the
 * Public Portal already shows to anon users (status IN broadcast/
 * false_alarm/all_clear/expired — the `viewer_cap_read_public` RLS policy,
 * 20260706150000_cap_drafts_hardening.sql). Uses the service-role client but
 * manually re-applies that same status filter, rather than relying on RLS,
 * since a mistake here would be a real public information leak — belt and
 * suspenders.
 *
 * GET /public-cap-feed              -> Atom-style index of active alerts
 * GET /public-cap-feed?id=<uuid>    -> single CAP 1.2 XML document
 * GET /public-cap-feed?country=tr   -> index filtered to one country
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { generateCapXml, escapeXml, hazardTypeToCapCategory } from '../shared/capXmlBuilder.ts'

const PUBLIC_STATUSES = ['broadcast', 'false_alarm', 'all_clear', 'expired']

function xmlResponse(xml: string, status = 200): Response {
  return new Response(xml, { status, headers: { ...corsHeaders, 'Content-Type': 'application/xml; charset=utf-8' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const country = url.searchParams.get('country')

  if (id) {
    const { data: draft } = await supabase.from('cap_drafts').select('*').eq('id', id).maybeSingle()
    if (!draft || !PUBLIC_STATUSES.includes(draft.status)) {
      return xmlResponse('<?xml version="1.0" encoding="UTF-8"?>\n<error>Not found</error>', 404)
    }
    return xmlResponse(generateCapXml(draft))
  }

  let query = supabase
    .from('cap_drafts')
    .select('id, title, hazard_type, severity, area_desc, country_code, effective_at, expires_at, status')
    .in('status', PUBLIC_STATUSES)
    .gt('expires_at', new Date().toISOString())
    .order('effective_at', { ascending: false })
    .limit(100)

  if (country) query = query.eq('country_code', country.toLowerCase())

  const { data: drafts } = await query

  const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/public-cap-feed`
  const entries = (drafts ?? []).map((d: Record<string, unknown>) => `
  <entry>
    <id>${escapeXml(d.id)}</id>
    <title>${escapeXml(d.title)}</title>
    <updated>${new Date(d.effective_at as string).toISOString()}</updated>
    <category term="${escapeXml(hazardTypeToCapCategory(d.hazard_type as string))}"/>
    <cap:event xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">${escapeXml(d.hazard_type)}</cap:event>
    <cap:status xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">${escapeXml(d.status)}</cap:status>
    <cap:severity xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">${escapeXml(d.severity)}</cap:severity>
    <summary>${escapeXml(d.area_desc)}</summary>
    <link href="${selfUrl}?id=${escapeXml(d.id)}"/>
  </entry>`).join('')

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${selfUrl}</id>
  <title>Global Alert — Active CAP Alerts</title>
  <updated>${new Date().toISOString()}</updated>${entries}
</feed>
`
  return xmlResponse(feed)
})
