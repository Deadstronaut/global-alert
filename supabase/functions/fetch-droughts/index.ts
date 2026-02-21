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
    let aggregatedDroughts = [...rwResults, ...gdacsResults]

    // Deduplication Logic
    const deduplicated: any[] = []
    for (const event of aggregatedDroughts) {
      const isDuplicate = deduplicated.some((existing) => {
        return distanceKm(event.lat, event.lng, existing.lat, existing.lng) < 100
      })
      if (!isDuplicate) {
        deduplicated.push(event)
      }
    }

    // 3. Enhance with Precipitation Anomaly Logic (Top 5 only to save API credits/time)
    const topDroughts = deduplicated.slice(0, 5)
    const otherDroughts = deduplicated.slice(5)

    const checkAnomaly = async (event: any) => {
      try {
        const today = new Date()
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

        const currentUrl = `https://api.open-meteo.com/v1/forecast?latitude=${event.lat}&longitude=${event.lng}&past_days=30&daily=precipitation_sum&timezone=auto`
        const cRes = await fetch(currentUrl)
        const cData = await cRes.json()
        const currentSum =
          cData.daily?.precipitation_sum?.reduce((a: number, b: number) => a + (b || 0), 0) || 0

        // Historical Comparison (Archive API)
        const histYear = today.getFullYear() - 1
        const hStart = new Date(thirtyDaysAgo)
        hStart.setFullYear(histYear)
        const hEnd = new Date(today)
        hEnd.setFullYear(histYear)
        const hUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${event.lat}&longitude=${event.lng}&start_date=${hStart.toISOString().split('T')[0]}&end_date=${hEnd.toISOString().split('T')[0]}&daily=precipitation_sum`

        const hRes = await fetch(hUrl)
        const hData = await hRes.json()
        const histSum =
          hData.daily?.precipitation_sum?.reduce((a: number, b: number) => a + (b || 0), 0) || 1

        const anomaly = (currentSum - histSum) / histSum
        if (anomaly < -0.3) {
          event.title = `[Rainfall Deficit] ${event.title}`
          event.severity = anomaly < -0.6 ? 'critical' : 'high'
          event.description = `Precipitation anomaly: ${Math.round(anomaly * 100)}% vs last year.`
        }
      } catch (e) {
        console.error('Anomaly check failed for:', event.title, e)
      }
      return event
    }

    const enhancedTop = await Promise.all(topDroughts.map((d) => checkAnomaly(d)))
    const finalDroughts = [...enhancedTop, ...otherDroughts]

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (finalDroughts.length > 0) {
      const eventsToInsert = finalDroughts.map((f: any) => ({
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
