/**
 * Supabase Writer - Normalize edilmiş olayları veritabanına yazar
 * Mevcut Supabase projesine entegre olur
 */

import {createClient} from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

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

async function flushQueue() {
  flushTimer = null;
  if (writeQueue.length === 0) return;

  // Tip'e göre grupla
  const groups = {};
  while (writeQueue.length > 0) {
    const event = writeQueue.shift();
    const table = TABLE_MAP[event.type] || 'disasters';
    if (!groups[table]) groups[table] = [];
    groups[table].push(mapToRow(event));
  }

  // Her tablo için upsert
  for (const [table, rows] of Object.entries(groups)) {
    try {
      const {error} = await supabase
        .from(table)
        .upsert(rows, {onConflict: 'id', ignoreDuplicates: true});

      if (error) {
        // Tablo yoksa 'disasters' genel tablosuna yaz
        if (error.code === '42P01') {
          await supabase.from('disasters').upsert(rows, {onConflict: 'id', ignoreDuplicates: true});
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
      affected_cities: JSON.stringify(warning.affectedCities),
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
    extra: JSON.stringify(event.extra || {}),
    received_at: event.receivedAt,
  };
}
