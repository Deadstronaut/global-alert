/**
 * Supabase Writer - Normalize edilmiş olayları veritabanına yazar
 * Mevcut Supabase projesine entegre olur
 */

import {createClient} from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
// Service role key required for server-side writes (bypasses RLS)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;

export function initSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Supabase] ⚠️ Env vars eksik (SUPABASE_URL, SUPABASE_ANON_KEY), DB yazma devre dışı');
    return false;
  }
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('[Supabase] ✅ Client initialized');
  return true;
}

// Diğer modüllerin (örn. dynamicSources.js) data_sources tablosunu okuyup
// yazabilmesi için — initSupabase() çağrıldıktan sonra kullanılabilir.
export function getSupabaseClient() {
  return supabase;
}

// Tip → tablo adı (mevcut Supabase tablo adlarıyla eşleşir)
const TABLE_MAP = {
  earthquake:    'earthquake',
  wildfire:      'wildfire',
  flood:         'flood',
  drought:       'drought',
  food_security: 'food_security',
  tsunami:       'tsunami',
  cyclone:       'cyclone',
  volcano:       'volcano',
  epidemic:      'epidemic',
  disaster:      'disaster',
};

// Yazma kuyruğu (rate limiting)
const writeQueue = [];
let flushTimer = null;

/**
 * Event'i yazma kuyruğuna ekle
 */
export function queueWrite(event) {
  if (!supabase) return;
  writeQueue.push(event);

  // 2 saniyede bir toplu yaz
  if (!flushTimer) {
    flushTimer = setTimeout(flushQueue, 2000);
  }
}

// Cross-checks earthquake rows about to be written against the live table
// before the upsert, as a defense-in-depth backstop to the in-memory
// Deduplicator. Live-verified 2026-07-22: EMSC and USGS independently
// reported the same physical Hawaii M2.5 quake ~40 real seconds apart, and
// the in-memory check (which by every reproduction test — an isolated
// two-event repro AND a full 548-event historical replay — behaves
// correctly) still let both rows land in the DB in the live container. The
// exact live-runtime race was not pinned down, so rather than leave a
// known, reproducible duplicate-writing gap, this closes it independently
// at the write boundary — mirrors fetch-earthquakes/index.ts's
// filterAgainstLiveEarthquakes() (same tolerances: 25km/5min/±0.3 mag),
// and the same fail-open philosophy (a dedup-check failure must not drop
// real earthquake data).
const CROSS_CHECK_RADIUS_KM = 25;
const CROSS_CHECK_TIME_MS = 5 * 60_000;
const CROSS_CHECK_MAG_TOLERANCE = 0.3;

// Same match test as the filter below, pulled out so both the boolean
// filter and the merge-on-match path share one definition of "same quake".
function isSamePhysicalEarthquake(row, ex) {
  if (ex.id === row.id) return false; // handled by upsert's own onConflict, not this filter
  if (ex.magnitude != null && row.magnitude != null && Math.abs(row.magnitude - ex.magnitude) > CROSS_CHECK_MAG_TOLERANCE) return false;
  const dLat = (row.lat - ex.lat) * 111;
  const dLng = (row.lng - ex.lng) * 111;
  const distKm = Math.sqrt(dLat * dLat + dLng * dLng);
  if (distKm >= CROSS_CHECK_RADIUS_KM) return false;
  const dtMs = Math.abs(new Date(row.time).getTime() - new Date(ex.time).getTime());
  return dtMs < CROSS_CHECK_TIME_MS;
}

async function filterAgainstLiveEarthquakes(rows) {
  if (rows.length === 0) return rows;
  const sinceIso = new Date(Date.now() - CROSS_CHECK_TIME_MS).toISOString();
  const { data: recent, error } = await supabase
    .from('earthquake')
    .select('id, lat, lng, time, magnitude, source, contributing_sources')
    .gte('time', sinceIso);
  if (error) {
    console.warn(`[Supabase] Live earthquake dedup check failed, writing without it: ${error.message}`);
    return rows;
  }

  const existing = recent || [];
  const rowsToKeep = [];
  for (const row of rows) {
    const match = existing.find((ex) => isSamePhysicalEarthquake(row, ex));
    if (!match) {
      rowsToKeep.push(row);
      continue;
    }
    // Cross-process duplicate: this row's own source (parsed back off of
    // mapToRow's JSON.stringify) never made it into the in-memory
    // Deduplicator (different process/restart) — merge it into the
    // already-live row's contributing_sources instead of discarding it,
    // same reasoning as deduplicator.js's mergeSource().
    await mergeContributingSource(match, row);
  }
  return rowsToKeep;
}

async function mergeContributingSource(existingRow, incomingRow) {
  let sources;
  try {
    sources = typeof existingRow.contributing_sources === 'string'
      ? JSON.parse(existingRow.contributing_sources || '[]')
      : (existingRow.contributing_sources || []);
  } catch {
    sources = [];
  }
  if (sources.length === 0) sources.push({ source: existingRow.source, magnitude: existingRow.magnitude });
  if (sources.some((s) => s.source === incomingRow.source)) return; // already have this agency
  sources.push({ source: incomingRow.source, magnitude: incomingRow.magnitude, sourceUrl: incomingRow.source_url, receivedAt: incomingRow.received_at });
  const { error } = await supabase.from('earthquake').update({ contributing_sources: sources }).eq('id', existingRow.id);
  if (error) console.warn(`[Supabase] contributing_sources merge failed for ${existingRow.id}:`, error.message);
}

