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
