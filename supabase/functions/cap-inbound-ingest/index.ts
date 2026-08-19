/**
 * Edge Function: cap-inbound-ingest (spec 065)
 *
 * Public, unauthenticated (verify_jwt = false) — an external CAP source has
 * no account with this platform, only the per-source ingest_token a country
 * admin generated for it (cap_inbound_sources). POST raw CAP 1.2 XML in the
 * body with header `X-Ingest-Token: <token>`.
 *
 * Deliberately does NOT create a live cap_drafts row directly — only stores
 * the raw payload + a best-effort parse into cap_inbound_alerts for human
 * review. promote_cap_inbound_alert() (SQL, authenticated) is the only path
 * from here to a real draft, and even that lands in 'draft' status, still
 * subject to the existing four-eyes approval workflow before it can ever
 * broadcast (spec 065 FR-005).
 *
 * Parsing is deliberately simple regex extraction of CAP's well-known,
 * single-occurrence <info> elements — no XML DOM dependency, no AI/ML,
 * matching this codebase's existing "deterministic, auditable" convention
 * (spec 039/048's own no-ML rationale). Imperfect extraction is acceptable
 * because a human always reviews raw_payload before promotion.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return match ? match[1].trim() : null
}

// Deliberately minimal (not full XML-schema validation, matching this
// function's existing regex-extraction philosophy — see file header): a
// payload that isn't even shaped like a CAP alert (no <alert> root, or
// missing every field a human reviewer needs to triage it) is rejected
// outright rather than silently landing in the review queue as an empty
// row. Anything that clears this bar still goes through full human review
// before promote_cap_inbound_alert() — this only catches garbage input.
function findStructuralIssue(xml: string): string | null {
  if (!/<alert[\s>]/i.test(xml)) return 'missing <alert> root element'
  if (!extractTag(xml, 'identifier')) return 'missing <identifier>'
  if (!extractTag(xml, 'info') && !extractTag(xml, 'event')) return 'missing <info>/<event>'
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const token = req.headers.get('X-Ingest-Token') ?? new URL(req.url).searchParams.get('token')
  if (!token) return json({ error: 'X-Ingest-Token header (or ?token=) is required' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: source } = await supabase
    .from('cap_inbound_sources')
    .select('id, country_code, is_active')
    .eq('ingest_token', token)
    .maybeSingle()

  if (!source || !source.is_active) return json({ error: 'Invalid or inactive ingest token' }, 401)

  const rawPayload = await req.text()
  if (!rawPayload.trim()) return json({ error: 'Empty body' }, 400)

  const effectiveRaw = extractTag(rawPayload, 'effective')
  const expiresRaw = extractTag(rawPayload, 'expires')
  const structuralIssue = findStructuralIssue(rawPayload)

  const { data: inserted, error } = await supabase.from('cap_inbound_alerts').insert({
    source_id: source.id,
    country_code: source.country_code,
    raw_payload: rawPayload,
    parsed_identifier: extractTag(rawPayload, 'identifier'),
    parsed_event: extractTag(rawPayload, 'event'),
    parsed_headline: extractTag(rawPayload, 'headline'),
    parsed_description: extractTag(rawPayload, 'description'),
    parsed_severity: extractTag(rawPayload, 'severity')?.toLowerCase() ?? null,
    parsed_area_desc: extractTag(rawPayload, 'areaDesc'),
    parsed_effective_at: effectiveRaw && !Number.isNaN(Date.parse(effectiveRaw)) ? new Date(effectiveRaw).toISOString() : null,
    parsed_expires_at: expiresRaw && !Number.isNaN(Date.parse(expiresRaw)) ? new Date(expiresRaw).toISOString() : null,
    // Structurally invalid payloads (not shaped like a CAP alert at all)
    // are still stored — for audit visibility (FR-005's audit trail applies
    // here too) — but pre-marked 'rejected' instead of entering the
    // 'received' review queue as an empty/junk row a human would have to
    // manually dismiss.
    status: structuralIssue ? 'rejected' : 'received',
  }).select('id').single()

  if (error) return json({ error: error.message }, 500)
  if (structuralIssue) return json({ received: true, id: inserted.id, rejected: true, reason: structuralIssue }, 400)
  return json({ received: true, id: inserted.id })
})
