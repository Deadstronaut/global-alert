import { corsHeaders } from '../shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const FIRMS_KEY = Deno.env.get('NASA_FIRMS_KEY')
    if (!FIRMS_KEY) {
      throw new Error('NASA_FIRMS_KEY is not set in environment variables.')
    }

    // Using NASA FIRMS API for VIIRS SNPP NRT worldwide
    const url = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${FIRMS_KEY}/VIIRS_SNPP_NRT/world/1`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch FIRMS data: ${response.status} ${response.statusText}`)
    }

    const csvData = await response.text()

    // Basic CSV to JSON
    const lines = csvData.split('\n')
    const headers = lines[0].split(',')
    const records = lines
      .slice(1)
      .filter((l) => l.trim())
      .map((line) => {
        const values = line.split(',')
        const obj = {}
        headers.forEach((h, i) => {
          obj[h.trim()] = values[i]?.trim()
        })
        return obj
      })

    return new Response(JSON.stringify(records.slice(0, 500)), {
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
