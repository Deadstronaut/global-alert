import { corsHeaders } from '../shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const FIRMS_KEY = Deno.env.get('NASA_FIRMS_KEY')
    let finalWildfires = []
    let sourceUsed = 'nasa-firms'

    if (!FIRMS_KEY) {
      console.warn('NASA_FIRMS_KEY not found in environment. Falling back to mock data.')
      sourceUsed = 'mock-missing-key'
    } else {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 8000) // 8s timeout

        // Using VIIRS SNPP NRT worldwide 1 day data
        const url = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${FIRMS_KEY}/VIIRS_SNPP_NRT/world/1`
        const response = await fetch(url, { signal: controller.signal })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`Failed to fetch FIRMS data: ${response.status} ${response.statusText}`)
        }

        const csvData = await response.text()
        const lines = csvData.split('\n')

        if (lines.length > 1) {
          const headers = lines[0].split(',')
          const latIdx = headers.findIndex((h) => h.trim() === 'latitude')
          const lngIdx = headers.findIndex((h) => h.trim() === 'longitude')
          const brightIdx = headers.findIndex((h) => h.trim() === 'bright_ti4')

          // Parse records and map to our format
          finalWildfires = lines
            .slice(1)
            .filter((l) => l.trim().length > 0)
            .map((line, idx) => {
              const cols = line.split(',')
              const lat = parseFloat(cols[latIdx]) || 0
              const lng = parseFloat(cols[lngIdx]) || 0
              const brightness = parseFloat(cols[brightIdx]) || 0

              return {
                id: `nasa-${idx}`,
                type: 'wildfire',
                title: `Wildfire Alert (Temp: ${brightness}K)`,
                lat: lat,
                lng: lng,
                severity: brightness > 330 ? 'high' : 'medium',
                timestamp: new Date().toISOString(),
                source: 'nasa-firms',
              }
            })
            // Just take top 100 hottest fires to not choke the UI
            .sort((a, b) => {
              const aTemp = parseFloat(a.title.replace('Wildfire Alert (Temp: ', ''))
              const bTemp = parseFloat(b.title.replace('Wildfire Alert (Temp: ', ''))
              return bTemp - aTemp
            })
            .slice(0, 100)
        }
      } catch (e) {
        console.error('NASA FIRMS fetching failed', e)
        sourceUsed = 'mock-fetch-failed'
      }
    }

    if (sourceUsed.startsWith('mock-')) {
      // Fallback or Missing Key Mock
      // Let's seed some realistic large-scale ongoing fires or high risk zones
      finalWildfires = [
        {
          id: 'wf_mock_1',
          type: 'wildfire',
          title: 'Brush Fire - Australia',
          lat: -33.86,
          lng: 151.2,
          severity: 'high',
          timestamp: new Date().toISOString(),
          source: 'mock',
        },
        {
          id: 'wf_mock_2',
          type: 'wildfire',
          title: 'Forest Fire - Canada',
          lat: 49.28,
          lng: -123.12,
          severity: 'medium',
          timestamp: new Date().toISOString(),
          source: 'mock',
        },
        {
          id: 'wf_mock_3',
          type: 'wildfire',
          title: 'Wildfire - California',
          lat: 34.05,
          lng: -118.24,
          severity: 'high',
          timestamp: new Date().toISOString(),
          source: 'mock',
        },
        {
          id: 'wf_mock_4',
          type: 'wildfire',
          title: 'Amazon Fire - Brazil',
          lat: -3.41,
          lng: -60.02,
          severity: 'high',
          timestamp: new Date().toISOString(),
          source: 'mock',
        },
        {
          id: 'wf_mock_5',
          type: 'wildfire',
          title: 'Taiga Fire - Siberia',
          lat: 60.0,
          lng: 100.0,
          severity: 'medium',
          timestamp: new Date().toISOString(),
          source: 'mock',
        },
      ]
    }

    return new Response(
      JSON.stringify({
        meta: { status: 'success', source: sourceUsed, count: finalWildfires.length },
        data: finalWildfires,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
