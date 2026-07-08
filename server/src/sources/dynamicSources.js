/**
 * Dynamic / custom sources — reads country-admin-provisioned entries from the
 * data_sources table (rows carrying an endpoint_config.field_map, added via
 * the Admin panel's "Kaynak Ekle" → özel kaynak eşleştirme form) and polls
 * each one at its own poll_interval_seconds, with ZERO code changes needed to
 * add a new one. Tier-1 hardcoded sources (usgs.js, emsc.js, ...) never set
 * field_map, so this module only ever touches admin-added custom sources.
 */

import { normalize } from '../processors/normalizer.js';
import { recordFetchOutcome, logRejectedPayload } from '../processors/sourceHealth.js';
import { getSupabaseClient } from '../output/supabaseWriter.js';
import { reportStatus } from '../output/healthTracker.js';
import { FORMAT_HANDLERS, resolveFormat } from './formatHandlers/index.js';

const REFRESH_LIST_MS = 60 * 1000; // how often we re-check data_sources for added/removed/edited custom sources

function isGenericSource(row) {
  const fm = row.endpoint_config?.field_map;
  return !!fm && !!fm.id && !!fm.lat && !!fm.lng && !!fm.time;
}

function validate(raw) {
  if (raw == null || typeof raw !== 'object') return { valid: false, reason: 'record is not an object' };
  if (raw.id == null || String(raw.id).trim() === '') return { valid: false, reason: 'missing required field: id' };
  const lat = Number(raw.lat);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { valid: false, reason: `invalid lat: ${raw.lat}` };
  const lng = Number(raw.lng);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { valid: false, reason: `invalid lng: ${raw.lng}` };
  if (raw.time == null || Number.isNaN(new Date(raw.time).getTime())) {
    return { valid: false, reason: `unresolvable timestamp: ${raw.time}` };
  }
  return { valid: true };
}

async function pollOne(row, onEvent) {
  const { field_map } = row.endpoint_config;
  const format = resolveFormat(row);
  const handler = FORMAT_HANDLERS[format];
  if (!handler) {
    console.warn(`[Dynamic:${row.name}] Unknown format "${format}", skipping`);
    return;
  }

  try {
    const { records, status } = await handler.fetch(row);

    let count = 0;
    for (const rec of records) {
      const raw = handler.map(rec, field_map);
      const check = validate(raw);
      if (!check.valid) {
        await logRejectedPayload(row.id, row.hazard_type, check.reason, rec);
        continue;
      }
      onEvent(normalize({
        id: `${row.name}-${raw.id}`,
        type: row.hazard_type,
        lat: Number(raw.lat),
        lng: Number(raw.lng),
        magnitude: raw.magnitude != null ? Number(raw.magnitude) : null,
        depth: raw.depth != null ? Number(raw.depth) : null,
        title: raw.title != null ? String(raw.title) : `${row.name} #${raw.id}`,
        description: raw.description != null ? String(raw.description) : '',
        time: raw.time,
        source: row.name,
        sourceUrl: row.endpoint_url,
      }));
      count++;
    }
    reportStatus(row.name, status, count);
    await recordFetchOutcome(row, 'success');
  } catch (err) {
    reportStatus(row.name, err.response?.status || 0);
    await recordFetchOutcome(row, 'failure', err.message);
    console.warn(`[Dynamic:${row.name}] Poll error:`, err.message);
  }
}

/**
 * Starts polling every currently-active custom source, and re-scans
 * data_sources periodically so newly added/edited/removed sources are picked
 * up without restarting the Aggregator process.
 */
export function startDynamicSources(onEvent) {
  const timers = new Map(); // source id -> interval handle
  let refreshTimer = null;
  let running = true;

  async function refresh() {
    const supabase = getSupabaseClient();
    if (!supabase || !running) return;

    const { data: rows, error } = await supabase
      .from('data_sources')
      .select('*')
      .eq('is_active', true);
    if (error) {
      console.warn('[Dynamic] Failed to list data_sources:', error.message);
      return;
    }

    const active = new Set();
    for (const row of (rows || [])) {
      if (!isGenericSource(row)) continue;
      active.add(row.id);
      if (timers.has(row.id)) continue; // already polling this one

      const intervalMs = Math.max(row.poll_interval_seconds, 5) * 1000;
      pollOne(row, onEvent); // fire immediately, then on interval
      const handle = setInterval(async () => {
        // Re-fetch the row each tick so config edits (mapping, url, interval-on-next-refresh) apply live.
        const { data: fresh } = await supabase.from('data_sources').select('*').eq('id', row.id).maybeSingle();
        if (fresh && fresh.is_active && isGenericSource(fresh)) await pollOne(fresh, onEvent);
      }, intervalMs);
      timers.set(row.id, handle);
      console.log(`[Dynamic] ✅ Started polling "${row.name}" (${row.hazard_type}, every ${row.poll_interval_seconds}s)`);
    }

    // Stop polling sources that were disabled/deleted since the last refresh.
    for (const [id, handle] of timers) {
      if (!active.has(id)) {
        clearInterval(handle);
        timers.delete(id);
        console.log(`[Dynamic] Stopped polling source ${id} (deactivated/removed)`);
      }
    }
  }

  refresh();
  refreshTimer = setInterval(refresh, REFRESH_LIST_MS);

  return () => {
    running = false;
    clearInterval(refreshTimer);
    for (const handle of timers.values()) clearInterval(handle);
    timers.clear();
  };
}
