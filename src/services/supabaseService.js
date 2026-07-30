/**
 * Supabase Service
 * - İlk yükleme: son 24 saat, tip başına limitli
 * - Canlı güncellemeler: Realtime INSERT subscription
 */

import {supabase} from './api/config.js';
import {createDisasterEvent} from './adapters/DisasterEvent.js';

export function getClient() {
    return supabase;
}

// Fetch için view'lar (geçersiz koordinatlar filtrelenmiş)
// 'disaster' — kendi özel tablosu olmayan hazard type'lar için genel kova
// (bkz. 20260727000000 migration). Yeni bir hazard type eklendiğinde BU
// LİSTEYE satır eklenmez — hepsi zaten 'disaster' girişinin altına düşer.
const TABLE_MAP = {
    earthquake_view: 'earthquake',
    wildfire_view: 'wildfire',
    flood_view: 'flood',
    drought_view: 'drought',
    food_security_view: 'food_security',
    tsunami_view: 'tsunami',
    cyclone_view: 'cyclone',
    volcano_view: 'volcano',
    epidemic_view: 'epidemic',
    disaster_view: 'disaster',
};

// Realtime subscription için tablolar (view'lar realtime desteklemez)
const REALTIME_TABLE_MAP = {
    earthquake: 'earthquake',
    wildfire: 'wildfire',
    flood: 'flood',
    drought: 'drought',
    food_security: 'food_security',
    tsunami: 'tsunami',
    cyclone: 'cyclone',
    volcano: 'volcano',
    epidemic: 'epidemic',
    disaster: 'disaster',
};

// Tip başına fetch limiti
const FETCH_LIMIT = {
    earthquake_view: 30000,
    wildfire_view: 10000,
    flood_view: 10000,
    drought_view: 10000,
    food_security_view: 10000,
    tsunami_view: 10000,
    cyclone_view: 10000,
    volcano_view: 10000,
    epidemic_view: 10000,
    disaster_view: 10000,
};

function getEarthquakeSeverity(magnitude) {
    if (magnitude >= 7.0) return 'critical';
    if (magnitude >= 5.5) return 'high';
    if (magnitude >= 4.0) return 'moderate';
    if (magnitude >= 2.5) return 'low';
    return 'minimal';
}

function rowToEvent(row, type) {
    // Supabase'deki severity değeri yanlış olabilir; depremler için magnitude'dan yeniden hesapla
    let severity = row.severity;
    if (type === 'earthquake' && row.magnitude != null) {
        severity = getEarthquakeSeverity(Number(row.magnitude));
    }

    return createDisasterEvent({
        ...row,
        // row.type önceliklidir: 9 özel tablo için no-op (row.type zaten
        // sabit `type` ile aynı), ama 'disaster' genel kovasında satırlar
        // birbirinden farklı gerçek hazard type'ları taşıyor (örn.
        // landslide) — bunu sabit 'disaster' string'iyle ezmek ikon
        // eşleşmesini ve disaster.js'in storeMap fallback'ini kırar.
        type: row.type || type,
        severity,
        h3_id: row.h3_id || null,
        sourceUrl: row.source_url ?? row.sourceUrl ?? '',
        receivedAt: row.received_at ?? row.receivedAt ?? new Date().toISOString(),
        extra: typeof row.extra === 'string'
            ? JSON.parse(row.extra || '{}')
            : (row.extra ?? {}),
    });
}

/**
 * `options` can be { hours: 24 } or { fromDate: '...', toDate: '...' },
 * optionally plus `bbox: { minLat, maxLat, minLng, maxLng }` for a
 * server-side geographic scope (used by loadCountryHistory() — see
 * disaster.js — instead of pulling every country's events just to filter
 * them client-side afterward).
 */
export async function fetchRecentDisasters(options = {}) {
    const client = getClient();
    if (!client) return [];

    let fromDate = options.fromDate;
    const toDate = options.toDate;
    const bbox = options.bbox || null;

    if (!fromDate) {
        const hours = options.hours || 24;
        fromDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    }

    // Uzun tarih aralıklarında (>30 gün) sadece önemli depremler (M5.5+) çek.
    // Gerçek aralığı (şimdi - fromDate) esas alır, sadece options.hours'a değil —
    // önceden fromDate doğrudan verildiğinde (örn. loadCountryHistory'nin "tüm
    // geçmiş" isteği) bu eşik hiç uygulanmıyordu (rangeHours varsayılan 24'e
    // düşüyordu), sınırsız/çok büyük bir sorguya yol açabilirdi.
    const rangeDays = (Date.now() - new Date(fromDate).getTime()) / (24 * 60 * 60 * 1000);
    const minMagnitudeForRange = rangeDays > 365 ? 5.5 : rangeDays > 30 ? 4.0 : null;

    const results = await Promise.allSettled(
        Object.entries(TABLE_MAP).map(async ([table, type]) => {
            let query = client
                .from(table)
                .select('id,type,lat,lng,h3_id,severity,magnitude,depth,title,description,time,source,source_url,extra,received_at')
                .gte('time', fromDate);

            if (toDate) {
                query = query.lte('time', toDate);
            }

            if (bbox) {
                query = query
                    .gte('lat', bbox.minLat).lte('lat', bbox.maxLat)
                    .gte('lng', bbox.minLng).lte('lng', bbox.maxLng);
            }

            // Depremler için uzun aralıkta magnitude filtresi uygula
            if (type === 'earthquake' && minMagnitudeForRange !== null) {
                query = query.gte('magnitude', minMagnitudeForRange);
            }

            const {data, error} = await query
                .order('time', {ascending: false})
                .limit(FETCH_LIMIT[table] ?? 200);

            if (error) {
                console.warn(`[Supabase] ${table} fetch error:`, error.message);
                return [];
            }
            return (data ?? []).map(row => rowToEvent(row, type));
        }),
    );

    return results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);
}

/**
 * Tüm tablolara Realtime INSERT subscription kurar.
 * @param {Function} onEvent - (DisasterEvent) => void
 * @returns {Function} unsubscribe()
 */
export function subscribeRealtime(onEvent) {
    const client = getClient();
    if (!client) return () => { };

    const channels = Object.entries(REALTIME_TABLE_MAP).map(([table, type]) => {
        return client
            .channel(`realtime:${table}`)
            .on(
                'postgres_changes',
                {event: 'INSERT', schema: 'public', table},
                (payload) => {
                    try {
                        const event = rowToEvent(payload.new, type);
                        onEvent(event);
                    } catch (err) {
                        console.warn(`[Realtime] ${table} parse error:`, err.message);
                    }
                },
            )
            .subscribe();
    });

    console.log(`[Realtime] ✅ Subscribed to ${channels.length} tables`);

    return () => {
        channels.forEach(ch => client.removeChannel(ch));
        console.log('[Realtime] Unsubscribed');
    };
}

/**
 * Fetch aggregated H3 hex data for performance
 */
export async function fetchAggregatedDisasters(options = {}) {
  const { hours = 24, types = [], severities = [], fromDate = null, toDate = null } = options;
  
  const { data, error } = await supabase.rpc('get_aggregated_disasters', {
    p_hours: hours,
    p_types: types,
    p_severities: severities,
    p_from_date: fromDate,
    p_to_date: toDate
  });

  if (error) {
    console.error('[Supabase] Aggregation error:', error.message);
    throw error;
  }

  return data || [];
}

