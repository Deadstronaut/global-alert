/**
 * GEWS Aggregator — Docker Container #1
 * ──────────────────────────────────────
 * Tüm kaynaklardan veri çeker → deduplicate eder → Supabase DB'ye yazar.
 * Frontend ile DOĞRUDAN iletişim YOK — frontend Supabase Realtime üzerinden okur.
 *
 * Başlatmak için:
 *   cd server && npm install && npm start
 *   veya: node --watch src/index.js  (geliştirme)
 */

import 'dotenv/config';
import http from 'http';

// ── Kaynaklar ────────────────────────────────────────────────────────────────
import { connectEMSC }     from './sources/emsc.js';
import { startUSGS }       from './sources/usgs.js';
import { startAFAD }       from './sources/afad.js';
import { startKandilli }   from './sources/kandilli.js';
import { startGEOFON }     from './sources/geofon.js';
import { startGDACS }      from './sources/gdacs.js';
import { startNASAFirms }  from './sources/nasaFirms.js';
import { startPTWC }       from './sources/ptwc.js';
import { startWHO }        from './sources/who.js';
import { startFEWSNET }    from './sources/fewsnet.js';
import { startGDACSRSS, startPTWCRSS } from './sources/rss.js';
import { startIoTSource }  from './sources/iot.js';

// ── İşlemciler ───────────────────────────────────────────────────────────────
import { Deduplicator }        from './processors/deduplicator.js';
import { calculateEarlyWarning } from './processors/pwave.js';
import { runPreflight }          from './processors/preflight.js';

// ── Çıktı ────────────────────────────────────────────────────────────────────
import { initSupabase, queueWrite, writeEarlyWarning } from './output/supabaseWriter.js';
import { sourceHealth } from './output/healthTracker.js';

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
const deduplicator = new Deduplicator();
const dbReady = initSupabase();

// Preflight: tüm kaynak URL'lerini başlamadan önce kontrol et
await runPreflight();

// ─────────────────────────────────────────────────────────────────────────────
// Ana olay işleyicisi — tüm kaynaklar buraya gelir
// ─────────────────────────────────────────────────────────────────────────────
function handleEvent(event) {
  if (deduplicator.isDuplicate(event)) return;
  deduplicator.add(event);

  // DB yazma kuyruğu (Supabase upsert)
  queueWrite(event);

  // Deprem erken uyarısı (M4.0+)
  if (event.type === 'earthquake' && (event.magnitude ?? 0) >= 4.0) {
    const warning = calculateEarlyWarning(event);
    if (warning && warning.affectedCities.length > 0) {
      writeEarlyWarning(warning);
      console.log(
        `[P-Wave] 🚨 M${event.magnitude} @ ${event.source} → ` +
        `${warning.affectedCities[0].city} (${warning.affectedCities[0].distanceKm}km, ` +
        `${Math.round(warning.affectedCities[0].warningTimeMs / 1000)}s kaldı)`
      );
    }
  }

  console.log(
    `[+] ${event.source.padEnd(12)} ${event.type.padEnd(14)} ` +
    `M${event.magnitude ?? '-'} ${event.title.slice(0, 60)}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Kaynak başlatma
// ─────────────────────────────────────────────────────────────────────────────
const stoppers = [];

// 🌍 Sismik — WebSocket (gerçek zamanlı)
stoppers.push(connectEMSC(handleEvent));

// 🌍 Sismik — REST polling
stoppers.push(startUSGS(handleEvent));
stoppers.push(startAFAD(handleEvent));
stoppers.push(startKandilli(handleEvent));
stoppers.push(startGEOFON(handleEvent));

// 🌊 Çoklu afet — REST polling
stoppers.push(startGDACS(handleEvent));
stoppers.push(startPTWC(handleEvent));

// 🌊 Tsunami — RSS (PTWC yedek)
stoppers.push(startPTWCRSS(handleEvent));

// 🌋 GDACS — RSS (CC + EQ + FL + VO + TC + DR)
stoppers.push(startGDACSRSS(handleEvent));

// 🔥 Yangın — NASA FIRMS (API key gerekli)
if (process.env.NASA_FIRMS_KEY) {
  stoppers.push(startNASAFirms(handleEvent, process.env.NASA_FIRMS_KEY));
} else {
  console.warn('[GEWS] NASA_FIRMS_KEY eksik, wildfire kaynağı devre dışı');
}

// 🌾 Gıda güvensizliği — FEWS NET
stoppers.push(startFEWSNET(handleEvent));

// 🦠 Salgın — WHO
stoppers.push(startWHO(handleEvent));

// 📡 Ek IoT kaynakları (opsiyonel — .env ile aktif)
// Örnek: SENSOR_URL tanımlıysa OGC SensorThings endpoint'i dinle
if (process.env.SENSOR_URL) {
  stoppers.push(startIoTSource(handleEvent, {
    name:      process.env.SENSOR_NAME || 'Custom Sensor',
    url:       process.env.SENSOR_URL,
    type:      process.env.SENSOR_TYPE || 'earthquake',
    intervalMs: parseInt(process.env.SENSOR_INTERVAL_MS || '60000'),
    headers:   process.env.SENSOR_KEY ? { 'X-API-Key': process.env.SENSOR_KEY } : {},
    apiFormat: process.env.SENSOR_FORMAT || 'array',
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Health / Status endpoint (Dockerfile HEALTHCHECK & ops monitoring)
// ─────────────────────────────────────────────────────────────────────────────
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8765');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const httpServer = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  if (req.method !== 'GET') {
    res.writeHead(405, CORS_HEADERS);
    return res.end();
  }

  if (req.url === '/health') {
    res.writeHead(200, CORS_HEADERS);
    return res.end(JSON.stringify({ status: 'ok', db: dbReady }));
  }

  if (req.url === '/status') {
    res.writeHead(200, CORS_HEADERS);
    return res.end(JSON.stringify({
      status:    'ok',
      db:        dbReady,
      storeSize: deduplicator.store.size,
      sources:   sourceHealth,
      uptime:    Math.floor(process.uptime()),
    }));
  }

  res.writeHead(404, CORS_HEADERS);
  res.end();
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`[HTTP] ✅ Health endpoint: http://localhost:${HTTP_PORT}/health`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Stats log (her 5 dakikada bir)
// ─────────────────────────────────────────────────────────────────────────────
setInterval(() => {
  const online = Object.values(sourceHealth).filter(Boolean).length;
  const total  = Object.keys(sourceHealth).length;
  console.log(`[Stats] Sources: ${online}/${total} online | Store: ${deduplicator.store.size} events`);
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────
function shutdown() {
  console.log('\n[GEWS] Shutting down...');
  stoppers.forEach(stop => stop?.());
  httpServer.close();
  process.exit(0);
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║  GEWS Aggregator — DB-only mode          ║');
console.log('║  Sources: EMSC·USGS·AFAD·Kandilli        ║');
console.log('║           GEOFON·GDACS·PTWC·NASA         ║');
console.log('║           WHO·FEWSNET·RSS·IoT            ║');
console.log('║  Output:  Supabase DB (no WS clients)    ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');
