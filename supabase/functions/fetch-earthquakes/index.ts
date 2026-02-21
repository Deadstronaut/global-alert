import { corsHeaders } from '../shared/cors.ts'

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

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
