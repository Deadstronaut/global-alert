/**
 * ReliefWeb - OCHA (BM) İnsani Kriz API'si
 * REST: https://api.reliefweb.int/v1/disasters
 * Kapsam: Sel, kuraklık, gıda güvensizliği, insani krizler - GLOBAL
 */

import axios from 'axios';
import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

const POLL_INTERVAL = 15 * 60 * 1000; // 15 dakika

let _poll = null;
export function triggerPollReliefWeb() { return _poll?.(); }

const TYPE_MAP = {
  'Flash Flood': 'flood',
  'Flood': 'flood',
  'Drought': 'drought',
  'Earthquake': 'earthquake',
  'Wildfire': 'wildfire',
  'Tsunami': 'tsunami',
  'Cyclone': 'cyclone',
  'Food Insecurity': 'food_security',
  'Epidemic': 'epidemic',
  'Volcanic Activity': 'volcano',
};

export function startReliefWeb(onEvent) {
  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      const res = await axios.post('https://api.reliefweb.int/v2/reports', {
        filter: {
          field: 'disaster_type.name',
          value: ['Flood', 'Flash Flood', 'Earthquake', 'Cyclone', 'Drought', 'Wild Fire', 'Tsunami', 'Volcanic Activity', 'Epidemic'],
          operator: 'OR',
        },
        fields: { include: ['id', 'title', 'disaster_type', 'date', 'country', 'url'] },
        sort: ['date.created:desc'],
        limit: 100,
      }, { timeout: 15000 });

      const items = res.data?.data || [];
      let count = 0;
      for (const item of items) {
        const id = `reliefweb-${item.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const event = normalizeReliefWeb(item);
        if (event) { onEvent(event); count++; }
      }
      reportStatus('ReliefWeb', res.status, count);
    } catch (err) {
      reportStatus('ReliefWeb', err.response?.status || 0);
      console.warn('[ReliefWeb] Poll error:', err.message, JSON.stringify(err.response?.data)?.slice(0, 300));
    }
  }

  _poll = poll;
  poll();
  timer = setInterval(() => { if (running) poll(); }, POLL_INTERVAL);
  console.log('[ReliefWeb] ✅ Polling started (15 min)');

  return () => {
    running = false;
    clearInterval(timer);
  };
}

function normalizeReliefWeb(item) {
  const f = item.fields || {};
  const rawType = f.disaster_type?.[0]?.name || 'Disaster';
  const type = TYPE_MAP[rawType] || 'disaster';

  const country = f.country?.[0];
  const lat = country?.location?.lat || 0;
  const lng = country?.location?.lon || 0;

  return normalize({
    id: `reliefweb-${item.id}`,
    type,
    lat, lng,
    magnitude: 0,
    depth: 0,
    title: f.title || `${rawType} Alert`,
    description: `${rawType} | ${country?.name || 'Unknown'}`,
    time: f.date?.created || new Date().toISOString(),
    source: 'ReliefWeb',
    sourceUrl: f.url || `https://reliefweb.int/report/${item.id}`,
    extra: { country: country?.name, disasterType: rawType }
  });
}
