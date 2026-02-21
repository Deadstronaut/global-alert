import { corsHeaders } from '../shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let reqBody: any = {}
    if (req.method === 'POST') {
      try {
        reqBody = await req.json()
      } catch (e) {}
    }
    const { type = 'all', startDate, endDate } = reqBody

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    let allData: any[] = []

    const fetchFromTable = async (tableName: string) => {
      let query = supabase
        .from(tableName)
        .select('id, title, description, lat, lng, severity, timestamp, source')
        .order('timestamp', { ascending: false })
        .limit(2000)
      if (startDate) query = query.gte('timestamp', startDate)
      if (endDate) query = query.lte('timestamp', endDate)
      const { data, error } = await query
      if (error) {
        console.error(`Error querying ${tableName}:`, error)
        return []
      }
      return data || []
    }

    if (type === 'all') {
      const [eq, wf, fl, dr] = await Promise.all([
        fetchFromTable('earthquake_events'),
        fetchFromTable('wildfire_events'),
        fetchFromTable('flood_events'),
        fetchFromTable('drought_events'),
      ])
      allData = [
        ...eq.map((d) => ({ ...d, type: 'earthquake' })),
        ...wf.map((d) => ({ ...d, type: 'wildfire' })),
        ...fl.map((d) => ({ ...d, type: 'flood' })),
        ...dr.map((d) => ({ ...d, type: 'drought' })),
      ]
    } else {
      let tableName = ''
      if (type === 'earthquake') tableName = 'earthquake_events'
      if (type === 'wildfire') tableName = 'wildfire_events'
      if (type === 'flood') tableName = 'flood_events'
      if (type === 'drought') tableName = 'drought_events'

      if (tableName) {
        const results = await fetchFromTable(tableName)
        allData = results.map((d: any) => ({ ...d, type }))
      }
    }

    return new Response(
      JSON.stringify({
        meta: { status: 'success', count: allData.length },
        data: allData,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Fetch Historical Events Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
