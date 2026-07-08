/**
 * "json" format handler — the original dynamicSources.js behavior, extracted
 * unchanged: a plain JSON response, optionally nested under response_path,
 * containing an array of records; field_map's dotted paths resolve fields
 * per-record via getPath().
 */

import axios from 'axios';

export function getPath(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((acc, key) => (acc == null || typeof acc !== 'object' ? undefined : acc[key]), obj);
}

export async function fetchJSON(row) {
  const { response_path = '' } = row.endpoint_config || {};
  const res = await axios.get(row.endpoint_url, { timeout: 10000 });
  const records = response_path ? getPath(res.data, response_path) : res.data;
  if (!Array.isArray(records)) throw new Error(`response_path "${response_path}" did not resolve to an array`);
  return { records, status: res.status };
}

export function mapJSON(rec, field_map) {
  return {
    id: getPath(rec, field_map.id),
    lat: getPath(rec, field_map.lat),
    lng: getPath(rec, field_map.lng),
    time: getPath(rec, field_map.time),
    magnitude: field_map.magnitude ? getPath(rec, field_map.magnitude) : null,
    depth: field_map.depth ? getPath(rec, field_map.depth) : null,
    title: field_map.title ? getPath(rec, field_map.title) : null,
    description: field_map.description ? getPath(rec, field_map.description) : null,
  };
}
