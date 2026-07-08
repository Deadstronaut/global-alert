/**
 * "csv" format handler — header-row CSV (e.g. NASA FIRMS-shaped feeds).
 * First line is treated as column headers; each subsequent line becomes a
 * flat object keyed by header name, which field_map then references by
 * column name (no dotted paths needed — CSV has no nesting).
 */

export async function fetchCSV(row) {
  const res = await fetch(row.endpoint_url, {
    headers: { 'User-Agent': 'GlobalAlert/1.0 (disaster monitoring)' },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { records: [], status: res.status };

  const headers = lines[0].split(',').map((h) => h.trim());
  const records = lines.slice(1).map((line) => {
    const cols = line.split(',');
    const rec = {};
    headers.forEach((h, i) => { rec[h] = cols[i]?.trim(); });
    return rec;
  });
  return { records, status: res.status };
}

export function mapCSV(rec, field_map) {
  return {
    id: field_map.id ? rec[field_map.id] : undefined,
    lat: field_map.lat ? rec[field_map.lat] : rec.latitude,
    lng: field_map.lng ? rec[field_map.lng] : rec.longitude,
    time: field_map.time ? rec[field_map.time] : undefined,
    magnitude: field_map.magnitude ? rec[field_map.magnitude] : null,
    depth: field_map.depth ? rec[field_map.depth] : null,
    title: field_map.title ? rec[field_map.title] : null,
    description: field_map.description ? rec[field_map.description] : null,
  };
}
