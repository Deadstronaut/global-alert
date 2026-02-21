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
    const aggregatedDroughts: any[] = []

    // 1. Fetch from ReliefWeb
    const fetchReliefWeb = async () => {
      try {
        const rwUrl =
          'https://api.reliefweb.int/v1/disasters?appname=gews_app&filter[value]=Drought&filter[field]=type&fields[include][]=status&fields[include][]=name&fields[include][]=primary_country&limit=50&preset=latest'
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
                type: 'drought',
                title: item.fields.name,
                lat,
                lng,
                severity:
                  item.fields.status === 'ongoing'
                    ? 'high'
                    : item.fields.status === 'alert'
                      ? 'low'
                      : 'minimal',
                timestamp: new Date().toISOString(),
                source: 'reliefweb',
              }
            })
            .filter((f: any) => f.lat !== 0 && f.lng !== 0)
        }
      } catch (e) {
        console.error('ReliefWeb Drought fetch failed:', e)
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
          const localDroughts = []
          const itemRegex = /<item>([\s\S]*?)<\/item>/g
          let match
          while ((match = itemRegex.exec(xmlText)) !== null) {
            const itemContent = match[1]
            if (itemContent.toLowerCase().includes('drought')) {
              const titleMatch = /<title>(.*?)<\/title>/.exec(itemContent)
              const geoLatMatch = /<geo:lat>(.*?)<\/geo:lat>/.exec(itemContent)
              const geoLngMatch = /<geo:long>(.*?)<\/geo:long>/.exec(itemContent)
              if (titleMatch) {
                localDroughts.push({
                  id: `gdacs-${titleMatch[1].substring(0, 10).replace(/[^a-zA-Z0-9]/g, '')}-${Math.floor(Math.random() * 1000)}`,
                  type: 'drought',
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
          return localDroughts.filter((f: any) => f.lat !== 0 && f.lng !== 0)
        }
      } catch (e) {
        console.error('GDACS Drought fetch failed:', e)
      }
      return []
    }

    const [rwResults, gdacsResults] = await Promise.all([fetchReliefWeb(), fetchGDACS()])
    aggregatedDroughts.push(...rwResults, ...gdacsResults)

    // Deduplication Logic
    const finalDroughts: any[] = []
    for (const event of aggregatedDroughts) {
      const isDuplicate = finalDroughts.some((existing) => {
        return distanceKm(event.lat, event.lng, existing.lat, existing.lng) < 100
      })
      if (!isDuplicate) {
        finalDroughts.push(event)
      }
    }

    // Default mock data if no events found
    if (finalDroughts.length === 0) {
      finalDroughts.push({
        id: 'd_mock_1',
        type: 'drought',
        title: 'Severe Drought - Horn of Africa',
        lat: 5.15,
        lng: 46.19,
        severity: 'high',
        timestamp: new Date().toISOString(),
        source: 'mock',
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (finalDroughts.length > 0) {
      const eventsToInsert = finalDroughts.map((f: any) => ({
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
        .from('drought_events')
        .upsert(eventsToInsert, { onConflict: 'id' })

      if (upsertError) {
        console.error('Error upserting droughts:', upsertError)
      }
    }

    return new Response(
      JSON.stringify({
        meta: {
          status: 'success',
          count: finalDroughts.length,
          total_fetched: aggregatedDroughts.length,
        },
        data: finalDroughts,
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
