/**
 * Edge Function: ack-dispatch (spec 017)
 *
 * The only public, unauthenticated (verify_jwt = false — see
 * supabase/config.toml) Edge Function in this project, by necessity: it must
 * be reachable by a direct click from an email client with no bearer token
 * available (research.md). GET /ack-dispatch?receipt_id={uuid}.
 *
 * Always returns 200 + a self-contained HTML page, regardless of outcome —
 * a missing/garbage/already-acknowledged receipt_id must never surface as an
 * application error to a recipient who just clicked a link (FR-006).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

function htmlResponse(message: string): Response {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Acknowledged</title>
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
      return htmlResponse('Thank you — your acknowledgment has been recorded.')
    }
    const admin = createClient(supabaseUrl, serviceRoleKey)

    // Idempotent by construction (FR-004): the WHERE clause means a second
    // hit for the same receipt updates zero rows, indistinguishable from —
    // and handled identically to — the already-acknowledged case.
    await admin
      .from('dispatch_receipts')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', receiptId)
      .is('acknowledged_at', null)

    return htmlResponse('Thank you — your acknowledgment has been recorded.')
  } catch {
    // Never let a DB/network problem surface as an application error on this
    // public surface (FR-006).
    return htmlResponse('Thank you — your acknowledgment has been recorded.')
  }
})
