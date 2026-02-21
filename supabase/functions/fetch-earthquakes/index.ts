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

function getSeverity(mag: number) {
  if (mag >= 7) return 'critical'
  if (mag >= 6) return 'high'
  if (mag >= 5) return 'medium'
  if (mag >= 4) return 'low'
  return 'minimal'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const period = url.searchParams.get('period') || 'day'
    const minMagnitude = parseFloat(url.searchParams.get('minMagnitude') || '1.0')

    const aggregatedEvents: any[] = []

    // 1. Fetch from USGS
    try {
      const usgsUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${minMagnitude >= 4.5 ? '4.5' : minMagnitude >= 2.5 ? '2.5' : '1.0'}_${period}.geojson`
      const usgsRes = await fetch(usgsUrl)
      if (usgsRes.ok) {
        const usgsData = await usgsRes.json()
        const usgsEvents = (usgsData.features || []).map((feature: any) => ({
          id: feature.id,
          title: feature.properties.title,
          description: feature.properties.place,
          lat: feature.geometry.coordinates[1],
          lng: feature.geometry.coordinates[0],
          severity: getSeverity(feature.properties.mag),
          magnitude: feature.properties.mag,
          timestamp: new Date(feature.properties.time).toISOString(),
          source: 'usgs',
        }))
        aggregatedEvents.push(...usgsEvents)
      }
    } catch (e) {
      console.error('USGS fetch failed:', e)
    }

    // 2. Fetch from Kandilli (via orhanaydogdu API)
    try {
      const kandilliRes = await fetch('https://api.orhanaydogdu.com.tr/deprem/kandilli/live')
      if (kandilliRes.ok) {
        const kandilliData = await kandilliRes.json()
        const kandilliEvents = (kandilliData.result || [])
          .filter((e: any) => e.mag >= minMagnitude)
          .map((e: any) => ({
            id: `kandilli-${e.earthquake_id || e.rev || Math.random()}`,
            title: `${e.title}`,
            description: `${e.location} - Kandilli`,
            lat: parseFloat(e.geojson.coordinates[1]),
            lng: parseFloat(e.geojson.coordinates[0]),
            severity: getSeverity(e.mag),
            magnitude: e.mag,
            timestamp: new Date(e.date).toISOString(),
            source: 'kandilli',
          }))
        aggregatedEvents.push(...kandilliEvents)
      }
    } catch (e) {
      console.error('Kandilli fetch failed:', e)
    }

    // 3. Fetch from AFAD
    try {
      const afadRes = await fetch(
        'https://deprem.afad.gov.tr/apiv2/event/filter?limit=100&orderby=timedesc',
      )
      if (afadRes.ok) {
        const afadData = await afadRes.json()
        const afadEvents = (afadData || [])
          .filter((e: any) => parseFloat(e.magnitude) >= minMagnitude)
          .map((e: any) => ({
            id: `afad-${e.eventID}`,
            title: `M ${e.magnitude} - ${e.location}`,
            description: `${e.location} - AFAD`,
            lat: parseFloat(e.latitude),
            lng: parseFloat(e.longitude),
            severity: getSeverity(parseFloat(e.magnitude)),
            magnitude: parseFloat(e.magnitude),
            timestamp: new Date(e.eventDate).toISOString(),
            source: 'afad',
          }))
        aggregatedEvents.push(...afadEvents)
      }
    } catch (e) {
      console.error('AFAD fetch failed:', e)
    }

    // Deduplication Logic
    // Sort by source priority (e.g., USGS > Kandilli > AFAD) or magnitude
    // We'll use a simple spatial-temporal dedup
    const finalEvents: any[] = []
    const sortedEvents = aggregatedEvents.sort((a, b) => b.magnitude - a.magnitude)

    for (const event of sortedEvents) {
      const isDuplicate = finalEvents.some((existing) => {
        const dist = distanceKm(event.lat, event.lng, existing.lat, existing.lng)
        const timeDiff = Math.abs(
          new Date(event.timestamp).getTime() - new Date(existing.timestamp).getTime(),
        )
        // If within 20km and 5 minutes, consider it a duplicate
        return dist < 20 && timeDiff < 5 * 60 * 1000
      })

      if (!isDuplicate) {
        finalEvents.push(event)
      }
    }

    // Initialize Supabase Client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (finalEvents.length > 0) {
      const eventsToInsert = finalEvents.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        lat: e.lat,
        lng: e.lng,
        severity: e.severity,
        timestamp: e.timestamp,
        source: e.source,
      }))

      const { error: upsertError } = await supabase
        .from('earthquake_events')
        .upsert(eventsToInsert, { onConflict: 'id' })

      if (upsertError) {
        console.error('Error upserting earthquakes:', upsertError)
      }
    }

    return new Response(
      JSON.stringify({
        meta: {
          status: 'success',
          count: finalEvents.length,
          total_fetched: aggregatedEvents.length,
        },
        data: finalEvents,
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
