/**
 * FEWS NET - Famine Early Warning Systems Network (USAID)
 * API: https://fdw.fews.net/api/ipcphase/
 * Kapsam: Gıda güvensizliği, IPC fazları - GLOBAL (Afrika, Orta Doğu, Asya)
 * Kayıt gerektirmez, açık API
 */

import axios from 'axios';
import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

const API_URL = 'https://fdw.fews.net/api/ipcphase/';
const POLL_INTERVAL = 6 * 60 * 60 * 1000; // 6 saat (veri günlük güncellenir)

let _poll = null;
export function triggerPollFEWSNET() { return _poll?.(); }

// FEWS NET country → koordinat merkezi
const COUNTRY_CENTROIDS = {
  'AF': [33.93, 67.71], 'AO': [-11.20, 17.87], 'BI': [-3.37, 29.92],
  'BF': [12.36, -1.56], 'CF': [6.61, 20.94], 'TD': [15.45, 18.73],
  'CD': [-4.04, 21.76], 'CG': [-0.23, 15.83], 'DJ': [11.83, 42.59],
  'ER': [15.18, 39.78], 'ET': [9.14, 40.49], 'GM': [13.44, -15.31],
  'GN': [9.95, -11.32], 'GW': [11.80, -15.18], 'HT': [18.97, -72.29],
  'IQ': [33.22, 43.68], 'KE': [-0.02, 37.91], 'LR': [6.43, -9.43],
  'LY': [26.34, 17.23], 'MG': [-18.77, 46.87], 'ML': [17.57, -3.99],
  'MR': [21.01, -10.94], 'MW': [-13.25, 34.30], 'MZ': [-18.67, 35.53],
  'NE': [17.61, 8.08], 'NG': [9.08, 8.68], 'PK': [30.38, 69.35],
  'RW': [-1.94, 29.87], 'SD': [12.86, 30.22], 'SL': [8.46, -11.78],
  'SO': [5.15, 46.20], 'SS': [6.88, 31.31], 'SY': [34.80, 38.99],
  'TZ': [-6.37, 34.89], 'UG': [1.37, 32.29], 'YE': [15.55, 48.52],
  'ZM': [-13.13, 27.85], 'ZW': [-19.02, 29.15],
};

export function startFEWSNET(onEvent) {
  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      const res = await axios.get(API_URL, {
        params: {
          fields: 'simple',
          scenario: 'CS',
        },
        timeout: 20000,
        headers: { 'User-Agent': 'GlobalAlert/1.0' },
      });

      const results = Array.isArray(res.data?.results)
        ? res.data.results
        : Array.isArray(res.data?.value)
          ? res.data.value
          : Array.isArray(res.data)
            ? res.data
            : [];
      let count = 0;

      for (const pkg of results) {
        const id = `fewsnet-${pkg.id || pkg.ipc_period}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const event = normalizeFEWSNET(pkg, id);
        if (event) { onEvent(event); count++; }
      }
      reportStatus('FEWS NET', res.status, count);
    } catch (err) {
      reportStatus('FEWS NET', err.response?.status || 0);
      console.warn('[FEWS NET] Poll error:', err.message);
    }
  }

  _poll = poll;
  poll();
  timer = setInterval(() => { if (running) poll(); }, POLL_INTERVAL);
  console.log('[FEWS NET] ✅ Polling started (6h)');

  return () => {
    running = false;
    clearInterval(timer);
  };
}

function normalizeFEWSNET(pkg, id) {
  const country = pkg.country_code || pkg.country || '';
  const coords = COUNTRY_CENTROIDS[country] || [0, 0];
  const ipcPhase = Number(pkg.phase || pkg.max_ipc_phase || pkg.overall_phase || 2);
  const period = pkg.start_date || pkg.date || pkg.ipc_period || pkg.created || new Date().toISOString();
  const countryName = pkg.country || pkg.country_name || country;

  return normalize({
    id,
    type: 'food_security',
    lat: coords[0],
    lng: coords[1],
    magnitude: ipcPhase,
    depth: 0,
    title: `Food Insecurity IPC Phase ${ipcPhase} - ${countryName}`,
    description: `IPC Phase ${ipcPhase} | ${countryName} | Period: ${period}`,
    time: pkg.created || new Date().toISOString(),
    source: 'FEWS NET',
    sourceUrl: `https://fews.net/country/${country}`,
    extra: { country: countryName, ipcPhase, period },
  });
}
