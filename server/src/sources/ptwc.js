/**
 * PTWC - Pacific Tsunami Warning Center (NOAA)
 * RSS/Atom feed: https://www.tsunami.gov/events/xml/PHEBulletins.xml
 * Tsunami erken uyarı sistemi
 */

import axios from 'axios';
import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

const FEED_URL = 'https://www.tsunami.gov/events/xml/PHEBulletins.xml';
const POLL_INTERVAL = 3 * 60 * 1000; // 3 dakika

let _poll = null;
export function triggerPollPTWC() { return _poll?.(); }

export function startPTWC(onEvent) {
  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      const res = await axios.get(FEED_URL, { timeout: 10000, responseType: 'text' });
      const events = parsePTWCXML(res.data);
      let count = 0;
      for (const e of events) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        onEvent(e);
        count++;
      }
      reportStatus('PTWC', res.status, count);
    } catch (err) {
      const code = err.response?.status;
      if (code === 404) {
        // No active bulletins - normal state
        reportStatus('PTWC', 200, 0);
      } else {
        reportStatus('PTWC', code || 0);
        console.warn('[PTWC] Poll error:', err.message);
      }
    }
  }

  _poll = poll;
  poll();
  timer = setInterval(() => { if (running) poll(); }, POLL_INTERVAL);
  console.log('[PTWC] ✅ Polling started (3 min)');

  return () => {
    running = false;
    clearInterval(timer);
  };
}

function parsePTWCXML(xml) {
  const events = [];
  // Basit regex parse (tam XML parser yerine hafif çözüm)
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRe.exec(xml)) !== null) {
    const item = match[1];
    const title = extractTag(item, 'title');
    const pubDate = extractTag(item, 'pubDate');
    const link = extractTag(item, 'link');
    const desc = extractTag(item, 'description');
    const guid = extractTag(item, 'guid');

    if (!title || title.toLowerCase().includes('test')) continue;

    // Koordinat parse (genellikle desc içinde)
    const latMatch = desc?.match(/lat[itude]*[:\s]+([-\d.]+)/i);
    const lngMatch = desc?.match(/lon[gitude]*[:\s]+([-\d.]+)/i);
    const magMatch = desc?.match(/M\s*([\d.]+)/);

    const lat = latMatch ? parseFloat(latMatch[1]) : 0;
    const lng = lngMatch ? parseFloat(lngMatch[1]) : 0;
    const mag = magMatch ? parseFloat(magMatch[1]) : 0;

    const id = `ptwc-${guid || title.slice(0, 40)}`;

    events.push(normalize({
      id,
      type: 'tsunami',
      lat, lng,
      magnitude: mag,
      depth: 0,
      title: title,
      description: desc?.replace(/<[^>]+>/g, '').trim() || title,
      time: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      source: 'PTWC',
      sourceUrl: link || 'https://www.tsunami.gov',
      extra: { bulletin: true }
    }));
  }

  return events;
}

function extractTag(str, tag) {
  const m = str.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? (m[1] || m[2])?.trim() : null;
}
