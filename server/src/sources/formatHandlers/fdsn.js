/**
 * "fdsn" format handler — FDSN event webservice text format (pipe-delimited
 * columns, '#'-prefixed header line), used by GEOFON and many other national
 * seismology networks (https://www.fdsn.org/webservices/). Reuses the same
 * shape as server/src/sources/geofon.js's own parser, generalized so any
 * FDSN-compatible endpoint can be added via the admin panel with zero code.
 *
 * Standard FDSN text columns (in order):
 *   #EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|
 *   ContributorID|MagType|Magnitude|MagAuthor|EventLocationName
 * field_map keys reference these column names (case-sensitive, as listed
 * above) rather than JSON paths — there is no nesting in FDSN text.
 */

const FDSN_COLUMNS = [
  'EventID', 'Time', 'Latitude', 'Longitude', 'Depth/km', 'Author', 'Catalog',
  'Contributor', 'ContributorID', 'MagType', 'Magnitude', 'MagAuthor', 'EventLocationName',
];

export async function fetchFDSN(row) {
  const res = await fetch(row.endpoint_url, {
    headers: { 'User-Agent': 'GlobalAlert/1.0 (disaster monitoring)' },
    signal: AbortSignal.timeout(15000),
  });
  // FDSN webservices return 204/404 when there are simply no events in the
  // queried window — treat that as a successful empty poll, not an error.
  if (res.status === 204 || res.status === 404) return { records: [], status: 200 };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text = await res.text();
  const records = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const cols = line.split('|');
    if (cols.length < FDSN_COLUMNS.length) continue;
    const rec = {};
    FDSN_COLUMNS.forEach((name, i) => { rec[name] = cols[i]?.trim(); });
    records.push(rec);
  }
  return { records, status: res.status };
}

export function mapFDSN(rec, field_map = {}) {
  return {
    id: field_map.id ? rec[field_map.id] : rec.EventID,
    lat: field_map.lat ? rec[field_map.lat] : rec.Latitude,
    lng: field_map.lng ? rec[field_map.lng] : rec.Longitude,
    time: field_map.time ? rec[field_map.time] : rec.Time,
    magnitude: field_map.magnitude ? rec[field_map.magnitude] : (rec.Magnitude ?? null),
    depth: field_map.depth ? rec[field_map.depth] : (rec['Depth/km'] ?? null),
    title: field_map.title ? rec[field_map.title] : rec.EventLocationName,
    description: field_map.description ? rec[field_map.description] : rec.EventLocationName,
  };
}
