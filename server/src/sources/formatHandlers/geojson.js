/**
 * "geojson" format handler — standard GeoJSON FeatureCollection
 * ({ features: [{ geometry: { coordinates: [lng, lat, depth?] }, properties: {...} }] }).
 * lat/lng/depth are read straight from feature.geometry.coordinates (the
 * GeoJSON spec fixes this order), so field_map only needs to map fields
 * that live under `properties` (id, time, magnitude, title, description) —
 * an admin adding a USGS-shaped feed doesn't need to know the coordinate
 * order at all.
 */

import axios from 'axios';
import { getPath } from './json.js';

export async function fetchGeoJSON(row) {
  const { response_path = 'features' } = row.endpoint_config || {};
  const res = await axios.get(row.endpoint_url, { timeout: 10000 });
  const records = getPath(res.data, response_path);
  if (!Array.isArray(records)) throw new Error(`response_path "${response_path}" did not resolve to a GeoJSON features array`);
  return { records, status: res.status };
}

export function mapGeoJSON(feature, field_map) {
  const props = feature?.properties || {};
  const coords = feature?.geometry?.coordinates || [];
  const [lng, lat, depth] = coords;

  return {
    id: field_map.id ? getPath(props, field_map.id) : feature?.id,
    lat,
    lng,
    time: field_map.time ? getPath(props, field_map.time) : props.time,
    magnitude: field_map.magnitude ? getPath(props, field_map.magnitude) : (props.mag ?? null),
    depth: field_map.depth ? getPath(props, field_map.depth) : (depth ?? null),
    title: field_map.title ? getPath(props, field_map.title) : (props.title ?? null),
    description: field_map.description ? getPath(props, field_map.description) : (props.place ?? null),
  };
}
