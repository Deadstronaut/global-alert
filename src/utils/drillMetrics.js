/**
 * Pure drill-summary metrics (spec 017) — mirrors
 * supabase/functions/shared/drillMetrics.ts, keep in sync (same convention
 * as severity.js/normalize.ts/normalizer.js: independently-synced copies per
 * runtime rather than a cross-runtime import).
 *
 * Kept separate from AdminView.vue's DB-touching endDrill() so the edge
 * cases — "no response" must never render as 0, "nothing sent" must never
 * render as 0% — are testable without mocking Supabase.
 */

export function computeResponseTimeSeconds(startedAt, firstAlertAt) {
  if (firstAlertAt == null) return null;
  const seconds = Math.round((new Date(firstAlertAt).getTime() - new Date(startedAt).getTime()) / 1000);
  return Math.max(0, seconds);
}

export function computeAckRate(sent, acknowledged) {
  if (sent === 0) return null;
  return { sent, acknowledged };
}
