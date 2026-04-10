/**
 * WebSocket Server - Tüm bağlı Vue client'larına gerçek zamanlı veri yayını
 * Port: 8765 (env ile değiştirilebilir)
 *
 * Mesaj tipleri (server → client):
 *   { type: 'event',         data: DisasterEvent }
 *   { type: 'early_warning', data: EarlyWarning  }
 *   { type: 'batch',         data: DisasterEvent[], source: string }
 *   { type: 'ping'                                               }
 *   { type: 'sources_status', data: { [source]: boolean }       }
 */

import {WebSocketServer} from 'ws';
import {sourceHealth} from './healthTracker.js';

// VITE_WS_URL=ws://localhost:8765 → port'u parse et, yoksa WS_PORT
const _wsUrl = process.env.VITE_WS_URL || '';
const PORT = parseInt(process.env.WS_PORT || _wsUrl.split(':').pop() || '8765');

export class GEWSWebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.sourcesStatus = {};
    this.onRefresh = null;
    this.onClientConnected = null;
  }

  start() {
    this.wss = new WebSocketServer({port: PORT});
    console.log(`[WSServer] ✅ WebSocket server listening on ws://localhost:${PORT}`);

    this.wss.on('connection', (ws, req) => {
      const ip = req.socket.remoteAddress;
      this.clients.add(ws);
      console.log(`[WSServer] Client connected (${ip}) — total: ${this.clients.size}`);

      // Kaynak sağlığını yeni bağlanan client'a gönder
      this.send(ws, {type: 'sources_status', data: sourceHealth});

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ping') this.send(ws, {type: 'pong'});
          if (msg.type === 'refresh') {
            this.onRefresh?.();
            this.send(ws, {type: 'refresh_ack'});
          }
        } catch { /* ignore */}
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[WSServer] Client disconnected — total: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        console.warn('[WSServer] Client error:', err.message);
        this.clients.delete(ws);
      });
    });

    // Keepalive ping
    setInterval(() => {
      this.broadcast({type: 'ping'});
    }, 30000);
  }

  /**
   * Tek bir disaster event yayınla
   */
  broadcastEvent(event) {
    this.broadcast({type: 'event', data: event});
  }

  /**
   * Erken uyarı yayınla
   */
  broadcastEarlyWarning(warning) {
    this.broadcast({type: 'early_warning', data: warning});
    console.log(`[WSServer] 🚨 Early warning broadcast: ${warning.earthquake.magnitude}M → ${warning.affectedCities.length} cities`);
  }

  /**
   * İlk yükleme için toplu veri gönder
   */
  broadcastBatch(events, source = 'init') {
    if (events.length === 0) return;
    this.broadcast({type: 'batch', data: events, source});
  }

  /**
   * Kaynak durumunu güncelle ve broadcast et
   */
  updateSourceStatus(source, online) {
    this.sourcesStatus[source] = online;
    this.broadcast({type: 'sources_status', data: this.sourcesStatus});
  }

  /**
   * Tüm bağlı client'lara mesaj gönder
   */
  broadcast(msg) {
    const json = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(json, (err) => {if (err) this.clients.delete(ws);});
      }
    }
  }

  /**
   * Tek bir client'a mesaj gönder
   */
  send(ws, msg) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  get clientCount() {
    return this.clients.size;
  }
}
