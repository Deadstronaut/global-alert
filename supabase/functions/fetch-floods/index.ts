import { corsHeaders } from '../shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. PRIMARY: Fetch from ReliefWeb
    let finalFloods = []
    let sourceUsed = 'reliefweb'

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000) // 6s timeout

      const rwUrl =
        'https://api.reliefweb.int/v1/disasters?appname=gews_app&filter[value]=Flood&filter[field]=type&fields[include][]=status&fields[include][]=name&fields[include][]=primary_country&limit=50&preset=latest'

      const rwRes = await fetch(rwUrl, {
        headers: { 'User-Agent': 'GEWS-Global-Alert/1.0', Accept: 'application/json' },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!rwRes.ok) throw new Error(`ReliefWeb returned ${rwRes.status}`)

      const rwData = await rwRes.json()

      if (rwData.data && rwData.data.length > 0) {
        finalFloods = rwData.data
          .map((item: any) => {
            // Approximate coordinate mapping (ReliefWeb primary_country centroid)
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
              lat: lat,
              lng: lng,
              severity: item.fields.status === 'ongoing' ? 'high' : 'medium',
              timestamp: new Date().toISOString(), // Fallback timestamp
              source: 'reliefweb',
            }
          })
          .filter((f) => f.lat !== 0 && f.lng !== 0) // Keep only those with coords
      } else {
        throw new Error('ReliefWeb returned empty data')
      }
    } catch (e) {
      console.error('ReliefWeb Flood API failed, exploring fallback...', e)
      sourceUsed = 'gdacs-rss-fallback'

      // 2. SECONDARY / FALLBACK: GDACS RSS Feed for Floods
      try {
        const gdacsUrl = 'https://www.gdacs.org/xml/rss.xml'
        const gdRes = await fetch(gdacsUrl, { headers: { 'User-Agent': 'GEWS-Global-Alert/1.0' } })
        if (!gdRes.ok) throw new Error('GDACS also failed.')

        const xmlText = await gdRes.text()

        // Very simple RegExp parsing since we dont have DOMParser in basic Deno setup
        const itemRegex = /<item>([\s\S]*?)<\/item>/g
        let match

        while ((match = itemRegex.exec(xmlText)) !== null) {
          const itemContent = match[1]
          const titleMatch = /<title>(.*?)<\/title>/.exec(itemContent)
          const descMatch = /<description>(.*?)<\/description>/.exec(itemContent)
          const geoLatMatch = /<geo:lat>(.*?)<\/geo:lat>/.exec(itemContent)
          const geoLngMatch = /<geo:long>(.*?)<\/geo:long>/.exec(itemContent)

          if (titleMatch && titleMatch[1].toLowerCase().includes('flood')) {
            finalFloods.push({
              id: `gdacs-${Math.floor(Math.random() * 100000)}`,
              type: 'flood',
              title: titleMatch[1].replace('<![CDATA[', '').replace(']]>', ''),
              lat: geoLatMatch ? parseFloat(geoLatMatch[1]) : 0,
              lng: geoLngMatch ? parseFloat(geoLngMatch[1]) : 0,
              severity: 'medium',
              timestamp: new Date().toISOString(),
              source: 'gdacs',
            })
          }
        }
        finalFloods = finalFloods.filter((f) => f.lat !== 0 && f.lng !== 0).slice(0, 50)
      } catch (fbErr) {
        console.error('Fallback GDACS failed too.', fbErr)
        sourceUsed = 'mock-tertiary'

        // 3. TERTIARY: Return seeded realistic coordinates so the UI never crashes
        finalFloods = [
          {
            id: 'f_mock_1',
            type: 'flood',
            title: 'Seasonal Flooding - Bangladesh',
            lat: 23.68,
            lng: 90.35,
            severity: 'high',
            timestamp: new Date().toISOString(),
            source: 'mock',
          },
          {
            id: 'f_mock_2',
            type: 'flood',
            title: 'River Overflow - Germany',
            lat: 51.16,
            lng: 10.45,
            severity: 'medium',
            timestamp: new Date().toISOString(),
            source: 'mock',
          },
          {
            id: 'f_mock_3',
            type: 'flood',
            title: 'Heavy Rains - Brazil',
            lat: -14.23,
            lng: -51.92,
            severity: 'high',
            timestamp: new Date().toISOString(),
            source: 'mock',
          },
        ]
      }
    }

    return new Response(
      JSON.stringify({
        meta: { status: 'success', source: sourceUsed, count: finalFloods.length },
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
