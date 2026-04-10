/**
 * GEOFON - GFZ Potsdam'ın gerçek zamanlı sismik ağı
 * FDSN WebSocket: wss://geofon.gfz-potsdam.de/waveforms/...
 * REST: https://geofon.gfz-potsdam.de/fdsnws/event/1/query
 * Avrupa için çok güçlü
 */

import axios from 'axios';
import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

const FDSN_URL = 'https://geofon.gfz-potsdam.de/fdsnws/event/1/query';
const POLL_INTERVAL = 2 * 60 * 1000; // 2 dakika

let _poll = null;
export function triggerPollGEOFON() { return _poll?.(); }

export function startGEOFON(onEvent) {
  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      const now = new Date();
      const from = new Date(now.getTime() - 3 * 60 * 60 * 1000); // son 3 saat

      const res = await axios.get(FDSN_URL, {
        params: {
          starttime: from.toISOString().slice(0, 19) + 'Z',
          endtime: now.toISOString().slice(0, 19) + 'Z',
          format: 'text',
          minmagnitude: 2.0,
          limit: 200,
          nodata: 404,
        },
        timeout: 15000,
        responseType: 'text',
      });

      const rows = parseGEOFONText(res.data);
      let count = 0;
      for (const row of rows) {
        const id = `geofon-${row.eventId}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const event = normalizeGEOFONRow(row);
        if (event) { onEvent(event); count++; }
      }
      reportStatus('GEOFON', res.status, count);
    } catch (err) {
      if (err.response?.status === 404) {
        reportStatus('GEOFON', 200, 0); // no events in window
      } else {
        reportStatus('GEOFON', err.response?.status || 0);
        console.warn('[GEOFON] Poll error:', err.message);
      }
    }
  }

  _poll = poll;
  poll();
  timer = setInterval(() => { if (running) poll(); }, POLL_INTERVAL);
  console.log('[GEOFON] ✅ Polling started (2 min)');

  return () => {
    running = false;
    clearInterval(timer);
  };
}

// FDSN text format: #EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName
function parseGEOFONText(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const cols = line.split('|');
    if (cols.length < 12) continue;
    const [eventId, time, lat, lng, depth, , , , , magType, mag, , region] = cols;
    rows.push({
      eventId: eventId.trim(),
      time: time.trim(),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      depth: parseFloat(depth) || 0,
      mag: parseFloat(mag) || 0,
      magType: magType?.trim() || '',
      region: region?.trim() || 'Europe/Global',
    });
  }
  return rows;
}

function normalizeGEOFONRow(r) {
  return normalize({
    id: `geofon-${r.eventId}`,
    type: 'earthquake',
    lat: r.lat, lng: r.lng,
    magnitude: r.mag,
    depth: r.depth,
    title: `M${r.mag} - ${r.region}`,
    description: `M${r.mag} ${r.magType} | ${r.region} | Depth: ${r.depth}km`,
    time: r.time,
    source: 'GEOFON',
    sourceUrl: `https://geofon.gfz-potsdam.de/eqinfo/event.php?id=${r.eventId}`,
    extra: { depth: r.depth, region: r.region, network: 'GFZ' }
  });
}
