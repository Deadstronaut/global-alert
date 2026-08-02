/**
 * Builds the list of "{source} M{magnitude}" footer badges for a disaster
 * event popup — one per agency that independently reported the same
 * physical event (spec: multi-agency source badges, 2026-08-03).
 *
 * `event.contributingSources` is populated server-side (see
 * server/src/processors/deduplicator.js's mergeSource) going forward, but
 * events written before that migration have an empty array — falls back to
 * the event's own single source/magnitude so older rows still show one
 * badge instead of none.
 */
export function disasterSourceBadges(event) {
  const sources = event?.contributingSources?.length
    ? event.contributingSources
    : [{ source: event?.source, magnitude: event?.magnitude }]

  return sources
    .filter((s) => s.source)
    .map((s) => ({
      source: s.source,
      label: s.magnitude != null && Number.isFinite(Number(s.magnitude))
        ? `${s.source} M${Number(s.magnitude).toFixed(1)}`
        : s.source,
    }))
}
