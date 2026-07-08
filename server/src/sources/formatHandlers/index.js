/**
 * Format handlers for the generic/custom source pipeline (dynamicSources.js).
 * Each handler turns a data_sources row's raw upstream response into a flat
 * array of "raw items" that field_map can then be applied to via getPath().
 *
 * Faz 2.5: lets a country admin add a standards-shaped source (GeoJSON,
 * RSS/XML, CSV) with zero code — only sources with genuinely bespoke shapes
 * (custom JSON field names + HTML scraping, like AFAD/Kandilli) still need a
 * hand-written Tier-1 adapter (see ../registry.js).
 *
 * row.endpoint_config.format selects the handler; defaults to 'json' so
 * existing custom sources (added before this feature existed) keep working
 * unchanged.
 */

import { fetchJSON, mapJSON } from './json.js';
import { fetchGeoJSON, mapGeoJSON } from './geojson.js';
import { fetchRSS, mapRSS } from './rss.js';
import { fetchCSV, mapCSV } from './csv.js';
import { fetchFDSN, mapFDSN } from './fdsn.js';

export const FORMAT_HANDLERS = {
  json:    { fetch: fetchJSON,    map: mapJSON },
  geojson: { fetch: fetchGeoJSON, map: mapGeoJSON },
  rss:     { fetch: fetchRSS,     map: mapRSS },
  csv:     { fetch: fetchCSV,     map: mapCSV },
  fdsn:    { fetch: fetchFDSN,    map: mapFDSN },
};

export function resolveFormat(row) {
  return row.endpoint_config?.format || 'json';
}
