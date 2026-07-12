/**
 * Edge Function: community-reports-stream (spec 036 remaining item —
 * "canlı SSE bildirim akışı")
 *
 * A genuine Server-Sent Events endpoint so a moderator's open admin panel
 * gets notified of new/updated community_reports without a manual refresh.
 * Uses the CALLER's own JWT (not service-role) to build the Supabase client
 * (verify_jwt = true, per supabase/config.toml) — this means the existing
 * community_reports RLS policies (super_admin sees all, country_admin sees
 * their own country's pending+approved rows, org_admin their assigned
 * approved rows) apply automatically; the stream never needs its own
 * authorization logic or leaks rows the caller couldn't already query
 * directly.
 *
 * Implementation is poll-and-diff rather than a Postgres LISTEN/NOTIFY or
 * Realtime subscription bridge (research: Edge Functions are not a good
 * home for a long-lived Realtime client) — every POLL_INTERVAL_MS it
 * re-queries community_reports ordered by updated_at, and
 * selectNewerRows() (sseReportDiff.ts, pure + unit-tested) emits only rows
 * strictly newer than the last cursor sent. A heartbeat comment keeps
 * intermediate proxies from closing the connection; MAX_STREAM_MS bounds
 * how long a single Edge Function invocation runs — the browser's fetch
 * reader loop (communityReportsStream.js) simply reconnects when the stream
 * ends, so this is invisible to the moderator.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { selectNewerRows } from '../shared/sseReportDiff.ts'

const POLL_INTERVAL_MS = 4000
const HEARTBEAT_INTERVAL_MS = 15000
const MAX_STREAM_MS = 5 * 60 * 1000 // 5 minutes per connection, then the client reconnects

function callerClient(authHeader: string) {
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not set')
  return createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const client = callerClient(authHeader)
  const encoder = new TextEncoder()
  let cursor: string | null = null
  const startedAt = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      let lastHeartbeat = Date.now()
      let closed = false

      req.signal.addEventListener('abort', () => {
        closed = true
      })

      // Establish the starting cursor from the current state WITHOUT emitting
      // anything — otherwise every connection (including reconnects) would
      // immediately replay up to 50 pre-existing rows as if they were new.
      const { data: initialRows } = await client
        .from('community_reports')
        .select('id, hazard_type, description, status, country_code, updated_at')
        .order('updated_at', { ascending: false })
        .limit(50)
      cursor = selectNewerRows(initialRows ?? [], null).nextCursor

      while (!closed && Date.now() - startedAt < MAX_STREAM_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        if (closed) break

        const { data, error } = await client
          .from('community_reports')
          .select('id, hazard_type, description, status, country_code, updated_at')
          .order('updated_at', { ascending: false })
          .limit(50)

        if (!error && data) {
          const { newRows, nextCursor } = selectNewerRows(data, cursor)
          cursor = nextCursor
          for (const row of newRows) {
            controller.enqueue(encoder.encode(`event: report\ndata: ${JSON.stringify(row)}\n\n`))
          }
        }

        if (Date.now() - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
          lastHeartbeat = Date.now()
        }
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})
