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
    const aggregatedFloods: any[] = []

    // 1. Fetch from ReliefWeb
    const fetchReliefWeb = async () => {
      try {
        const rwUrl =
          'https://api.reliefweb.int/v1/disasters?appname=gews_app&filter[value]=Flood&filter[field]=type&fields[include][]=status&fields[include][]=name&fields[include][]=primary_country&limit=50&preset=latest'
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
                id: `rw-${item.id}`,
                type: 'flood',
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
        console.error('ReliefWeb Flood fetch failed:', e)
      }
      return []
    }

    // 2. Fetch from GDACS
    const fetchGDACS = async () => {
      try {
        const gdacsUrl = 'https://www.gdacs.org/xml/rss.xml'
        const gdRes = await fetch(gdacsUrl, { headers: { 'User-Agent': 'GEWS-Global-Alert/1.0' } })
        if (gdRes.ok) {
          const xmlText = await gdRes.text()
          const localFloods = []
          const itemRegex = /<item>([\s\S]*?)<\/item>/g
          let match
          while ((match = itemRegex.exec(xmlText)) !== null) {
            const itemContent = match[1]
            if (itemContent.toLowerCase().includes('flood')) {
              const titleMatch = /<title>(.*?)<\/title>/.exec(itemContent)
              const geoLatMatch = /<geo:lat>(.*?)<\/geo:lat>/.exec(itemContent)
              const geoLngMatch = /<geo:long>(.*?)<\/geo:long>/.exec(itemContent)
              if (titleMatch) {
                localFloods.push({
                  id: `gdacs-${titleMatch[1].substring(0, 10).replace(/[^a-zA-Z0-9]/g, '')}-${Math.floor(Math.random() * 1000)}`,
                  type: 'flood',
                  title: titleMatch[1].replace('<![CDATA[', '').replace(']]>', ''),
                  lat: geoLatMatch ? parseFloat(geoLatMatch[1]) : 0,
                  lng: geoLngMatch ? parseFloat(geoLngMatch[1]) : 0,
                  severity: 'moderate',
                  timestamp: new Date().toISOString(),
                  source: 'gdacs',
                })
              }
            }
          }
          return localFloods.filter((f: any) => f.lat !== 0 && f.lng !== 0)
        }
      } catch (e) {
        console.error('GDACS Flood fetch failed:', e)
      }
      return []
    }

    // 3. Fetch from Open-Meteo (Precipitation)
    const fetchPrecipitation = async () => {
      try {
        // Since we need specific coordinates, we'll fetch for a few major global clusters
        // or just use a generic "Heavy Rain" detection if we had a global grid.
        // For now, let's fetch for a few key coordinates to demonstrate the integration
        // In a production app, we'd use a more sophisticated weather grid.
        const regions = [
          { name: 'Western Europe', lat: 48.8, lng: 2.3 },
          { name: 'East Coast US', lat: 40.7, lng: -74.0 },
          { name: 'Southeast Asia', lat: 13.7, lng: 100.5 },
          { name: 'Central Anatolia', lat: 39.9, lng: 32.8 },
        ]

        const rainEvents = []
        for (const r of regions) {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lng}&current_weather=true&hourly=precipitation`
          const res = await fetch(url)
          if (res.ok) {
            const data = await res.json()
            const rain = data.current_weather.precipitation || 0
            if (rain > 5) {
              // Threshold for "Minimal" risk
              rainEvents.push({
                id: `rain-${r.name.toLowerCase().replace(' ', '-')}`,
                type: 'flood',
                title: `Flood Risk: Heavy Rain (${r.name})`,
                description: `Current precipitation: ${rain}mm/h. Sustained rain increases flash flood risk.`,
                lat: r.lat,
                lng: r.lng,
                severity: rain > 10 ? 'low' : 'minimal',
                timestamp: new Date().toISOString(),
                source: 'open-meteo',
              })
            }
          }
        }
        return rainEvents
      } catch (e) {
        console.error('Open-Meteo Precipitation fetch failed:', e)
      }
      return []
    }

    const [rwResults, gdacsResults, rainResults] = await Promise.all([
      fetchReliefWeb(),
      fetchGDACS(),
      fetchPrecipitation(),
    ])
    aggregatedFloods.push(...rwResults, ...gdacsResults, ...rainResults)

    // Deduplication Logic (Spatial: 50km for floods)
    const finalFloods: any[] = []
    for (const event of aggregatedFloods) {
      const isDuplicate = finalFloods.some((existing) => {
        return distanceKm(event.lat, event.lng, existing.lat, existing.lng) < 50
      })
      if (!isDuplicate) {
        finalFloods.push(event)
      }
    }

    // Default mock data if no events found
    if (finalFloods.length === 0) {
      finalFloods.push({
        id: 'f_mock_1',
        type: 'flood',
        title: 'Seasonal Flooding - Bangladesh',
        lat: 23.68,
        lng: 90.35,
        severity: 'high',
        timestamp: new Date().toISOString(),
        source: 'mock',
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (finalFloods.length > 0) {
      const eventsToInsert = finalFloods.map((f: any) => ({
        id: f.id,
        title: f.title,
        description: null,
        lat: f.lat,
        lng: f.lng,
        severity: f.severity,
        timestamp: f.timestamp,
        source: f.source,
      }))

      const { error: upsertError } = await supabase
        .from('flood_events')
        .upsert(eventsToInsert, { onConflict: 'id' })

      if (upsertError) {
        console.error('Error upserting floods:', upsertError)
      }
    }

    return new Response(
      JSON.stringify({
        meta: {
          status: 'success',
          count: finalFloods.length,
          total_fetched: aggregatedFloods.length,
        },
        data: finalFloods,
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
