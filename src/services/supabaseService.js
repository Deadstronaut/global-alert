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

// Tablo adı → disaster event type
const TABLE_MAP = {
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
    earthquake: 30000,
    wildfire: 10000,
    flood: 10000,
    drought: 10000,
    food_security: 10000,
    tsunami: 10000,
    cyclone: 10000,
    volcano: 10000,
    epidemic: 10000,
};

function rowToEvent(row, type) {
    return createDisasterEvent({
        ...row,
        type,
        sourceUrl: row.source_url ?? row.sourceUrl ?? '',
        receivedAt: row.received_at ?? row.receivedAt ?? new Date().toISOString(),
        extra: typeof row.extra === 'string'
            ? JSON.parse(row.extra || '{}')
            : (row.extra ?? {}),
    });
}

/**
 * Son `hours` saatin verilerini tüm tablolardan paralel çeker.
 */
export async function fetchRecentDisasters(hours = 24) {
    const client = getClient();
    if (!client) return [];

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const results = await Promise.allSettled(
        Object.entries(TABLE_MAP).map(async ([table, type]) => {
            const {data, error} = await client
                .from(table)
                .select('id,type,lat,lng,severity,magnitude,depth,title,description,time,source,source_url,extra,received_at')
                .gte('time', since)
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

    const channels = Object.entries(TABLE_MAP).map(([table, type]) => {
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
