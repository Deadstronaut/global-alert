/**
 * Normalizer - Tüm kaynakları ortak DisasterEvent formatına çevirir
 * Vue tarafındaki DisasterEvent.js ile birebir uyumlu
 */

const SEVERITY_MAP = {
  earthquake: (mag) => {
    if (mag >= 7.0) return 'critical';
    if (mag >= 5.5) return 'high';
    if (mag >= 4.0) return 'moderate';
    if (mag >= 2.5) return 'low';
    return 'minimal';
  },
  wildfire: (frp) => {
    if (frp >= 500)  return 'critical';
    if (frp >= 200)  return 'high';
    if (frp >= 50)   return 'moderate';
    if (frp >= 10)   return 'low';
    return 'minimal';
  },
  flood: (level) => {
    if (level >= 4) return 'critical';
    if (level >= 3) return 'high';
    if (level >= 2) return 'moderate';
    if (level >= 1) return 'low';
    return 'minimal';
  },
  drought: (level) => {
    if (level >= 4) return 'critical';
    if (level >= 3) return 'high';
    if (level >= 2) return 'moderate';
    return 'low';
  },
  food_security: (phase) => {
    if (phase >= 5) return 'critical';
    if (phase >= 4) return 'high';
    if (phase >= 3) return 'moderate';
    if (phase >= 2) return 'low';
    return 'minimal';
  },
  tsunami: () => 'critical',
  cyclone: (level) => {
    if (level >= 4) return 'critical';
    if (level >= 3) return 'high';
    return 'moderate';
  },
  volcano: () => 'high',
  disaster: () => 'moderate',
  epidemic: () => 'high',
};

/**
 * Ortak normalize fonksiyonu - tüm kaynak adaptörleri bunu çağırır
 */
export function normalize({
  id,
  type,
  lat,
  lng,
  magnitude = null,
  depth = null,
  title = '',
  description = '',
  time = null,
  source = '',
  sourceUrl = '',
  extra = {},
}) {
  const severityFn = SEVERITY_MAP[type] || (() => 'low');
  const severity = severityFn(magnitude || 0);

  return {
    id: String(id),
    type,
    lat: Number(lat),
    lng: Number(lng),
    severity,
    magnitude: magnitude !== null ? Number(magnitude) : null,
    depth: depth !== null ? Number(depth) : null,
    title: String(title).slice(0, 200),
    description: String(description).slice(0, 500),
    time: time ? new Date(time).toISOString() : new Date().toISOString(),
    source: String(source),
    sourceUrl: String(sourceUrl),
    extra,
    // Aggregator metadata
    receivedAt: new Date().toISOString(),
  };
}
