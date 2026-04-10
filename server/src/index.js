/**
 * GEWS Aggregator - Global Early Warning System
 * Tüm kaynakları bağlar, normalize eder, WebSocket ile yayınlar
 *
 * Başlatmak için:
 *   cd server && npm install && npm start
 *   veya: node --watch src/index.js (geliştirme)
 */

import 'dotenv/config';

import {connectEMSC} from './sources/emsc.js';
import {startUSGS} from './sources/usgs.js';
import {startAFAD} from './sources/afad.js';
import {startKandilli} from './sources/kandilli.js';
import {startGEOFON} from './sources/geofon.js';
import {startGDACS} from './sources/gdacs.js';
import {startNASAFirms} from './sources/nasaFirms.js';
import {startPTWC} from './sources/ptwc.js';
import {startWHO} from './sources/who.js';
import {startFEWSNET} from './sources/fewsnet.js';

import {triggerPollUSGS} from './sources/usgs.js';
import {triggerPollAFAD} from './sources/afad.js';
import {triggerPollKandilli} from './sources/kandilli.js';
import {triggerPollGEOFON} from './sources/geofon.js';
import {triggerPollGDACS} from './sources/gdacs.js';
import {triggerPollPTWC} from './sources/ptwc.js';
import {triggerPollNASAFirms} from './sources/nasaFirms.js';
import {triggerPollWHO} from './sources/who.js';
import {triggerPollFEWSNET} from './sources/fewsnet.js';

import {Deduplicator} from './processors/deduplicator.js';
import {calculateEarlyWarning} from './processors/pwave.js';

import {GEWSWebSocketServer} from './output/wsServer.js';
import {initSupabase, queueWrite, writeEarlyWarning} from './output/supabaseWriter.js';
import {onHealthChange} from './output/healthTracker.js';

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
const wsServer = new GEWSWebSocketServer();
wsServer.start();

// Yeni bağlanan istemcilere bellekteki tüm güncel olayları topluca gönder
wsServer.onClientConnected = (ws) => {
  if (typeof deduplicator !== 'undefined' && deduplicator.store) {
    const events = Array.from(deduplicator.store.values());
    wsServer.send(ws, {type: 'batch', data: events, source: 'init'});
  }
};

// Kaynak sağlığı değişince broadcast et
onHealthChange((health) => {
  wsServer.broadcast({type: 'sources_status', data: health});
});

const deduplicator = new Deduplicator();
initSupabase();

// ─────────────────────────────────────────────
// Ana olay işleyicisi - tüm kaynaklar buraya gelir
// ─────────────────────────────────────────────
function handleEvent(event) {
  // Duplicate kontrolü
  if (deduplicator.isDuplicate(event)) return;
  deduplicator.add(event);

  // WebSocket yayını
  wsServer.broadcastEvent(event);

  // DB yazma kuyruğu
  queueWrite(event);

  // Deprem erken uyarısı
  if (event.type === 'earthquake' && (event.magnitude || 0) >= 4.0) {
    const warning = calculateEarlyWarning(event);
    if (warning && warning.affectedCities.length > 0) {
      wsServer.broadcastEarlyWarning(warning);
      writeEarlyWarning(warning);

      console.log(
        `[P-Wave] 🚨 M${event.magnitude} @ ${event.source} → ` +
        `${warning.affectedCities[0].city} (${warning.affectedCities[0].distanceKm}km, ` +
        `${Math.round(warning.affectedCities[0].warningTimeMs / 1000)}s kaldı)`
      );
    }
  }

  console.log(`[+] ${event.source.padEnd(12)} ${event.type.padEnd(14)} M${event.magnitude ?? '-'} ${event.title.slice(0, 60)}`);
}

// ─────────────────────────────────────────────
// Kaynak başlatma
// ─────────────────────────────────────────────
const stoppers = [];

// 🌍 Sismik - WebSocket
stoppers.push(connectEMSC(handleEvent));

// 🌍 Sismik - REST polling
stoppers.push(startUSGS(handleEvent));
stoppers.push(startAFAD(handleEvent));
stoppers.push(startKandilli(handleEvent));
stoppers.push(startGEOFON(handleEvent));

// 🌊 Çoklu afet - REST polling
stoppers.push(startGDACS(handleEvent));
stoppers.push(startPTWC(handleEvent));
// ReliefWeb devre dışı - kayıt sistemi kapalı (403)

// 🔥 Yangın - API key gerekli
stoppers.push(startNASAFirms(handleEvent, process.env.NASA_FIRMS_KEY || process.env.VITE_NASA_FIRMS_KEY));

// 🌾 Gıda güvensizliği - FEWS NET aktif, FAO devre dışı (ReliefWeb 403)
stoppers.push(startFEWSNET(handleEvent));

// 🦠 Salgın hastalıklar
stoppers.push(startWHO(handleEvent));

// ─────────────────────────────────────────────
// Refresh all sources (manual trigger)
// ─────────────────────────────────────────────
function pollAll() {
  console.log('[GEWS] 🔄 Manual refresh triggered');
  triggerPollUSGS?.();
  triggerPollAFAD?.();
  triggerPollKandilli?.();
  triggerPollGEOFON?.();
  triggerPollGDACS?.();
  triggerPollReliefWeb?.();
  triggerPollPTWC?.();
  triggerPollNASAFirms?.();
  triggerPollWHO?.();
  triggerPollFEWSNET?.();
}

wsServer.onRefresh = pollAll;

// ─────────────────────────────────────────────
// Stats log (her 5 dakikada bir)
// ─────────────────────────────────────────────
setInterval(() => {
  console.log(`[Stats] Clients: ${wsServer.clientCount} | Store: ${deduplicator.store.size} events`);
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n[GEWS] Shutting down...');
  stoppers.forEach(stop => stop?.());
  process.exit(0);
});

process.on('SIGTERM', () => {
  stoppers.forEach(stop => stop?.());
  process.exit(0);
});

console.log('');
console.log('╔══════════════════════════════════════╗');
console.log('║  GEWS Aggregator - Starting up...    ║');
console.log('║  Sources: EMSC·USGS·AFAD·Kandilli   ║');
console.log('║           GEOFON·GDACS·NASA·PTWC    ║');
console.log('║           GDACS·NASA·PTWC·WHO       ║');
console.log('║           FAO·FEWSNET               ║');
console.log('╚══════════════════════════════════════╝');
console.log('');
