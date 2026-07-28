// Per-hazard-type default buffer-radius calculation (spec 008, FR-006/Clarifications).
// Each hazard type gets its own dispatch entry so one type's logic can change
// independently of the others; types without a specific entry fall back to
// the severity-based lookup table.

const SEVERITY_RADIUS_KM = {
  critical: 50,
  high: 25,
  moderate: 10,
  low: 5,
  minimal: 2,
}

function severityFallback(event) {
  return SEVERITY_RADIUS_KM[event?.severity] ?? SEVERITY_RADIUS_KM.moderate
}

// Wildfire's `magnitude` field holds FRP (Fire Radiative Power, megawatts —
// NASA FIRMS' own real satellite-measured intensity value, not an invented
// number). Real FRP is heavily right-skewed (most detections are single-
// digit MW, a rare few reach tens of thousands from a large/hot fire
// front) — sqrt() compresses that skew into a usable radius range the same
// way this project's exposure-layer quantile ramps already handle skewed
// data elsewhere. 2km floor (even a tiny detection still means SOME local
// impact), 100km cap (a single extreme satellite pixel should not imply an
// impossible country-scale radius) — a rough intensity-based estimate, same
// honesty caveat as earthquake's 2^magnitude: not a real fire-spread model
// (wind/fuel/humidity/terrain aren't in this data at all).
const BUFFER_STRATEGIES = {
  earthquake: (event) => 2 ** Number(event?.magnitude ?? 0),
  wildfire: (event) => Math.min(100, Math.max(2, 2 + Math.sqrt(Math.max(Number(event?.magnitude ?? 0), 0)))),
}

export function defaultBufferRadiusKm(event) {
  const strategy = BUFFER_STRATEGIES[event?.type]
  return strategy ? strategy(event) : severityFallback(event)
}

export { SEVERITY_RADIUS_KM }
