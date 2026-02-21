import { corsHeaders } from '../shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Fetch latest 100 floods from ReliefWeb
    const url =
      'https://api.reliefweb.int/v1/disasters?appname=gews&filter[field]=type&filter[value]=Flood&filter[operator]=AND&limit=100&fields[include][]=title&fields[include][]=date&fields[include][]=country&fields[include][]=type&fields[include][]=status&fields[include][]=primary_country'

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch ReliefWeb flood data: ${response.status}`)
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
