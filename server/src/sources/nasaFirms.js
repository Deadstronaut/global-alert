/**
 * NASA FIRMS - Fire Information for Resource Management System
 * REST: https://firms.modaps.eosdis.nasa.gov/api/area/geojson/
 * Gerçek zamanlı orman yangını tespiti (MODIS + VIIRS uydu)
 * API Key gerekiyor: https://firms.modaps.eosdis.nasa.gov/api/map_key/
 */

import axios from 'axios';
import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

let _poll = null;
export function triggerPollNASAFirms() { return _poll?.(); }

const BASE_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
const GEOJSON_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/geojson';
const POLL_INTERVAL = 10 * 60 * 1000; // 10 dakika

export function startNASAFirms(onEvent, apiKey) {
  if (!apiKey) {
    console.warn('[NASA FIRMS] ⚠️ API key eksik, wildfire verisi devre dışı');
    return () => {};
  }

  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      // CSV endpoint - 'world' keyword bbox'dan daha kararlı çalışır
      const res = await axios.get(`${BASE_URL}/${apiKey}/VIIRS_SNPP_NRT/world/1`, {
        timeout: 30000,
        responseType: 'text',
      });

      const lines = res.data.split('\n').slice(1); // header'ı atla
      for (const line of lines) {
        if (!line.trim()) continue;
        const cols = line.split(',');
        // latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
        const [lat, lng, , , , acq_date, acq_time, satellite, , confidence, , , frp, daynight] = cols;
        if (!lat || !lng) continue;

        const id = `firms-${acq_date}-${acq_time}-${parseFloat(lat).toFixed(3)}-${parseFloat(lng).toFixed(3)}`;
        if (seen.has(id)) continue;
        seen.add(id);

        onEvent(normalizeFIRMSCsv({ lat, lng, acq_date, acq_time, satellite, confidence, frp, daynight }, id));
      }

      reportStatus('NASA FIRMS', res.status);
      if (seen.size > 20000) seen.clear();
    } catch (err) {
      reportStatus('NASA FIRMS', err.response?.status || 0);
      console.warn('[NASA FIRMS] Poll error:', err.message);
    }
  }

  _poll = poll;
  poll();
  timer = setInterval(() => { if (running) poll(); }, POLL_INTERVAL);
  console.log('[NASA FIRMS] ✅ Polling started (10 min)');

  return () => {
    running = false;
    clearInterval(timer);
  };
}

function normalizeFIRMSCsv(p, id) {
  const frp = parseFloat(p.frp || 0);
  const t = String(p.acq_time || '0000').padStart(4, '0');
  const timeStr = `${p.acq_date}T${t.slice(0,2)}:${t.slice(2)}:00Z`;

  return normalize({
    id,
    type: 'wildfire',
    lat: parseFloat(p.lat),
    lng: parseFloat(p.lng),
    magnitude: frp,
    depth: 0,
    title: `Wildfire - ${p.acq_date}`,
    description: `FRP: ${frp}MW | Confidence: ${p.confidence} | Satellite: ${p.satellite}`,
    time: timeStr,
    source: 'NASA FIRMS',
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov',
    extra: { frp, confidence: p.confidence, satellite: p.satellite, dayNight: p.daynight }
  });
}
