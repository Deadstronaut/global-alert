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

const BUFFER_STRATEGIES = {
  earthquake: (event) => 2 ** Number(event?.magnitude ?? 0),
}

export function defaultBufferRadiusKm(event) {
  const strategy = BUFFER_STRATEGIES[event?.type]
  return strategy ? strategy(event) : severityFallback(event)
}

export { SEVERITY_RADIUS_KM }
