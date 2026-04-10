/**
 * Supabase Service - Frontend Supabase client and data fetching from views
 * Date-based filtering is handled on the frontend; views return all records.
 */

import {createClient} from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _client = null;

function getClient() {
    if (!_client) {
        if (!supabaseUrl || !supabaseKey) {
            console.warn('[SupabaseService] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
            return null;
        }
        _client = createClient(supabaseUrl, supabaseKey);
    }
    return _client;
}

// View name → disaster event type mapping
const VIEW_MAP = {
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

/**
 * Fetch data from a single view. Supabase REST API returns max 1000 rows per
 * request by default; we use `range` headers to paginate all rows.
 * @param {string} viewName
 * @param {number} [pageSize=1000]
 * @returns {Promise<Array>}
 */
async function fetchAllFromView(viewName, pageSize = 1000) {
    const client = getClient();
    if (!client) return [];

    let all = [];
    let from = 0;

    while (true) {
        const {data, error} = await client
            .from(viewName)
            .select('*')
            .range(from, from + pageSize - 1);

        if (error) {
            console.warn(`[SupabaseService] Error fetching ${viewName}:`, error.message);
            break;
        }

        if (!data || data.length === 0) break;

        all = all.concat(data);

        // If returned rows are less than page size, we've reached the end
        if (data.length < pageSize) break;

        from += pageSize;
    }

    return all;
}

/**
 * Fetch all disaster events from all views in parallel.
 * Returns a flat array of events with `type` field set.
 * @returns {Promise<Array>}
 */
export async function fetchAllDisasters() {
    const client = getClient();
    if (!client) return [];

    const results = await Promise.allSettled(
        Object.entries(VIEW_MAP).map(async ([viewName, type]) => {
            const rows = await fetchAllFromView(viewName);
            return rows.map((row) => ({
                ...row,
                type,
                // Normalize field names to match WebSocket event format
                sourceUrl: row.source_url ?? row.sourceUrl,
                receivedAt: row.received_at ?? row.receivedAt,
                extra: typeof row.extra === 'string' ? JSON.parse(row.extra || '{}') : (row.extra ?? {}),
            }));
        }),
    );

    const events = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            events.push(...result.value);
        }
    }

    return events;
}

/**
 * Fetch row counts per disaster type (for badge display).
 * Uses COUNT aggregation via views.
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchDisasterCounts() {
    const client = getClient();
    if (!client) return {};

    const counts = {};

    const results = await Promise.allSettled(
        Object.entries(VIEW_MAP).map(async ([viewName, type]) => {
            const {count, error} = await client
                .from(viewName)
                .select('*', {count: 'exact', head: true});

            if (error) {
                console.warn(`[SupabaseService] Count error (${viewName}):`, error.message);
                return {type, count: 0};
            }
            return {type, count: count ?? 0};
        }),
    );

    for (const result of results) {
        if (result.status === 'fulfilled') {
            counts[result.value.type] = result.value.count;
        }
    }

    return counts;
}
