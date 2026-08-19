// Dependency-free 24h trend classification (spec 008, research.md §6) — used
// for a small inline SVG sparkline instead of adding a charting library.

export function classifyTrend(recentCounts) {
  const points = Array.isArray(recentCounts) ? recentCounts.map(Number) : []
  if (points.length < 2) {
    return { direction: 'stable', points }
  }
  const first = points[0]
  const last = points[points.length - 1]
  const delta = last - first
  const threshold = Math.max(1, Math.abs(first) * 0.1)
  let direction = 'stable'
  if (delta > threshold) direction = 'up'
  else if (delta < -threshold) direction = 'down'
  return { direction, points }
}

// 2026-08-19 ask: the sparkline used to be a plain straight-segment
// <polyline> — reads as broken/flat even when there IS real variance,
// because sharp corners at low resolution (6 points) don't visually read
// as "a trend" at a glance. Converts a small point series into a smooth
// SVG cubic-bezier path (Catmull-Rom -> Bezier) plus a matching "close down
// to the baseline" area path for a gradient fill under the curve. Pure/
// DOM-free — same test-the-math-not-the-DOM split as windDirectionAtPoint.js.
//
// @param {number[]} values
// @param {{ width?: number, height?: number, padding?: number }} [options]
// @returns {{ linePath: string, areaPath: string, hasVariance: boolean, lastPoint: {x:number,y:number,value:number} } | null}
//   null for fewer than 2 values (nothing to draw a curve through).
export function buildSmoothSparklinePath(values, options = {}) {
  const points = Array.isArray(values) ? values.map(Number) : []
  if (points.length < 2) return null

  const width = options.width ?? 100
  const height = options.height ?? 30
  const padding = options.padding ?? 3

  const hasVariance = new Set(points).size > 1

  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1

  const coords = points.map((v, i) => ({
    x: (i / (points.length - 1)) * width,
    y: height - padding - ((v - min) / range) * (height - padding * 2),
    value: v,
  }))

  // Catmull-Rom -> cubic Bezier control points (standard conversion,
  // tension 1/6) — smooth through every real data point, no library.
  function controlPoints(p0, p1, p2, p3) {
    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    return [cp1, cp2]
  }

  let linePath = `M ${coords[0].x},${coords[0].y}`
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[i + 2] ?? p2
    const [cp1, cp2] = controlPoints(p0, p1, p2, p3)
    linePath += ` C ${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${p2.x},${p2.y}`
  }

  const areaPath = `${linePath} L ${coords[coords.length - 1].x},${height} L ${coords[0].x},${height} Z`

  return { linePath, areaPath, hasVariance, lastPoint: coords[coords.length - 1] }
}
