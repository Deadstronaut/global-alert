/**
 * EMSC - European Mediterranean Seismological Centre
 * WebSocket: wss://www.seismicportal.eu/standing_order/websocket
 * Gerçek zamanlı deprem verisi, Avrupa + Türkiye odaklı
 */

import WebSocket from 'ws';
import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

const WS_URL = 'wss://www.seismicportal.eu/standing_order/websocket';
const PING_INTERVAL = 15000; // 15s

export function connectEMSC(onEvent) {
  let ws = null;
  let pingTimer = null;
  let reconnectTimer = null;
  let alive = true;

  function connect() {
    console.log('[EMSC] Connecting WebSocket...');
    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      console.log('[EMSC] ✅ WebSocket connected');
      reportStatus('EMSC', 200);
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, PING_INTERVAL);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // EMSC sends { action, data } where data is a GeoJSON feature
        if (msg.action === 'create' || msg.action === 'update') {
          const feature = msg.data;
          const event = normalizeEMSC(feature);
          if (event) onEvent(event);
        }
      } catch (err) {
        console.warn('[EMSC] Parse error:', err.message);
      }
    });

    ws.on('pong', () => { /* alive */ });

    ws.on('close', () => {
      console.warn('[EMSC] Disconnected, reconnecting in 5s...');
      reportStatus('EMSC', 0);
      clearInterval(pingTimer);
      if (alive) reconnectTimer = setTimeout(connect, 5000);
    });

    ws.on('error', (err) => {
      console.error('[EMSC] Error:', err.message);
      ws.terminate();
    });
  }

  connect();

  return () => {
    alive = false;
    clearInterval(pingTimer);
    clearTimeout(reconnectTimer);
    ws?.terminate();
  };
}

function normalizeEMSC(feature) {
  if (!feature?.properties || !feature?.geometry) return null;
  const p = feature.properties;
  const [lng, lat, depth] = feature.geometry.coordinates;
  const mag = p.mag || 0;

  return normalize({
    id: `emsc-${p.source_id || feature.id}`,
    type: 'earthquake',
    lat, lng,
    magnitude: mag,
    depth: depth || 0,
    title: `M${mag} - ${p.flynn_region || 'Unknown'}`,
    description: `M${mag} ${p.flynn_region || ''} | Depth: ${depth || 0}km`,
    time: p.time || p.lastupdate || new Date().toISOString(),
    source: 'EMSC',
    sourceUrl: p.source_id
      ? `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${p.source_id}`
      : '',
    extra: { depth, region: p.flynn_region, auth: p.auth }
  });
}
