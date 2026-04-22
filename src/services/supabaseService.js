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
        type,
        severity,
        sourceUrl: row.source_url ?? row.sourceUrl ?? '',
        receivedAt: row.received_at ?? row.receivedAt ?? new Date().toISOString(),
        extra: typeof row.extra === 'string'
            ? JSON.parse(row.extra || '{}')
            : (row.extra ?? {}),
    });
}

/**
 * `options` can be { hours: 24 } or { fromDate: '...', toDate: '...' }
 */
export async function fetchRecentDisasters(options = {}) {
    const client = getClient();
    if (!client) return [];

    let fromDate = options.fromDate;
    const toDate = options.toDate;

    if (!fromDate) {
        const hours = options.hours || 24;
        fromDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    }

    // Uzun tarih aralıklarında (>30 gün) sadece önemli depremler (M5.5+) çek
    const rangeHours = options.hours || 24;
    const rangeDays = rangeHours / 24;
    const minMagnitudeForRange = rangeDays > 365 ? 5.5 : rangeDays > 30 ? 4.0 : null;

    const results = await Promise.allSettled(
        Object.entries(TABLE_MAP).map(async ([table, type]) => {
            let query = client
                .from(table)
                .select('id,type,lat,lng,severity,magnitude,depth,title,description,time,source,source_url,extra,received_at')
                .gte('time', fromDate);

            if (toDate) {
                query = query.lte('time', toDate);
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
