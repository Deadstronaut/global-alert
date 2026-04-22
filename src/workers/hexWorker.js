/**
 * Hex Worker — updateHexbins hesabını main thread'den ayırır.
 * MapView'den postMessage ile event listesi + resolution gelir,
 * hazır GeoJSON features array döner.
 */

import { latLngToCell, cellToBoundary, gridDisk } from 'h3-js'

const severityWeight = { critical: 1.0, high: 0.75, moderate: 0.5, low: 0.25, minimal: 0.1 }
const decay = [1.0, 0.5, 0.2]

function crossesAntimeridian(ring) {
  for (let i = 0; i < ring.length - 1; i++) {
    if (Math.abs(ring[i][0] - ring[i + 1][0]) > 180) return true
  }
  return false
}

function intensityToHex(v) {
  if (v >= 0.85) return '#ef4444'
  if (v >= 0.65) return '#f97316'
  if (v >= 0.45) return '#eab308'
  if (v >= 0.25) return '#22c55e'
  return '#3b82f6'
}

self.onmessage = ({ data }) => {
  const { events, resolution } = data

  const intensityMap = {}

  for (const e of events) {
    if (!e.lat || !e.lng) continue
    const center = latLngToCell(e.lat, e.lng, resolution)
    const weight = severityWeight[e.severity] ?? 0.1

    for (let ring = 0; ring <= 2; ring++) {
      const inner = ring > 0 ? new Set(gridDisk(center, ring - 1)) : null
      for (const neighbor of gridDisk(center, ring)) {
        if (inner && inner.has(neighbor)) continue
        intensityMap[neighbor] = Math.min(1.0, (intensityMap[neighbor] ?? 0) + weight * decay[ring])
      }
    }
  }

  const features = []
  for (const [h3Index, intensity] of Object.entries(intensityMap)) {
    const boundary = cellToBoundary(h3Index)
    const ring = boundary.map(([lat, lng]) => [lng, lat])
    ring.push(ring[0])
    if (crossesAntimeridian(ring)) continue

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        color: intensityToHex(intensity),
        opacity: Math.min(0.55, 0.12 + intensity * 0.43),
        intensity,
        maxSeverity:
          intensity >= 0.75 ? 'critical'
          : intensity >= 0.5 ? 'high'
          : intensity >= 0.3 ? 'moderate'
          : 'low',
      },
    })
  }

  self.postMessage({ features })
}
