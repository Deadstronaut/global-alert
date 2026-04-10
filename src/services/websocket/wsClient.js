/**
 * GEWS WebSocket Client
 * Aggregator'a bağlanır, gelen mesajları Pinia store'a iletir
 *
 * Mesaj tipleri (server → client):
 *   { type: 'event',          data: DisasterEvent }
 *   { type: 'early_warning',  data: EarlyWarning  }
 *   { type: 'batch',          data: DisasterEvent[], source }
 *   { type: 'sources_status', data: { [source]: boolean } }
 *   { type: 'ping' }
 */

import { createDisasterEvent } from '@/services/adapters/DisasterEvent.js';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8765';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

class GEWSWebSocketClient {
  constructor() {
    this.ws = null;
    this.handlers = new Map(); // type → callback[]
    this.connected = false;
    this.reconnectDelay = RECONNECT_DELAY_MS;
    this.reconnectTimer = null;
    this.alive = false;
    this.pingTimer = null;
  }

  /**
   * Aggregator'a bağlan
   */
  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.alive = true;

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (err) {
      console.warn('[WSClient] Could not create WebSocket:', err.message);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = RECONNECT_DELAY_MS;
      console.log('[WSClient] ✅ Connected to GEWS Aggregator');
      this._emit('connected');

      // Keepalive ping
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this._handleMessage(msg);
      } catch (err) {
        console.warn('[WSClient] Parse error:', err.message);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      console.warn('[WSClient] Disconnected');
      this._emit('disconnected');
      if (this.alive) this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose sonra çağrılacak
    };
  }

  /**
   * Bağlantıyı kapat
   */
  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect() {
    this.alive = false;
    clearInterval(this.pingTimer);
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Mesaj tipine handler kaydet
   * @param {'event'|'early_warning'|'batch'|'sources_status'|'connected'|'disconnected'} type
   * @param {Function} callback
   */
  on(type, callback) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(callback);
  }

  off(type, callback) {
    const list = this.handlers.get(type) || [];
    this.handlers.set(type, list.filter(cb => cb !== callback));
  }

  // ─────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────
  _handleMessage(msg) {
    switch (msg.type) {
      case 'event': {
        const event = createDisasterEvent(msg.data);
        this._emit('event', event);
        break;
      }
      case 'batch': {
        const events = (msg.data || []).map(d => createDisasterEvent(d));
        this._emit('batch', events, msg.source);
        break;
      }
      case 'early_warning': {
        this._emit('early_warning', msg.data);
        break;
      }
      case 'sources_status': {
        this._emit('sources_status', msg.data);
        break;
      }
      case 'pong':
      case 'ping':
        break;
      default:
        console.warn('[WSClient] Unknown message type:', msg.type);
    }
  }

  _emit(type, ...args) {
    const list = this.handlers.get(type) || [];
    for (const cb of list) {
      try { cb(...args); } catch (err) { console.error('[WSClient] Handler error:', err); }
    }
  }

  _scheduleReconnect() {
    console.log(`[WSClient] Reconnecting in ${this.reconnectDelay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, MAX_RECONNECT_DELAY_MS);
  }
}

// Singleton - uygulama genelinde tek instance
export const wsClient = new GEWSWebSocketClient();
