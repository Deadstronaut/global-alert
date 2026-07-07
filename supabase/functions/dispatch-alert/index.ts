/**
 * Edge Function: dispatch-alert (spec 009)
 *
 * Two invocation modes (contracts/dispatch-alert.md):
 *   Mode A — { draft_id }: automatic dispatch, called only by the
 *     trg_notify_dispatch_on_broadcast DB trigger (pg_net), authenticated
 *     with the service-role key. Never called directly by a client.
 *   Mode B — { job_id }: manual retry of a job's failed/bounced receipts,
 *     called by an authenticated Operator/Approver client (super_admin, or
 *     country_admin/org_admin scoped to the job's own country/org).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { getEmailAdapter } from '../shared/emailProviders/index.ts'
import { matchesContact, type DispatchableContact, type DispatchableCapDraft } from '../shared/dispatchMatching.ts'
import { canRetryDispatchJob } from '../shared/dispatchRetryAuthorization.ts'
import { resolveLocalizedContent } from '../shared/emailLocalization.ts'
import { shouldAutoRetryNow, MAX_AUTO_RETRIES } from '../shared/dispatchBackoff.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

function buildEmailBody(
  draft: {
    hazard_type: string
    severity: string
    title: string
    description: string | null
    area_desc: string | null
    translations: Record<string, { title?: string; description?: string }> | null
  },
  receiptId: string,
  preferredLanguage: string,
) {
  const portalUrl = Deno.env.get('PUBLIC_PORTAL_URL') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  // spec 017 FR-003/FR-007: a one-click acknowledgment link, applied to
  // every email dispatch (not just exercise/drill ones — the mechanism is
  // the same regardless of exercise status per spec.md's Assumptions).
  const ackUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/ack-dispatch?receipt_id=${receiptId}` : ''
  // spec 031 FR-003/FR-004: an unauthenticated, one-click unsubscribe link —
  // only affects the email channel (unsubscribe/index.ts only ever touches
  // contacts.email_opt_in, never whatsapp_opt_in).
  const unsubscribeUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/unsubscribe?receipt_id=${receiptId}` : ''
  // spec 031 FR-001/FR-002: localize to the recipient's preferred_language
  // when cap_drafts.translations has an entry, otherwise fall back to the
  // draft's original content — never throws, never blocks the send.
  const { title, description } = resolveLocalizedContent(draft, preferredLanguage)
  return `
    <h2>${title}</h2>
    <p><strong>${draft.hazard_type}</strong> — severity: ${draft.severity}</p>
    ${draft.area_desc ? `<p>Area: ${draft.area_desc}</p>` : ''}
    ${description ? `<p>${description}</p>` : ''}
    ${portalUrl ? `<p><a href="${portalUrl}">View on the Public Alert Portal</a></p>` : ''}
    ${ackUrl ? `<p><a href="${ackUrl}">I received this alert</a></p>` : ''}
    ${unsubscribeUrl ? `<p><a href="${unsubscribeUrl}">Unsubscribe from email alerts</a></p>` : ''}
  `
}

// Sends (or mock-sends) one contact/channel receipt, updating its row along
// the way. Isolated per-contact so one failure never stops the batch (FR-010).
async function sendReceipt(
  admin: ReturnType<typeof adminClient>,
  jobId: string,
  contact: DispatchableContact & { id: string; whatsapp_number: string | null; preferred_language: string },
  channel: 'email' | 'whatsapp',
  draft: {
    hazard_type: string
    severity: string
    title: string
    description: string | null
    area_desc: string | null
    translations: Record<string, { title?: string; description?: string }> | null
  },
) {
  const { data: receipt, error: insertError } = await admin
    .from('dispatch_receipts')
    .insert({
      dispatch_job_id: jobId,
      contact_id: contact.id,
      channel,
      status: 'queued',
      is_mock: channel === 'whatsapp',
      last_attempted_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (insertError || !receipt) return

  if (channel === 'whatsapp') {
    // Mock adapter (research.md §3): synchronously simulate a successful
    // send, no real Meta Cloud API call.
    // TODO (spec 022 follow-up, not implemented here): once a country has
    // configured its own credentials (see whatsapp_integration_settings /
    // save_whatsapp_credentials()), a future iteration would look up
    // vault.decrypted_secrets for 'whatsapp_creds_<country_code>' and call
    // the real WhatsApp Business (Meta Cloud) API here instead, falling
    // back to this mock behavior when no credentials are configured.
    await admin.from('dispatch_receipts').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', receipt.id)
    await admin.from('dispatch_receipts').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', receipt.id)
    return
  }

  try {
    const sendEmail = getEmailAdapter()
    const result = await sendEmail({
      to: contact.email as string,
      subject: draft.title,
      html: buildEmailBody(draft, receipt.id, contact.preferred_language),
    })
    if (result.ok) {
      await admin
        .from('dispatch_receipts')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.providerMessageId })
        .eq('id', receipt.id)
    } else {
      await admin
        .from('dispatch_receipts')
        .update({ status: 'failed', failure_reason: result.error, last_attempted_at: new Date().toISOString() })
        .eq('id', receipt.id)
    }
  } catch (err) {
    // A single contact's exception must never abort the batch (FR-010).
    await admin
      .from('dispatch_receipts')
      .update({ status: 'failed', failure_reason: err instanceof Error ? err.message : String(err), last_attempted_at: new Date().toISOString() })
      .eq('id', receipt.id)
  }
}

async function handleAutoDispatch(admin: ReturnType<typeof adminClient>, draftId: string) {
  const { data: draft } = await admin.from('cap_drafts').select('*').eq('id', draftId).maybeSingle()
  if (!draft || draft.status !== 'broadcast') {
    return { skipped: true, reason: 'not_broadcast' }
  }

  const { data: job } = await admin
    .from('dispatch_jobs')
    .insert({ cap_draft_id: draft.id, status: 'queued' })
    .select()
    .single()
  if (!job) return { skipped: true, reason: 'job_creation_failed' }

  await admin.from('dispatch_jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', job.id)

  const { data: contacts } = await admin
    .from('contacts')
    .select('*')
    .eq('is_active', true)
    .eq('country_code', draft.country_code)

  const draftForMatching: DispatchableCapDraft = {
    country_code: draft.country_code,
    region_code: draft.region_code,
    hazard_type: draft.hazard_type,
  }
  const matched = (contacts ?? []).filter(
    (c: DispatchableContact) => matchesContact(c, draftForMatching, 'email') || matchesContact(c, draftForMatching, 'whatsapp'),
  )

  await admin.from('dispatch_jobs').update({ matched_contact_count: matched.length }).eq('id', job.id)

  let providerWideFailure = false
  for (const contact of matched) {
    if (matchesContact(contact, draftForMatching, 'email')) {
      await sendReceipt(admin, job.id, contact, 'email', draft)
    }
    if (matchesContact(contact, draftForMatching, 'whatsapp')) {
      await sendReceipt(admin, job.id, contact, 'whatsapp', draft)
    }
  }

  // A provider-wide failure (as opposed to a per-recipient rejection) is
  // detected when the email adapter itself couldn't be configured at all.
  if (matched.length > 0 && !Deno.env.get('RESEND_API_KEY') && !Deno.env.get('SENDGRID_API_KEY')) {
    providerWideFailure = true
  }

  await admin
    .from('dispatch_jobs')
    .update({
      status: providerWideFailure ? 'failed' : 'completed',
      completed_at: new Date().toISOString(),
      failure_reason: providerWideFailure ? 'No email provider configured' : null,
    })
    .eq('id', job.id)

  return { job_id: job.id, matched_contact_count: matched.length }
}

async function handleRetry(admin: ReturnType<typeof adminClient>, jobId: string, authHeader: string) {
  const { data: userAuth, error: userAuthError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
  if (userAuthError || !userAuth.user) return { status: 401, body: { error: 'Invalid session' } }

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('id, role, country_code, org_id')
    .eq('id', userAuth.user.id)
    .maybeSingle()
  if (!callerProfile) return { status: 403, body: { error: 'Caller profile not found' } }

  const { data: job } = await admin
    .from('dispatch_jobs')
    .select('*, cap_drafts!inner(country_code, org_id)')
    .eq('id', jobId)
    .maybeSingle()
  if (!job) return { status: 404, body: { error: 'Dispatch job not found' } }

  const jobCountryCode = (job as { cap_drafts: { country_code: string | null } }).cap_drafts.country_code
  const jobOrgId = (job as { cap_drafts: { org_id: string | null } }).cap_drafts.org_id

  if (!canRetryDispatchJob(callerProfile, jobCountryCode, jobOrgId)) {
    await admin.from('audit_log').insert({
      table_name: 'dispatch_jobs',
      record_id: jobId,
      action: 'retry_denied',
      changed_by: callerProfile.id,
    })
    return { status: 403, body: { error: 'Not authorized to retry this dispatch job' } }
  }

  const { data: draft } = await admin.from('cap_drafts').select('*').eq('id', (job as { cap_draft_id: string }).cap_draft_id).maybeSingle()
  const { data: failedReceipts } = await admin
    .from('dispatch_receipts')
    .select('*, contacts(*)')
    .eq('dispatch_job_id', jobId)
    .in('status', ['failed', 'bounced'])

  let retriedCount = 0
  for (const receipt of failedReceipts ?? []) {
    const r = receipt as { id: string; channel: 'email' | 'whatsapp'; retry_count: number; contacts: DispatchableContact & { id: string; preferred_language: string } }
    if (!r.contacts || !draft) continue
    // Reopen the SAME row (failed/bounced -> queued is a valid transition,
    // see dispatchStateMachine.ts) rather than creating a duplicate receipt.
    // spec 031 FR-008: a manual retry resets the automatic retry counter to
    // 0 — an operator's deliberate intervention is treated as a fresh start,
    // not counted against the auto-retry backoff limit (dispatchBackoff.ts).
    await admin
      .from('dispatch_receipts')
      .update({ status: 'queued', retry_count: 0, failure_reason: null, last_attempted_at: new Date().toISOString() })
      .eq('id', r.id)
    retriedCount++
    await sendReceiptRetry(admin, r.id, r.contacts, r.channel, draft)
  }

  return { status: 200, body: { job_id: jobId, retried_count: retriedCount } }
}

// Re-attempts an already-`queued` (reopened) receipt row in place.
async function sendReceiptRetry(
  admin: ReturnType<typeof adminClient>,
  receiptId: string,
  contact: DispatchableContact & { preferred_language: string },
  channel: 'email' | 'whatsapp',
  draft: {
    hazard_type: string
    severity: string
    title: string
    description: string | null
    area_desc: string | null
    translations: Record<string, { title?: string; description?: string }> | null
  },
) {
  if (channel === 'whatsapp') {
    await admin.from('dispatch_receipts').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', receiptId)
    await admin.from('dispatch_receipts').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', receiptId)
    return
  }

  const sendEmail = getEmailAdapter()
  const result = await sendEmail({ to: contact.email as string, subject: draft.title, html: buildEmailBody(draft, receiptId, contact.preferred_language) })
  if (result.ok) {
    await admin.from('dispatch_receipts').update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.providerMessageId }).eq('id', receiptId)
  } else {
    await admin.from('dispatch_receipts').update({ status: 'failed', failure_reason: result.error, last_attempted_at: new Date().toISOString() }).eq('id', receiptId)
  }
}

// Mode C (spec 031, MHEWS-FR-0119/FR-0066): service-role-only, triggered by
// pg_cron every 15 minutes (contracts/dispatch-alert-auto-retry.md). Retries
// eligible failed receipts with backoff (dispatchBackoff.ts), then notifies
// an admin, exactly once per job, for jobs whose retries are fully exhausted.
async function handleAutoRetry(admin: ReturnType<typeof adminClient>) {
  const now = new Date()
  const { data: failedReceipts } = await admin
    .from('dispatch_receipts')
    .select('*, contacts(*), dispatch_jobs!inner(cap_draft_id)')
    .eq('status', 'failed')
    .eq('channel', 'email')
    .lt('retry_count', MAX_AUTO_RETRIES)

  let autoRetriedCount = 0
  for (const receipt of failedReceipts ?? []) {
    const r = receipt as {
      id: string
      status: string
      retry_count: number
      last_attempted_at: string | null
      contacts: (DispatchableContact & { id: string; preferred_language: string }) | null
      dispatch_jobs: { cap_draft_id: string }
    }
    if (!r.contacts) continue
    if (!shouldAutoRetryNow(r, now)) continue

    const { data: draft } = await admin.from('cap_drafts').select('*').eq('id', r.dispatch_jobs.cap_draft_id).maybeSingle()
    if (!draft) continue

    await admin
      .from('dispatch_receipts')
      .update({ status: 'queued', retry_count: r.retry_count + 1, failure_reason: null, last_attempted_at: now.toISOString() })
      .eq('id', r.id)
    autoRetriedCount++
    await sendReceiptRetry(admin, r.id, r.contacts, 'email', draft)
  }

  // FR-009/FR-010: notify an admin once per job that is completely and
  // permanently failed — every matched receipt ended in 'failed' with no
  // automatic retries left, and none ever succeeded. Note: dispatch_jobs
  // .status only becomes 'failed' for a provider-wide outage
  // (handleAutoDispatch); a job with only per-recipient failures still ends
  // as 'completed' (spec 009), so this scan intentionally does not filter by
  // dispatch_jobs.status — it looks at the underlying receipts instead.
  const { data: candidateJobs } = await admin
    .from('dispatch_jobs')
    .select('*, cap_drafts!inner(country_code, org_id)')
    .is('admin_notified_at', null)

  let adminNotifiedJobCount = 0
  for (const job of candidateJobs ?? []) {
    const j = job as { id: string; cap_drafts: { country_code: string | null; org_id: string | null } }

    const { count: succeededCount } = await admin
      .from('dispatch_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('dispatch_job_id', j.id)
      .eq('channel', 'email')
      .in('status', ['sent', 'delivered'])
    if ((succeededCount ?? 0) > 0) continue // at least one recipient succeeded, not a total failure

    const { count: retryableCount } = await admin
      .from('dispatch_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('dispatch_job_id', j.id)
      .eq('channel', 'email')
      .eq('status', 'failed')
      .lt('retry_count', MAX_AUTO_RETRIES)
    if ((retryableCount ?? 0) > 0) continue // still has retries left, not exhausted yet

    const { count: exhaustedFailedCount } = await admin
      .from('dispatch_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('dispatch_job_id', j.id)
      .eq('channel', 'email')
      .eq('status', 'failed')
      .gte('retry_count', MAX_AUTO_RETRIES)
    if ((exhaustedFailedCount ?? 0) === 0) continue // nothing to notify about (no email receipts at all, or still in flight)

    let adminQuery = admin.from('profiles').select('email').not('email', 'is', null)
    if (j.cap_drafts.country_code) {
      adminQuery = adminQuery.or(
        `role.eq.super_admin,and(role.in.(country_admin,org_admin),country_code.eq.${j.cap_drafts.country_code})`,
      )
    } else {
      adminQuery = adminQuery.eq('role', 'super_admin')
    }
    const { data: admins } = await adminQuery
    const adminEmails = (admins ?? []).map((a: { email: string | null }) => a.email).filter((e): e is string => !!e)

    if (adminEmails.length > 0) {
      try {
        const sendEmail = getEmailAdapter()
        await sendEmail({
          to: adminEmails[0],
          subject: 'Dispatch alert failed after all automatic retries',
          html: `<p>Dispatch job ${j.id} has exhausted all automatic retry attempts and remains failed. Please review it in the Dissemination panel.</p>`,
        })
      } catch {
        // A notification failure must never block marking the job as
        // notified-attempted, nor loop forever (FR-010 — no duplicate spam).
      }
    }
    await admin.from('dispatch_jobs').update({ admin_notified_at: now.toISOString() }).eq('id', j.id)
    adminNotifiedJobCount++
  }

  return { auto_retried_count: autoRetriedCount, admin_notified_job_count: adminNotifiedJobCount }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  let body: { draft_id?: string; job_id?: string; auto_retry?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const admin = adminClient()

  if (body.draft_id) {
    // Mode A: only the service role (the DB trigger) may call this path.
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
      return json({ error: 'Mode A requires service-role authentication' }, 401)
    }
    const result = await handleAutoDispatch(admin, body.draft_id)
    return json(result)
  }

  if (body.job_id) {
    const result = await handleRetry(admin, body.job_id, authHeader)
    return json(result.body, result.status)
  }

  if (body.auto_retry) {
    // Mode C (spec 031): only the service role (pg_cron via pg_net) may call
    // this path — same authentication check as Mode A.
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
      return json({ error: 'Mode C requires service-role authentication' }, 401)
    }
    const result = await handleAutoRetry(admin)
    return json(result)
  }

  return json({ error: 'draft_id, job_id, or auto_retry is required' }, 400)
})
