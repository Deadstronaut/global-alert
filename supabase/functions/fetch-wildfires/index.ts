import { corsHeaders } from '../shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Helper to calculate distance in km (Haversine)
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function getWildfireSeverity(brightness: number) {
  if (brightness > 350) return 'critical'
  if (brightness > 330) return 'high'
  if (brightness > 315) return 'medium'
  if (brightness > 300) return 'low'
  return 'minimal'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const FIRMS_KEY = Deno.env.get('NASA_FIRMS_KEY')
    const aggregatedEvents: any[] = []
    let sourceUsed = 'nasa-firms-aggregated'

    if (!FIRMS_KEY) {
      console.warn('NASA_FIRMS_KEY not found in environment. Falling back to mock data.')
      sourceUsed = 'mock-missing-key'
    } else {
      // Fetch from multiple satellite sources
      const satelliteSources = [
        'VIIRS_SNPP_NRT',
        'MODIS_TERRA_NRT',
        'MODIS_AQUA_NRT',
        'VIIRS_NOAA20_NRT',
      ]

      const fetchPromises = satelliteSources.map(async (sat) => {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout
          const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/${sat}/world/1`
          const response = await fetch(url, { signal: controller.signal })
          clearTimeout(timeoutId)

          if (response.ok) {
            const csvData = await response.text()
            const lines = csvData.split('\n')
            if (lines.length > 1) {
              const headers = lines[0].split(',')
              const latIdx = headers.findIndex((h) => h.trim() === 'latitude')
              const lngIdx = headers.findIndex((h) => h.trim() === 'longitude')
              const brightIdx = headers.findIndex((h) => h.trim().includes('bright'))

              return lines
                .slice(1)
                .filter((l) => l.trim().length > 0)
                .map((line, idx) => {
                  const cols = line.split(',')
                  const lat = parseFloat(cols[latIdx]) || 0
                  const lng = parseFloat(cols[lngIdx]) || 0
                  const brightness = parseFloat(cols[brightIdx]) || 0

                  return {
                    id: `nasa-${sat}-${idx}-${lat}-${lng}`,
                    type: 'wildfire',
                    title: `Wildfire Alert (${sat} Temp: ${brightness}K)`,
                    lat: lat,
                    lng: lng,
                    severity: getWildfireSeverity(brightness),
                    timestamp: new Date().toISOString(),
                    source: `nasa-${sat.toLowerCase().replace('_', '-')}`,
                    brightness: brightness,
                  }
                })
            }
          }
        } catch (e) {
          console.error(`NASA FIRMS fetch failed for ${sat}:`, e)
        }
        return []
      })

      const results = await Promise.all(fetchPromises)
      results.forEach((list) => aggregatedEvents.push(...list))
    }

    // Default mock data if no events found or key missing
    if (aggregatedEvents.length === 0) {
      aggregatedEvents.push(
        {
          id: 'wf_mock_1',
          type: 'wildfire',
          title: 'Brush Fire - Australia',
          lat: -33.86,
          lng: 151.2,
          severity: 'high',
          timestamp: new Date().toISOString(),
          source: 'mock',
          brightness: 350,
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
          brightness: 320,
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
          brightness: 345,
        },
      )
    }

    // Spatial Deduplication (Fires within 5km of each other)
    const finalEvents: any[] = []
    const sortedEvents = aggregatedEvents.sort((a, b) => (b.brightness || 0) - (a.brightness || 0))

    for (const event of sortedEvents) {
      const isDuplicate = finalEvents.some((existing) => {
        return distanceKm(event.lat, event.lng, existing.lat, existing.lng) < 5
      })
      if (!isDuplicate) {
        finalEvents.push(event)
      }
    }

    // Limit to top 150 hottest fires
    const limitedEvents = finalEvents.slice(0, 150)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (limitedEvents.length > 0) {
      const eventsToInsert = limitedEvents.map((fw) => ({
        id: fw.id,
        title: fw.title,
        description: null,
        lat: fw.lat,
        lng: fw.lng,
        severity: fw.severity,
        timestamp: fw.timestamp,
        source: fw.source,
      }))

      const { error: upsertError } = await supabase
        .from('wildfire_events')
        .upsert(eventsToInsert, { onConflict: 'id' })

      if (upsertError) {
        console.error('Error upserting wildfires:', upsertError)
      }
    }

    return new Response(
      JSON.stringify({
        meta: {
          status: 'success',
          source: sourceUsed,
          count: limitedEvents.length,
          total_fetched: aggregatedEvents.length,
        },
        data: limitedEvents,
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
