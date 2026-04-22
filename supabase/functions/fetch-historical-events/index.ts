/**
 * Edge Function: fetch-historical-events
 * Reads from DB views, returns paginated historical data to frontend.
 * Auth: JWT required (verify_jwt = true in config.toml)
 */
import { corsHeaders } from '../shared/cors.ts'
import { getServiceClient } from '../shared/upsert.ts'

const VIEW_MAP: Record<string, string> = {
  earthquake:    'earthquake_view',
  wildfire:      'wildfire_view',
  flood:         'flood_view',
  drought:       'drought_view',
  food_security: 'food_security_view',
  tsunami:       'tsunami_view',
  cyclone:       'cyclone_view',
  volcano:       'volcano_view',
  epidemic:      'epidemic_view',
  all:           '',  // handled specially
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const type: string      = body.type ?? 'all'
    const startDate: string = body.startDate ?? null
    const endDate: string   = body.endDate ?? null
    const limit: number     = Math.min(body.limit ?? 500, 1000)

    const supabase = getServiceClient()
    const views = type === 'all'
      ? Object.values(VIEW_MAP).filter(Boolean)
      : [VIEW_MAP[type]].filter(Boolean)

    if (views.length === 0) {
      return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      })
    }

    const results = await Promise.allSettled(
      views.map(async (view) => {
        let q = supabase.from(view).select('*').order('time', { ascending: false }).limit(limit)
        if (startDate) q = q.gte('time', startDate)
        if (endDate)   q = q.lte('time', endDate)
        const { data, error } = await q
        if (error) throw new Error(`${view}: ${error.message}`)
        return data ?? []
      })
    )

    const data: any[] = []
    const errors: string[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') data.push(...r.value)
      else errors.push(r.reason?.message ?? String(r.reason))
    }

    return new Response(JSON.stringify({
      meta: { status: errors.length === 0 ? 'ok' : 'partial', count: data.length, errors },
      data,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    })
  }
})
