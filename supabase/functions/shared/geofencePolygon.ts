// Pure decision logic for the polygon/PostGIS geofencing narrowing layer
// (spec 015/036 remaining item — "tam polygon/PostGIS tabanlı coğrafi
// hedefleme"). The actual point-in-polygon test runs in Postgres
// (resolve_contacts_in_region() RPC, migration
// 20260715150000_contacts_polygon_geofencing.sql) — this function only
// decides what a contact's containment result MEANS for dispatch, kept
// separate so that decision is testable without a live DB connection.
//
// `is_within` is NULL whenever containment couldn't be determined (contact
// has no lat/lng, or the country/region has no resolvable boundary polygon)
// — NULL must never exclude a recipient, exactly like regionMatches()'s own
// "an unset region always matches" rule in dispatchMatching.ts. Only an
// explicit FALSE (coordinates are geometrically outside the target region)
// narrows the audience.
export function polygonAllowsContact(isWithin: boolean | null | undefined): boolean {
  return isWithin !== false
}
