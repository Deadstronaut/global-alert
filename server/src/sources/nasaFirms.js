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
const POLL_INTERVAL = 15 * 60 * 1000; // 15 dakika

export function startNASAFirms(onEvent, apiKey) {
  if (!apiKey) {
    console.warn('[NASA FIRMS] ⚠️ API key eksik, wildfire verisi devre dışı');
    return () => {};
  }

  // id → ISO timestamp — 6 saatin ötesindekiler otomatik temizlenir
  const seen = new Map();
  let timer = null;
  let running = true;

  function cleanSeen() {
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    for (const [id, ts] of seen) {
      if (ts < cutoff) seen.delete(id);
    }
  }

  async function poll() {
    cleanSeen();
    try {
      // Son 24h, tüm dünya — sadece yüksek/nominal güven seviyesi (low confidence atla)
      const res = await axios.get(`${BASE_URL}/${apiKey}/VIIRS_SNPP_NRT/world/1`, {
        timeout: 90000,        // 90s — büyük CSV için yeterli
        responseType: 'text',
        decompress: true,
      });

      const lines = res.data.split('\n').slice(1); // header'ı atla
      let newCount = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        const cols = line.split(',');
        // latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
        const [lat, lng, , , , acq_date, acq_time, satellite, , confidence, , , frp, daynight] = cols;
        if (!lat || !lng) continue;

        // Düşük güven seviyesini atla (çok fazla false positive)
        if (confidence?.trim().toLowerCase() === 'l') continue;

        const id = `firms-${acq_date}-${acq_time}-${parseFloat(lat).toFixed(3)}-${parseFloat(lng).toFixed(3)}`;
        if (seen.has(id)) continue;
        seen.set(id, Date.now());

        onEvent(normalizeFIRMSCsv({ lat, lng, acq_date, acq_time, satellite, confidence, frp, daynight }, id));
        newCount++;
      }

      reportStatus('NASA FIRMS', res.status);
      if (newCount > 0) console.log(`[NASA FIRMS] ${newCount} yeni yangın noktası`);
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
