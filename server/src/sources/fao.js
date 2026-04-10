/**
 * FAO GIEWS - Global Information and Early Warning System
 * REST: https://www.fao.org/giews/en/
 * ReliefWeb FAO alerts kullanılır + FEWS NET
 * Kapsam: Gıda güvensizliği, kuraklık, açlık riski - GLOBAL
 */

import axios from 'axios';
import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

const POLL_INTERVAL = 60 * 60 * 1000; // 1 saat (veri sık değişmez)

let _poll = null;
export function triggerPollFAO() { return _poll?.(); }

const IPC_SEVERITY = {
  1: 'minimal',   // IPC Phase 1: Minimal
  2: 'low',       // IPC Phase 2: Stressed
  3: 'moderate',  // IPC Phase 3: Crisis
  4: 'high',      // IPC Phase 4: Emergency
  5: 'critical',  // IPC Phase 5: Famine
};

export function startFAO(onEvent) {
  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      const res = await axios.post('https://api.reliefweb.int/v2/reports', {
        filter: { field: 'disaster_type.name', value: ['Food Insecurity'] },
        fields: { include: ['id', 'title', 'date', 'country', 'url'] },
        sort: ['date.created:desc'],
        limit: 50,
      }, { timeout: 15000 });
      const results = res.data?.data || [];

      for (const item of results) {
        const id = `fao-${item.id}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const event = normalizeFAO(item, id);
        if (event) onEvent(event);
      }
      reportStatus('FAO/ReliefWeb', res.status, results.length);
    } catch (err) {
      reportStatus('FAO/ReliefWeb', err.response?.status || 0);
      console.warn('[FAO/FEWSNET] Poll error:', err.message, JSON.stringify(err.response?.data)?.slice(0, 300));
    }
  }

  _poll = poll;
  poll();
  timer = setInterval(() => { if (running) poll(); }, POLL_INTERVAL);
  console.log('[FAO/FEWSNET] ✅ Polling started (1h)');

  return () => {
    running = false;
    clearInterval(timer);
  };
}

function normalizeFAO(item, id) {
  const fields = item.fields || {};
  const countries = fields.country || [];
  const country = countries[0]?.name || '';
  // ReliefWeb country centroid (yaklaşık)
  const lat = parseFloat(countries[0]?.location?.lat || 0);
  const lng = parseFloat(countries[0]?.location?.lon || 0);
  const title = fields.title || 'Food Insecurity Alert';
  const dateStr = fields.date?.created || new Date().toISOString();

  return normalize({
    id,
    type: 'food_security',
    lat, lng,
    magnitude: 3, // default IPC Phase 3 (crisis)
    depth: 0,
    title: `Food Insecurity - ${country}`,
    description: title,
    time: dateStr,
    source: 'ReliefWeb/FAO',
    sourceUrl: `https://reliefweb.int/report/${item.id}`,
    extra: { country, reportTitle: title }
  });
}
