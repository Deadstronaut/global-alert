/**
 * GDACS - Global Disaster Alerting Coordination System (UN)
 * REST: https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH
 * Kapsam: Sel, kasırga, volkan, tsunami, kuraklık - GLOBAL
 */

import axios from 'axios';
import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

let _poll = null;
export function triggerPollGDACS() { return _poll?.(); }

const API_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';
const POLL_INTERVAL = 5 * 60 * 1000; // 5 dakika

// GDACS event type → bizim type'ımız
const TYPE_MAP = {
  EQ: 'earthquake',
  FL: 'flood',
  TC: 'cyclone',
  VO: 'volcano',
  DR: 'drought',
  WF: 'wildfire',
  TS: 'tsunami',
};

export function startGDACS(onEvent) {
  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      const res = await axios.get(API_URL, {
        params: {
          alertlevel: 'Green,Orange,Red',
          eventlist: 'EQ,FL,TC,VO,DR,WF,TS',
          fromdate: formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
          todate: formatDate(new Date()),
          limit: 500,
        },
        headers: { Accept: 'application/json' },
        timeout: 15000,
      });

      const features = res.data?.features || res.data?.Features || [];
      let count = 0;
      for (const f of features) {
        const id = `gdacs-${f.properties?.eventid || f.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const event = normalizeGDACS(f);
        if (event) { onEvent(event); count++; }
      }
      reportStatus('GDACS', res.status, count);
    } catch (err) {
      reportStatus('GDACS', err.response?.status || 0);
      console.warn('[GDACS] Poll error:', err.message);
    }
  }

  _poll = poll;
  poll();
  timer = setInterval(() => { if (running) poll(); }, POLL_INTERVAL);
  console.log('[GDACS] ✅ Polling started (5 min)');

  return () => {
    running = false;
    clearInterval(timer);
  };
}

function normalizeGDACS(feature) {
  const p = feature.properties;
  if (!p) return null;

  const coords = feature.geometry?.coordinates || feature.geometry?.Coordinates || [0, 0];
  const [lng, lat] = Array.isArray(coords[0]) ? coords[0] : coords;

  const rawType = p.eventtype || p.EventType || 'EQ';
  const type = TYPE_MAP[rawType] || 'disaster';
  const alert = (p.alertlevel || p.AlertLevel || 'Green').toLowerCase();

  return normalize({
    id: `gdacs-${p.eventid || p.EventID}`,
    type,
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    magnitude: parseFloat(p.severitydata?.severity || p.Severity || 0),
    depth: 0,
    title: p.eventname || p.EventName || `GDACS ${rawType} Alert`,
    description: p.description || p.Description || '',
    time: p.fromdate || p.FromDate || new Date().toISOString(),
    source: 'GDACS',
    sourceUrl: p.url?.details || `https://www.gdacs.org`,
    extra: {
      alertLevel: alert,
      affectedCountries: p.affectedcountries,
      casualties: p.severitydata?.severitytext,
      eventType: rawType,
    }
  });
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}
