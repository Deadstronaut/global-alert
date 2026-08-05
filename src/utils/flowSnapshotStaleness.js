/**
 * Whether a flow snapshot (wind/ocean-current, spec 053) should be flagged
 * as potentially stale — contracts/flow-snapshot-contract.md's Frontend
 * step 4: "older than ~2x the expected cadence" rather than silently
 * presenting old data as current (spec FR-006, User Story 3 acceptance
 * scenario 2).
 */
const DEFAULT_CADENCE_HOURS = 6 // matches GFS's own publish cycle (research.md §1)
const STALE_MULTIPLIER = 2

/**
 * @param {string|null|undefined} issuedAt - ISO timestamp, or null/undefined if no snapshot exists
 * @param {Date} [now]
 * @param {number} [cadenceHours]
 * @returns {boolean} true if issuedAt is missing, unparseable, or older than cadenceHours * STALE_MULTIPLIER
 */
export function isFlowSnapshotStale(issuedAt, now = new Date(), cadenceHours = DEFAULT_CADENCE_HOURS) {
  if (!issuedAt) return true
  const issuedDate = new Date(issuedAt)
  if (Number.isNaN(issuedDate.getTime())) return true

  const ageMs = now.getTime() - issuedDate.getTime()
  const thresholdMs = cadenceHours * STALE_MULTIPLIER * 60 * 60 * 1000
  return ageMs > thresholdMs
}
