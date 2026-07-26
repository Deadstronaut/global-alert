/**
 * Abbreviates a raw population count for display inside a small map shape
 * (hexagon/province fill) — spec 046 FR-003. A hexagon at any zoom level is
 * too small to fit a full comma-separated number like "482,367" without
 * overflowing, so this rounds to a short suffixed form instead.
 */
export function formatPopulationLabel(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''

  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (abs >= 1_000_000) return `${sign}${trimTrailingZero(abs / 1_000_000)}M`
  if (abs >= 1_000) return `${sign}${trimTrailingZero(abs / 1_000)}K`
  return `${sign}${Math.round(abs)}`
}

function trimTrailingZero(n) {
  const rounded = Math.round(n * 10) / 10
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1)
}
