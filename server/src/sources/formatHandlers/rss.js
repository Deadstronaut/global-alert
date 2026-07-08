/**
 * "rss" format handler — RSS/Atom <item> feeds, reusing the minimal XML
 * parser from ../rss.js (already battle-tested against GDACS/PTWC feeds).
 * Produces one raw item per <item>, with common RSS tags (title,
 * description, link, pubDate, geo:lat/geo:long) pre-extracted; field_map
 * can reference those tag names directly, or fall back to the defaults
 * below when omitted.
 */

import { parseXML } from '../rss.js';

export async function fetchRSS(row) {
  const res = await fetch(row.endpoint_url, {
    headers: { 'User-Agent': 'GlobalAlert/1.0 (disaster monitoring)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return { records: parseXML(xml), status: res.status };
}

export function mapRSS(item, field_map = {}) {
  return {
    id: field_map.id ? item[field_map.id] : (item.guid || item.link || item.title),
    lat: field_map.lat ? item[field_map.lat] : item.lat,
    lng: field_map.lng ? item[field_map.lng] : item.lng,
    time: field_map.time ? item[field_map.time] : item.pubDate,
    magnitude: field_map.magnitude ? item[field_map.magnitude] : (item.magnitude ?? null),
    depth: field_map.depth ? item[field_map.depth] : null,
    title: field_map.title ? item[field_map.title] : item.title,
    description: field_map.description ? item[field_map.description] : item.description,
  };
}
