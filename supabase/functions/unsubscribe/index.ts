/**
 * Edge Function: unsubscribe (spec 031, MHEWS-SD-EMAIL-04)
 *
 * A direct copy of ack-dispatch's architecture (spec 017): the only other
 * public, unauthenticated (verify_jwt = false — see supabase/config.toml)
 * Edge Function in this project, by the same necessity — it must be
 * reachable by a direct click from an email client with no bearer token
 * available. GET /unsubscribe?receipt_id={uuid}.
 *
 * Only ever flips contacts.email_opt_in to false — never touches
 * whatsapp_opt_in (FR-005: unsubscribe is email-channel-only). Always
 * returns 200 + a self-contained HTML page, regardless of outcome — a
 * missing/garbage/already-unsubscribed receipt_id must never surface as an
 * application error to a recipient who just clicked a link.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

function htmlResponse(message: string): Response {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Unsubscribed</title>
<style>body{font-family:sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;text-align:center;color:#222}</style>
</head><body><h2>${message}</h2></body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const receiptId = url.searchParams.get('receipt_id')

  if (!receiptId) {
    return htmlResponse('This link is not recognized.')
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      return htmlResponse('You have been unsubscribed from email alerts.')
    }
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: receipt } = await admin
      .from('dispatch_receipts')
      .select('contact_id')
      .eq('id', receiptId)
      .maybeSingle()

    if (receipt?.contact_id) {
      // Idempotent by construction (same pattern as ack-dispatch's FR-004):
      // the WHERE clause means a second hit updates zero rows, handled
      // identically to the already-unsubscribed case. Only email_opt_in is
      // touched — whatsapp_opt_in is never affected (FR-005).
      await admin
        .from('contacts')
        .update({ email_opt_in: false })
        .eq('id', receipt.contact_id)
        .eq('email_opt_in', true)
    }

    return htmlResponse('You have been unsubscribed from email alerts.')
  } catch {
    // Never let a DB/network problem surface as an application error on
    // this public surface.
    return htmlResponse('You have been unsubscribed from email alerts.')
  }
})
