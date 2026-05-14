import {latLngToCell, cellToBoundary, gridDisk, polygonToCells, cellToParent} from 'h3-js';

const severityWeight = {critical: 1.0, high: 0.75, moderate: 0.5, low: 0.25, minimal: 0.1};
const decay = [1.0, 0.5, 0.2];

function crossesAntimeridian(ring) {
  for (let i = 0; i < ring.length - 1; i++) {
    if (Math.abs(ring[i][0] - ring[i + 1][0]) > 180) return true;
  }
  return false;
}

const typeColors = {
  earthquake: ['#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e'], // Mavi -> Mor -> Pembe
  wildfire: ['#fef3c7', '#fde68a', '#fbbf24', '#f59e0b', '#d97706', '#b91d12'],   // Sarı -> Turuncu -> Kırmızı
  flood: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7'],    // Açık Mavi -> Koyu Mavi
  cyclone: ['#f1f5f9', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#1e293b'],  // Gri -> Siyah (Fırtına)
  tsunami: ['#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0f766e'],  // Turkuaz
  volcano: ['#450a0a', '#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444'],  // Çok Koyu Kırmızı
  default: ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444']              // Klasik skala
};

function intensityToHex(v, type = 'default') {
  const palette = typeColors[type] || typeColors.default;
  const idx = Math.min(palette.length - 1, Math.floor(v * palette.length));
  return palette[idx];
}

let landCellsSet = null;

self.onmessage = ({data}) => {
  const {type, events, resolution, isAggregated = false, geometry, bounds, landCells} = data;

  // Initialize land set (resolution 3)
  if (type === 'INIT_LAND' && landCells) {
    landCellsSet = new Set(landCells);
    return;
  }

  // Mode 1: Fill a specific geometry (e.g. selected country)
  if (type === 'FILL_GRID' && geometry) {
    const polygonList = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
    const allCells = new Set();

    for (const polyCoords of polygonList) {
      try {
        // detail resolution for the country focus
        const cells = polygonToCells(polyCoords, resolution + 1, 2);
        for (const c of cells) allCells.add(c);
      } catch (e) { /* ignore */ }
    }

    const gridFeatures = [];
    for (const h3Id of allCells) {
      const boundary = cellToBoundary(h3Id);
      const ring = boundary.map(([lat, lng]) => [lng, lat]);
      ring.push(ring[0]);
      if (crossesAntimeridian(ring)) continue;

      gridFeatures.push({
        type: 'Feature',
        geometry: {type: 'Polygon', coordinates: [ring]},
        properties: {h3_id: h3Id}
      });
    }
    self.postMessage({type: 'FILL_GRID', features: gridFeatures});
    return;
  }

  // Mode 1.5: Fill the viewport grid (Universal background grid)
  if (type === 'FILL_VIEWPORT' && bounds) {
    const [[minLng, minLat], [maxLng, maxLat]] = bounds;
    
    let viewportPolys = [];
    if (minLng > maxLng) {
      // Crosses antimeridian: split into two boxes
      viewportPolys = [
        [[ [minLng, minLat], [180, minLat], [180, maxLat], [minLng, maxLat], [minLng, minLat] ]],
        [[ [-180, minLat], [maxLng, minLat], [maxLng, maxLat], [-180, maxLat], [-180, minLat] ]]
      ];
    } else {
      viewportPolys = [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat]
      ]];
    }

    let allCells = new Set();
    try {
      const res = Math.max(0, resolution - 1);
      for (const poly of (Array.isArray(viewportPolys[0][0][0]) ? viewportPolys : [viewportPolys])) {
         const cells = polygonToCells(poly, res, 2);
         for (const c of cells) allCells.add(c);
      }
    } catch (e) { /* ignore */ }

    const gridFeatures = [];
    for (const h3Id of allCells) {
      // Land filtering
      if (landCellsSet) {
        try {
          const parent = cellToParent(h3Id, 3);
          if (!landCellsSet.has(parent)) continue; // Skip ocean cells
        } catch (e) { /* fallback */ }
      }

      const boundary = cellToBoundary(h3Id);
      const ring = boundary.map(([lat, lng]) => [lng, lat]);
      ring.push(ring[0]);
      if (crossesAntimeridian(ring)) continue;

      gridFeatures.push({
        type: 'Feature',
        geometry: {type: 'Polygon', coordinates: [ring]},
        properties: {h3_id: h3Id}
      });
    }
    self.postMessage({type: 'FILL_VIEWPORT', features: gridFeatures});
    return;
  }

  // Mode 2: Disaster Density (Hexbins/Heatmap)
  const intensityMap = {};
  const groupMap = new Map();

  if (isAggregated && events) {
    for (const group of events) {
      const h3Id = group.h3_id;
      const count = group.event_count || group.count || 1;
      const maxSev = group.max_severity || group.maxSeverity || 'minimal';
      const pType = group.primaryType || 'default';
      
      const weight = severityWeight[maxSev] || 0.1;
      const intensity = Math.min(1.0, (count / 5) * weight);
      
      intensityMap[h3Id] = intensity;
      groupMap.set(h3Id, {count, maxSeverity: maxSev, primaryType: pType});
    }
  } else if (events) {
    for (const e of events) {
      if (!e.h3_id && (!e.lat || !e.lng)) continue;
      const center = e.h3_id || latLngToCell(e.lat, e.lng, resolution);
      const weight = severityWeight[e.severity] ?? 0.1;

      for (let ring = 0; ring <= 2; ring++) {
        const inner = ring > 0 ? new Set(gridDisk(center, ring - 1)) : null;
        for (const neighbor of gridDisk(center, ring)) {
          if (inner && inner.has(neighbor)) continue;
          intensityMap[neighbor] = Math.min(1.0, (intensityMap[neighbor] ?? 0) + weight * decay[ring]);
        }
      }
    }
  }

  const features = [];
  for (const [h3Index, intensity] of Object.entries(intensityMap)) {
    const boundary = cellToBoundary(h3Index);
    const ring = boundary.map(([lat, lng]) => [lng, lat]);
    ring.push(ring[0]);
    if (crossesAntimeridian(ring)) continue;

    const meta = groupMap.get(h3Index);

    features.push({
      type: 'Feature',
      geometry: {type: 'Polygon', coordinates: [ring]},
      properties: {
        h3_id: h3Index,
        color: intensityToHex(intensity, meta ? meta.primaryType : 'default'),
        opacity: Math.min(0.55, 0.12 + intensity * 0.43),
        intensity,
        eventCount: meta ? meta.count : 1,
        maxSeverity: meta ? meta.maxSeverity : (
          intensity >= 0.75 ? 'critical'
            : intensity >= 0.5 ? 'high'
              : intensity >= 0.3 ? 'moderate'
                : 'low'
        ),
      },
    });
  }

  self.postMessage({type: 'DISASTER_HEX', features});
};
