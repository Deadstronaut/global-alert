/**
 * RSS/Atom Feed Source Adapter
 * Herhangi bir RSS/Atom kaynağından afet verisi çeker ve normalize eder.
 *
 * Kullanım:
 *   import { startRSSSource } from './rss.js'
 *   startRSSSource(handleEvent, {
 *     name: 'GDACS RSS',
 *     url: 'https://www.gdacs.org/xml/rss.xml',
 *     type: 'disaster',
 *     intervalMs: 5 * 60 * 1000,
 *     parseItem: (item) => ({ ... }) // opsiyonel özel parser
 *   })
 */

import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

// Minimal XML parser — bağımlılık yok
function parseXML(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title:       extractTag(block, 'title'),
      description: extractTag(block, 'description'),
      link:        extractTag(block, 'link'),
      pubDate:     extractTag(block, 'pubDate'),
      guid:        extractTag(block, 'guid'),
      lat:         extractTag(block, 'geo:lat') || extractTag(block, 'latitude'),
      lng:         extractTag(block, 'geo:long') || extractTag(block, 'longitude'),
      // GDACS specific
      severity:    extractTag(block, 'gdacs:severity'),
      eventtype:   extractTag(block, 'gdacs:eventtype'),
      magnitude:   extractTag(block, 'gdacs:magnitude') || extractTag(block, 'gdacs:richter'),
    });
  }
  return items;
}

function extractTag(xml, tag) {
  const m = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i').exec(xml);
  return m ? (m[1] ?? m[2] ?? '').trim() : null;
}

// Default item → DisasterEvent mapper
function defaultParseItem(item, sourceName, disasterType) {
  const lat = parseFloat(item.lat ?? '0');
  const lng = parseFloat(item.lng ?? '0');
  if (!lat && !lng) return null; // no coordinates — skip

  const mag = item.magnitude ? parseFloat(item.magnitude) : null;
  const id  = item.guid ?? `${sourceName}-${item.pubDate}-${lat}-${lng}`;

  return normalize({
    id:          id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100),
    type:        disasterType,
    lat,
    lng,
    magnitude:   mag,
    title:       (item.title ?? '').replace(/<[^>]+>/g, '').slice(0, 200),
    description: (item.description ?? '').replace(/<[^>]+>/g, '').slice(0, 500),
    time:        item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
    source:      sourceName,
    sourceUrl:   item.link ?? '',
    extra: {
      severity:  item.severity,
      eventtype: item.eventtype,
      guid:      item.guid,
    },
  });
}

/**
 * Start polling an RSS/Atom feed.
 *
 * @param {Function} onEvent   - handleEvent callback
 * @param {Object}   config
 * @param {string}   config.name        - source display name
 * @param {string}   config.url         - RSS/Atom URL
 * @param {string}   config.type        - disaster type (earthquake|wildfire|flood|...)
 * @param {number}   [config.intervalMs=5*60*1000]
 * @param {Function} [config.parseItem] - custom item parser (item, name, type) => event|null
 * @returns {Function} stop()
 */
export function startRSSSource(onEvent, { name, url, type, intervalMs = 5 * 60_000, parseItem }) {
  const parser = parseItem ?? defaultParseItem;

  async function poll() {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MHEWS/1.0 (Global Alert System)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const items = parseXML(xml);

      let count = 0;
      for (const item of items) {
        const event = parser(item, name, type);
        if (event) { onEvent(event); count++; }
      }

      reportStatus(name, 200);
      if (count > 0) console.log(`[RSS:${name}] ${count} events fetched`);
    } catch (err) {
      reportStatus(name, 0);
      console.warn(`[RSS:${name}] Poll failed: ${err.message}`);
    }
  }

  poll();
  const timer = setInterval(poll, intervalMs);
  return () => clearInterval(timer);
}

// ── Preconfigured feeds (add more as needed) ──────────────────────────────────

/**
 * GDACS — Global Disaster Alert and Coordination System
 * Covers: earthquakes, cyclones, floods, tsunamis, droughts, volcanoes
 */
export function startGDACSRSS(onEvent) {
  return startRSSSource(onEvent, {
    name:       'GDACS',
    url:        'https://www.gdacs.org/xml/rss.xml',
    type:       'disaster',
    intervalMs: 5 * 60_000,
    parseItem(item, sourceName) {
      const lat = parseFloat(item.lat ?? '0');
      const lng = parseFloat(item.lng ?? '0');
      if (!lat && !lng) return null;

      // Map GDACS eventtype → our type
      const typeMap = {
        EQ: 'earthquake', TC: 'cyclone', FL: 'flood',
        VO: 'volcano',    DR: 'drought', TS: 'tsunami',
      };
      const disasterType = typeMap[item.eventtype?.trim().toUpperCase()] ?? 'disaster';
      const mag = item.magnitude ? parseFloat(item.magnitude) : null;

      return normalize({
        id:          `gdacs-${item.guid?.split('/').pop() ?? `${lat}-${lng}`}`,
        type:        disasterType,
        lat, lng,
        magnitude:   mag,
        title:       (item.title ?? '').replace(/<[^>]+>/g, '').slice(0, 200),
        description: (item.description ?? '').replace(/<[^>]+>/g, '').slice(0, 500),
        time:        item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        source:      'GDACS',
        sourceUrl:   item.link ?? 'https://www.gdacs.org',
        extra: { severity: item.severity, eventtype: item.eventtype },
      });
    },
  });
}

/**
 * PTWC — Pacific Tsunami Warning Center (RSS)
 */
export function startPTWCRSS(onEvent) {
  return startRSSSource(onEvent, {
    name:       'PTWC',
    url:        'https://www.tsunami.gov/events/rss.xml',
    type:       'tsunami',
    intervalMs: 2 * 60_000,
  });
}
