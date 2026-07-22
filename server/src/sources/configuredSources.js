/**
 * DB-driven Tier-1 sources — reads data_sources rows carrying a source_type
 * (built-in adapter key, e.g. "afad", "usgs" — see registry.js) and runs the
 * matching adapter, using the row's endpoint_url/poll_interval_seconds/
 * is_active instead of the hardcoded constants baked into each adapter file.
 *
 * Modeled directly on dynamicSources.js's refresh/timer-diff pattern, but
 * dispatches through SOURCE_REGISTRY instead of the generic field_map
 * poller. Rows with source_type IS NULL (admin-added custom/generic
 * sources) are untouched — those stay on dynamicSources.js, unchanged.
 *
 * Health-state sync: Tier-1 adapters call reportStatus() (in-memory
 * healthTracker, same as the static-import path) but were never written to
 * know about data_sources rows directly. Rather than threading a callback
 * into every adapter file, we subscribe to healthTracker's change feed here
 * and translate matching-by-name updates into recordFetchOutcome() calls
 * against the row's current Postgres state — keeping health_state/
 * consecutive_failures/last_success_at accurate without touching adapter
 * internals.
 */

import { getSupabaseClient } from '../output/supabaseWriter.js';
import { onHealthChange } from '../output/healthTracker.js';
import { recordFetchOutcome } from '../processors/sourceHealth.js';
import { SOURCE_REGISTRY } from './registry.js';

const REFRESH_LIST_MS = 60 * 1000; // list-refresh cadence, same tradeoff as dynamicSources.js

// Module-level (not closure-local like `running`) so index.js's /health
// handler can read each active source's actual configured interval without
// a DB round-trip on every healthcheck — see getSourceIntervalMs().
const currentIntervals = new Map(); // source name -> intervalMs (or null for websocket/push sources)

export function getSourceIntervalMs(name) {
  return currentIntervals.get(name) ?? null;
}

export function startConfiguredSources(onEvent) {
  const running = new Map(); // row.id -> { stop, mode, intervalMs, url, name }
  const trackedRowIds = new Map(); // source name -> row.id, for the health-change listener
  const trackedModes = new Map(); // source name -> 'poll' | 'websocket'
  const lastProcessedAt = new Map(); // source name -> last healthTracker `at` we've already synced
  let refreshTimer = null;
  let alive = true;

  async function syncHealth(name, entry) {
    const id = trackedRowIds.get(name);
    if (!id) return;

    // WebSocket sources (EMSC) disconnect/reconnect automatically as routine
    // network behavior — a momentary code=0 blip isn't a "this source is
    // broken" signal the way a REST poll failure is (the in-memory /status
    // panel already shows "WS kapalı" during a blip for operational
    // visibility). Only record successful (re)connects to Postgres, so brief
    // reconnects don't flip health_state to degraded/down.
    if (trackedModes.get(name) === 'websocket' && entry.code !== 200) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: freshRow } = await supabase.from('data_sources').select('*').eq('id', id).maybeSingle();
    if (!freshRow) return; // row deleted since — nothing to update

    const outcome = entry.code === 200 ? 'success' : 'failure';
    await recordFetchOutcome(freshRow, outcome, outcome === 'failure' ? `HTTP ${entry.code}` : undefined);
  }

  onHealthChange((health) => {
    for (const [name] of trackedRowIds) {
      const entry = health[name];
      if (!entry) continue;
      if (lastProcessedAt.get(name) === entry.at) continue; // already synced this update
      lastProcessedAt.set(name, entry.at);
      syncHealth(name, entry).catch((err) => {
        console.warn(`[ConfiguredSources] health sync failed for "${name}":`, err.message);
      });
    }
  });

  async function refresh() {
    const supabase = getSupabaseClient();
    if (!supabase || !alive) return;

    const { data: rows, error } = await supabase
      .from('data_sources')
      .select('*')
      .eq('is_active', true)
      .not('source_type', 'is', null);
    if (error) {
      console.warn('[ConfiguredSources] Failed to list data_sources:', error.message);
      return;
    }

    const active = new Set();
    for (const row of (rows || [])) {
      const adapter = SOURCE_REGISTRY[row.source_type];
      if (!adapter) {
        console.warn(`[ConfiguredSources] Unknown source_type "${row.source_type}" for row "${row.name}", skipping`);
        continue;
      }
      active.add(row.id);
      trackedRowIds.set(row.name, row.id);
      trackedModes.set(row.name, adapter.mode);

      const desiredIntervalMs = Math.max(row.poll_interval_seconds, 5) * 1000;
      const existing = running.get(row.id);

      if (existing && existing.url === row.endpoint_url && existing.intervalMs === desiredIntervalMs) {
        continue; // nothing changed, keep the current run going
      }
      if (existing) {
        existing.stop?.();
        running.delete(row.id);
      }

      // name is only consumed by adapters that need a distinct healthTracker
      // key from their hardcoded default (gdacs_rss/ptwc_rss — see rss.js);
      // other adapters ignore this key harmlessly.
      const stop = adapter.start(onEvent, { url: row.endpoint_url, intervalMs: desiredIntervalMs, name: row.name });
      running.set(row.id, { stop, mode: adapter.mode, intervalMs: desiredIntervalMs, url: row.endpoint_url, name: row.name });
      // websocket sources push on their own schedule, not intervalMs — leave
      // them out of currentIntervals so getSourceIntervalMs() correctly
      // signals "no polling interval applies" rather than a misleading number.
      if (adapter.mode === 'poll') currentIntervals.set(row.name, desiredIntervalMs);
      console.log(
        `[ConfiguredSources] ✅ Started "${row.name}" (${row.source_type}, ${adapter.mode}` +
        `${adapter.mode === 'poll' ? `, every ${row.poll_interval_seconds}s` : ''})`
      );
    }

    // Stop rows that were disabled/deleted/changed type since the last refresh.
    for (const [id, entry] of running) {
      if (!active.has(id)) {
        entry.stop?.();
        running.delete(id);
        trackedRowIds.delete(entry.name);
        trackedModes.delete(entry.name);
        lastProcessedAt.delete(entry.name);
        currentIntervals.delete(entry.name);
        console.log(`[ConfiguredSources] Stopped source ${id} (deactivated/removed/type changed)`);
      }
    }
  }

  refresh();
  refreshTimer = setInterval(refresh, REFRESH_LIST_MS);

  return () => {
    alive = false;
    clearInterval(refreshTimer);
    for (const entry of running.values()) entry.stop?.();
    running.clear();
    trackedRowIds.clear();
    trackedModes.clear();
    lastProcessedAt.clear();
    currentIntervals.clear();
  };
}