// Queued from handleEvent() when the in-memory Deduplicator itself (not
// this file's cross-process backstop above) finds a same-process match —
// e.g. EMSC and AFAD both reporting the same quake within the same
// server run. Small, separate queue so a burst of merges never blocks
// (or gets blocked by) the regular insert queue's flush.
const sourceMergeQueue = [];
let sourceMergeTimer = null;

export function queueSourceMerge(id, contributingSources) {
  if (!supabase) return;
  sourceMergeQueue.push({ id, contributingSources });
  if (!sourceMergeTimer) sourceMergeTimer = setTimeout(flushSourceMergeQueue, 2000);
}

async function flushSourceMergeQueue() {
  sourceMergeTimer = null;
  const batch = sourceMergeQueue.splice(0, sourceMergeQueue.length);
  for (const { id, contributingSources } of batch) {
    const { error } = await supabase.from('earthquake').update({ contributing_sources: contributingSources }).eq('id', id);
    if (error) console.warn(`[Supabase] contributing_sources update failed for ${id}:`, error.message);
  }
}

async function flushQueue() {
  flushTimer = null;
  if (writeQueue.length === 0) return;

  // Tip'e göre grupla
  const groups = {};
  while (writeQueue.length > 0) {
    const event = writeQueue.shift();
    const table = TABLE_MAP[event.type] || 'disaster';
    if (!groups[table]) groups[table] = [];
    groups[table].push(mapToRow(event));
  }

  // Her tablo için upsert
  for (const [table, rows] of Object.entries(groups)) {
    try {
      const rowsToWrite = table === 'earthquake' ? await filterAgainstLiveEarthquakes(rows) : rows;
      if (rowsToWrite.length === 0) continue;
      const {error} = await supabase
        .from(table)
        .upsert(rowsToWrite, {onConflict: 'id', ignoreDuplicates: true});

      if (error) {
        // Tablo yoksa genel 'disaster' tablosuna yaz
        if (error.code === '42P01' && table !== 'disaster') {
          await supabase.from('disaster').upsert(rowsToWrite, {onConflict: 'id', ignoreDuplicates: true});
        } else {
          console.warn(`[Supabase] Upsert error (${table}):`, error.message);
        }
      }
    } catch (err) {
      console.warn(`[Supabase] Write failed (${table}):`, err.message);
    }
  }
}

/**
 * Erken uyarıyı logla
 */
export async function writeEarlyWarning(warning) {
  if (!supabase) return;
  try {
    await supabase.from('early_warnings').insert({
      event_id: warning.eventId,
      magnitude: warning.earthquake.magnitude,
      depth: warning.earthquake.depth,
      lat: warning.earthquake.lat,
      lng: warning.earthquake.lng,
      earthquake_time: warning.earthquake.time,
      affected_cities: warning.affectedCities,
      estimated_affected_pop: warning.estimatedAffectedPop,
      max_warning_time_sec: warning.maxWarningTimeSec,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[Supabase] Early warning write failed:', err.message);
  }
}

function mapToRow(event) {
  return {
    id: event.id,
    type: event.type,
    lat: event.lat,
    lng: event.lng,
    severity: event.severity,
    magnitude: event.magnitude,
    depth: event.depth,
    title: event.title,
    description: event.description,
    time: event.time,
    source: event.source,
    source_url: event.sourceUrl,
    h3_id: event.h3Id ?? null,
    country_code: event.countryCode ?? null,
    // Bug fix (2026-08-20, user-reported: raw/unreadable data surfacing in
    // the app — traced here while fixing a separate "MNaN" title bug).
    // extra/contributing_sources are jsonb columns; supabase-js's own
    // PostgREST client already serializes a plain JS object/array to JSON
    // for a jsonb column on insert/upsert. Calling JSON.stringify() on it
    // here first turned the value into a STRING before handing it to
    // supabase-js, which then serialized THAT string as the jsonb payload
    // — so every row ended up with extra/contributing_sources stored as a
    // jsonb string scalar wrapping the real JSON, not a real jsonb object.
    // Any direct SQL (`extra->>'field'`) against these columns silently
    // returned NULL as a result (only this file's own read paths and the
    // frontend's rowToEvent() worked, because both defensively re-parse a
    // string form). Passing the plain object/array through directly lets
    // supabase-js store it as real jsonb.
    extra: event.extra || {},
    received_at: event.receivedAt,
    ...(event.type === 'earthquake' ? {
      contributing_sources:
        event.contributingSources ?? [{ source: event.source, magnitude: event.magnitude, sourceUrl: event.sourceUrl, receivedAt: event.receivedAt }],
    } : {}),
  };
}
