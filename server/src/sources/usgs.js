/**
 * USGS - United States Geological Survey
 * REST Polling: all_hour.geojson (son 1 saat) + all_day.geojson
 * Global kapsam, güvenilir
 */

import axios from 'axios';
import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

let _poll = null;
export function triggerPollUSGS() { return _poll?.(); }

const ENDPOINTS = {
  hour: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
  day:  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
};

const POLL_INTERVAL = 15 * 1000; // 15 saniye

export function startUSGS(onEvent) {
  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      const res = await axios.get(ENDPOINTS.hour, { timeout: 10000 });
      const features = res.data?.features || [];
      let count = 0;
      for (const f of features) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        const event = normalizeUSGS(f);
        if (event) { onEvent(event); count++; }
      }
      reportStatus('USGS', res.status, count);
      if (seen.size > 5000) seen.clear();
    } catch (err) {
      reportStatus('USGS', err.response?.status || 0);
      console.warn('[USGS] Poll error:', err.message);
    }
  }

  async function pollDay() {
    try {
      const res = await axios.get(ENDPOINTS.day, { timeout: 15000 });
      const features = res.data?.features || [];
      for (const f of features) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        const event = normalizeUSGS(f);
        if (event) onEvent(event);
      }
    } catch (err) {
      console.warn('[USGS] Day poll error:', err.message);
    }
  }

  _poll = poll;

  // İlk yükleme: günlük veri
  pollDay();

  // Sonrası: saatlik polling
  timer = setInterval(() => { if (running) poll(); }, POLL_INTERVAL);
  console.log('[USGS] ✅ Polling started (15s)');

  return () => {
    running = false;
    clearInterval(timer);
  };
}

function normalizeUSGS(feature) {
  if (!feature?.properties) return null;
  const p = feature.properties;
  const [lng, lat, depth] = feature.geometry.coordinates;
  const mag = p.mag || 0;

  return normalize({
    id: `usgs-${feature.id}`,
    type: 'earthquake',
    lat, lng,
    magnitude: mag,
    depth: depth || 0,
    title: p.title || `M${mag} - ${p.place || 'Unknown'}`,
    description: `M${mag} - ${p.place || 'Unknown'} | Depth: ${depth || 0}km`,
    time: p.time,
    source: 'USGS',
    sourceUrl: p.url || '',
    extra: {
      depth,
      felt: p.felt,
      tsunami: p.tsunami,
      alert: p.alert,
      status: p.status,
    }
  });
}
