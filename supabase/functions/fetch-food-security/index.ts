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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const aggregatedEvents: any[] = []

    // 1. Fetch from IPC API (latest areas)
    const fetchIPC = async () => {
      try {
        const ipcUrl = 'https://api.ipcinfo.org/areas'
        const res = await fetch(ipcUrl, { headers: { 'User-Agent': 'GEWS-Global-Alert/1.0' } })
        if (res.ok) {
          const data = await res.json()
          return (data || [])
            .filter((item: any) => {
              const phase = item.phase || item.overall_phase || 0
              return phase >= 3
            })
            .map((item: any) => {
              return {
                id: `ipc-${item.id || item.area_id || Math.floor(Math.random() * 100000)}`,
                type: 'food_security',
                title: `Food Insecurity: ${item.area_name || item.location || 'Unknown Area'}`,
                description: `IPC Phase ${item.phase || item.overall_phase}. People in need: ${item.population || 'Unknown'}.`,
                lat: item.lat || 0,
                lng: item.lng || item.lon || 0,
                severity: item.phase >= 5 ? 'critical' : item.phase >= 4 ? 'high' : 'moderate',
                timestamp: new Date().toISOString(),
                source: 'ipc',
              }
            })
            .filter((f: any) => f.lat !== 0 && f.lng !== 0)
        }
      } catch (e) {
        console.error('IPC fetch failed:', e)
      }
      return []
    }

    // 2. Fetch from ReliefWeb
    const fetchReliefWeb = async () => {
      try {
        const rwUrl =
          'https://api.reliefweb.int/v1/disasters?appname=gews_app&query[value]="food insecurity"&fields[include][]=status&fields[include][]=name&fields[include][]=primary_country&limit=20&preset=latest'
        const rwRes = await fetch(rwUrl, { headers: { 'User-Agent': 'GEWS-Global-Alert/1.0' } })
        if (rwRes.ok) {
          const rwData = await rwRes.json()
          return (rwData.data || [])
            .map((item: any) => {
              let lat = 0,
                lng = 0
              if (item.fields.primary_country && item.fields.primary_country.location) {
                lat = item.fields.primary_country.location.lat || 0
                lng = item.fields.primary_country.location.lon || 0
              }
              return {
                id: `rw-food-${item.id}`,
                type: 'food_security',
                title: item.fields.name,
                lat,
                lng,
                severity: item.fields.status === 'ongoing' ? 'high' : 'moderate',
                timestamp: new Date().toISOString(),
                source: 'reliefweb',
              }
            })
            .filter((f: any) => f.lat !== 0 && f.lng !== 0)
        }
      } catch (e) {
        console.error('ReliefWeb Food fetch failed:', e)
      }
      return []
    }

    const [ipcResults, rwResults] = await Promise.all([fetchIPC(), fetchReliefWeb()])
    aggregatedEvents.push(...ipcResults, ...rwResults)

    // Deduplication Logic (100km radius)
    const finalEvents: any[] = []
    for (const event of aggregatedEvents) {
      const isDuplicate = finalEvents.some((existing) => {
        return distanceKm(event.lat, event.lng, existing.lat, existing.lng) < 100
      })
      if (!isDuplicate) {
        finalEvents.push(event)
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (finalEvents.length > 0) {
      const eventsToInsert = finalEvents.map((f: any) => ({
        id: f.id,
        title: f.title,
        description: f.description || null,
        lat: f.lat,
        lng: f.lng,
        severity: f.severity,
        timestamp: f.timestamp,
        source: f.source,
      }))

      const { error: upsertError } = await supabase
        .from('food_security_events')
        .upsert(eventsToInsert, { onConflict: 'id' })

      if (upsertError) {
        console.error('Error upserting food security events:', upsertError)
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
      },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
