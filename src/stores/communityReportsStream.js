/**
 * Live SSE notification stream for community reports (spec 036 remaining
 * item — "canlı SSE bildirim akışı"). Connects to the
 * community-reports-stream Edge Function via a raw fetch() + ReadableStream
 * reader (native EventSource can't attach an Authorization header, and this
 * endpoint relies on the caller's own JWT so existing community_reports RLS
 * applies unchanged) and parses incoming events with the pure
 * parseSseBuffer() (src/utils/sseParser.js). The Edge Function closes each
 * connection after ~5 minutes by design (MAX_STREAM_MS) — reconnect() is
 * called automatically when the stream ends, so this is invisible to the
 * caller.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '@/services/api/config.js';
import { parseSseBuffer } from '@/utils/sseParser.js';

const RECONNECT_DELAY_MS = 3000;

export const useCommunityReportsStreamStore = defineStore('communityReportsStream', () => {
  const connected = ref(false);
  const lastEvent = ref(null);
  const error = ref(null);

  let abortController = null;
  let reconnectTimer = null;
  let onEventCallback = null;

  async function connect(onEvent) {
    onEventCallback = onEvent ?? null;
    await runConnection();
  }

  async function runConnection() {
    disconnect({ keepCallback: true });

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      error.value = 'Not authenticated';
      return;
    }

    abortController = new AbortController();
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/community-reports-stream`, {
        headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) {
        error.value = `Stream connection failed (${response.status})`;
        scheduleReconnect();
        return;
      }

      connected.value = true;
      error.value = null;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSseBuffer(buffer);
        buffer = remainder;
        for (const event of events) {
          lastEvent.value = event;
          if (onEventCallback) onEventCallback(event);
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') error.value = err?.message ?? 'Stream error';
    } finally {
      connected.value = false;
      if (!abortController?.signal.aborted) scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      runConnection();
    }, RECONNECT_DELAY_MS);
  }

  function disconnect({ keepCallback = false } = {}) {
    if (abortController) abortController.abort();
    abortController = null;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    connected.value = false;
    if (!keepCallback) onEventCallback = null;
  }

  return { connected, lastEvent, error, connect, disconnect };
});
