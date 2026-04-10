/**
 * AFAD - Afet ve Acil Durum Yönetimi Başkanlığı (Türkiye)
 * REST: https://deprem.afad.gov.tr/apiv2/event/filter
 * Türkiye'nin resmi deprem kaynağı
 */

import axios from 'axios';
import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

let _poll = null;
export function triggerPollAFAD() { return _poll?.(); }

const BASE_URL = 'https://deprem.afad.gov.tr/apiv2/event/filter';
const POLL_INTERVAL = 15 * 1000; // 15 saniye

export function startAFAD(onEvent) {
  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      const now = new Date();
      const from = new Date(now.getTime() - 2 * 60 * 60 * 1000); // son 2 saat

      const res = await axios.get(BASE_URL, {
        params: {
          start: formatDate(from),
          end: formatDate(now),
          minmag: 1,
          orderby: 'timedesc',
          limit: 100,
        },
        timeout: 10000,
      });

      const events = Array.isArray(res.data) ? res.data : (res.data?.eventList || []);
      let count = 0;
      for (const e of events) {
        const id = `afad-${e.eventID || e.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const event = normalizeAFAD(e);
        if (event) { onEvent(event); count++; }
      }
      reportStatus('AFAD', res.status, count);
    } catch (err) {
      reportStatus('AFAD', err.response?.status || 0);
      console.warn('[AFAD] Poll error:', err.message);
    }
  }

  _poll = poll;
  poll();
  timer = setInterval(() => { if (running) poll(); }, POLL_INTERVAL);
  console.log('[AFAD] ✅ Polling started (15s)');

  return () => {
    running = false;
    clearInterval(timer);
  };
}

function normalizeAFAD(e) {
  const mag = parseFloat(e.magnitude || e.mag || 0);
  const lat = parseFloat(e.latitude || e.lat);
  const lng = parseFloat(e.longitude || e.lon || e.lng);
  if (isNaN(lat) || isNaN(lng)) return null;

  return normalize({
    id: `afad-${e.eventID || e.id}`,
    type: 'earthquake',
    lat, lng,
    magnitude: mag,
    depth: parseFloat(e.depth || 0),
    title: `M${mag} - ${e.location || e.place || 'Türkiye'}`,
    description: `M${mag} ${e.location || ''} | Derinlik: ${e.depth || 0}km`,
    time: e.date || e.time || e.eventDate,
    source: 'AFAD',
    sourceUrl: `https://deprem.afad.gov.tr`,
    extra: {
      depth: e.depth,
      type: e.type,
      rms: e.rms,
    }
  });
}

function formatDate(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
