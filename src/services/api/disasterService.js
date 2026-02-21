import {createDisasterEvent, deduplicateByProximity} from '../adapters/DisasterEvent.js';
import {EDGE_FUNCTIONS} from './config.js';

/**
 * Helper to hydrate plain JSON objects from backend with getters
 */
function hydrateEvents(dataArray) {
    if (!Array.isArray(dataArray)) return [];
    return dataArray.map(evt => createDisasterEvent(evt));
}

/**
 * Fetch historical disaster data with date filters
 */
export async function fetchHistoricalEvents(type = 'all', startDate = null, endDate = null) {
    try {
        const payload = {type};
        if (startDate) payload.startDate = startDate;
        if (endDate) payload.endDate = endDate;

        const res = await fetch(EDGE_FUNCTIONS.HISTORICAL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Failed to fetch historical events');

        const data = await res.json();
        const historicalData = data && data.data ? data.data : [];

        return hydrateEvents(historicalData);
    } catch (error) {
        console.warn(`[GEWS] Historical Edge Function fetch failed for type ${type}`, error);
        return [];
    }
}

/**
 * Helper for live edge function calls (triggers UPSERT in DB)
 */
async function fetchLive(endpoint) {
    const res = await fetch(endpoint, {
        method: 'POST', // Some functions expect POST or allow it
        headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        }
    });
    if (!res.ok) throw new Error(`Failed to fetch from ${endpoint}`);
    const data = await res.json();
    return hydrateEvents(data.data || []);
}

/**
 * Fetch earthquakes from direct live endpoint
 */
export async function fetchEarthquakes() {
    const raw = await fetchLive(EDGE_FUNCTIONS.EARTHQUAKES);
    return deduplicateByProximity(raw, 15);
}

/**
 * Fetch wildfires from direct live endpoint
 */
export async function fetchWildfires() {
    const raw = await fetchLive(EDGE_FUNCTIONS.WILDFIRES);
    return deduplicateByProximity(raw, 5);
}

/**
 * Fetch flood data from direct live endpoint
 */
export async function fetchFloods() {
    const raw = await fetchLive(EDGE_FUNCTIONS.FLOODS);
    return deduplicateByProximity(raw, 20);
}

/**
 * Fetch drought data from direct live endpoint
 */
export async function fetchDroughts() {
    const raw = await fetchLive(EDGE_FUNCTIONS.DROUGHTS);
    return deduplicateByProximity(raw, 20);
}

/**
 * Fetch all disaster data in parallel
 * @returns {Promise<Object>}
 */
export async function fetchAllDisasters(startDate = null, endDate = null) {
    // If querying specific dates, just fetch all at once
    if (startDate || endDate) {
        const hydratedData = await fetchHistoricalEvents('all', startDate, endDate);
        return {
            earthquakes: deduplicateByProximity(hydratedData.filter(e => e.type === 'earthquake'), 15),
            wildfires: deduplicateByProximity(hydratedData.filter(e => e.type === 'wildfire'), 5),
            floods: deduplicateByProximity(hydratedData.filter(e => e.type === 'flood'), 20),
            droughts: deduplicateByProximity(hydratedData.filter(e => e.type === 'drought'), 20),
            fetchedAt: new Date().toISOString(),
            sourcesOnline: hydratedData.length > 0 ? 4 : 0
        };
    }

    // Default polling behavior fetches types individually wrapped here for API consistency
    const [earthquakes, wildfires, floods, droughts] = await Promise.allSettled([
        fetchEarthquakes(),
        fetchWildfires(),
        fetchFloods(),
        fetchDroughts()
    ]);

    return {
        earthquakes: earthquakes.status === 'fulfilled' ? earthquakes.value : [],
        wildfires: wildfires.status === 'fulfilled' ? wildfires.value : [],
        floods: floods.status === 'fulfilled' ? floods.value : [],
        droughts: droughts.status === 'fulfilled' ? droughts.value : [],
        fetchedAt: new Date().toISOString(),
        sourcesOnline: [earthquakes, wildfires, floods, droughts].filter(r => r.status === 'fulfilled').length
    };
}
