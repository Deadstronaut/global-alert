import { corsHeaders } from '../shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const period = url.searchParams.get('period') || 'day'
    const minMagnitude = url.searchParams.get('minMagnitude') || '2.5'

    // Fetch from USGS
    const usgsUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${minMagnitude}_${period}.geojson`

    const response = await fetch(usgsUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch USGS data: ${response.status}`)
    }

    const data = await response.json()

    // Initialize Supabase Client with Service Role Key to bypass RLS for trusted backend operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Map USGS features to our DB schema
    const eventsToInsert = (data.features || []).map((feature: any) => ({
      id: feature.id,
      title: feature.properties.title,
      description: feature.properties.place,
      lat: feature.geometry.coordinates[1],
      lng: feature.geometry.coordinates[0],
      severity:
        feature.properties.mag >= 7
          ? 'critical'
          : feature.properties.mag >= 6
            ? 'high'
            : feature.properties.mag >= 5
              ? 'medium'
              : feature.properties.mag >= 4
                ? 'low'
                : 'minimal',
      timestamp: new Date(feature.properties.time).toISOString(),
      source: 'usgs',
    }))

    if (eventsToInsert.length > 0) {
      const { error: upsertError } = await supabase
        .from('earthquake_events')
        .upsert(eventsToInsert, { onConflict: 'id' })

      if (upsertError) {
        console.error('Error upserting earthquakes:', upsertError)
      }
    }

    return new Response(
      JSON.stringify({
        meta: { status: 'success', source: 'usgs', count: eventsToInsert.length },
        data: eventsToInsert,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Fetch Earthquakes Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
