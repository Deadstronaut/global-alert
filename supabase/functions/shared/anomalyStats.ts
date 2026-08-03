// Sandboxed AI Assistance (spec 051) — anomaly flag statistics.
//
// Pure, deterministic z-score check — deliberately NOT an AI/ML model
// (research.md Decision 2). Kept auditable: given the same history and
// value, the result is always the same, and every field in the output can
// be shown to an operator as-is. Used by ai-anomaly-check and mirrored by
// tests/unit/anomalyStats.test.js on the frontend side.

export interface AnomalyCheckResult {
  isAnomaly: boolean
  mean: number
  stddev: number
  zScore: number | null
}

const DEFAULT_Z_SCORE_THRESHOLD = 3
const MIN_HISTORY_SIZE = 5

/**
 * @param history Recent historical numeric values for the same source + metric (excludes `value`).
 * @param value The new, just-ingested value to check.
 * @param threshold Z-score above which a value is flagged (default 3 — ~99.7th percentile for a normal distribution).
 */
export function checkAnomaly(
  history: number[],
  value: number,
  threshold: number = DEFAULT_Z_SCORE_THRESHOLD,
): AnomalyCheckResult {
  if (history.length < MIN_HISTORY_SIZE) {
    // Not enough history to judge "unusual" — never flag, never false-positive
    // on a source's first few readings.
    return { isAnomaly: false, mean: NaN, stddev: NaN, zScore: null }
  }

  const mean = history.reduce((sum, v) => sum + v, 0) / history.length
  const variance = history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / history.length
  const stddev = Math.sqrt(variance)

  if (stddev === 0) {
    // Perfectly flat history — any deviation at all is meaningful, but a
    // z-score is undefined (division by zero). Flag only on exact equality
    // being false, using a direct comparison instead of a ratio.
    return { isAnomaly: value !== mean, mean, stddev, zScore: null }
  }

  const zScore = Math.abs(value - mean) / stddev
  return { isAnomaly: zScore > threshold, mean, stddev, zScore }
}
