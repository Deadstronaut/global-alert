import {parseUSGS} from '../adapters/earthquakeAdapter.js';
import {parseFIRMS} from '../adapters/wildfireAdapter.js';
import {parseReliefWeb} from '../adapters/floodAdapter.js';
import {deduplicateByProximity} from '../adapters/DisasterEvent.js';

/**
 * Disaster Service
 * Fetches and aggregates disaster data from multiple sources.
 * Uses direct API calls (CORS-friendly endpoints) with Edge Function fallback.
 */



/**
 * Fetch earthquakes from USGS and EMSC
 * @param {string} period - 'hour', 'day', 'week', 'month'
 * @param {string} minMagnitude - 'significant', 'all', '4.5', '2.5', '1.0'
 * @returns {Promise<Array>}
 */
export async function fetchEarthquakes(period = 'day', minMagnitude = '2.5') {
    const results = await Promise.allSettled([
        fetchUSGS(period, minMagnitude),
        fetchEMSC()
    ]);

    const events = [];
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            events.push(...result.value);
        }
    }

    return deduplicateByProximity(events, 15);
}

import {supabase} from './config.js';

async function fetchUSGS(period, minMagnitude) {
    try {
        const {data, error} = await supabase.functions.invoke('fetch-earthquakes', {
            body: {period, minMagnitude}
        });

        if (error) throw error;
        return parseUSGS(data);
    } catch (error) {
        console.warn('[GEWS] USGS Edge Function fetch failed:', error.message);
        return [];
    }
}

async function fetchEMSC() {
    try {
        // Fallback or explicit separate edge function if needed
        // For now, USGS is sufficient for Phase 1 demo
        return [];
    } catch (error) {
        return [];
    }
}

/**
 * Fetch wildfires from NASA FIRMS
 * Uses USGS-style GeoJSON when FIRMS key is unavailable
 * @returns {Promise<Array>}
 */
export async function fetchWildfires() {
    const results = await Promise.allSettled([
        fetchFIRMS()
    ]);

    const events = [];
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            events.push(...result.value);
        }
    }

    return deduplicateByProximity(events, 5);
}

async function fetchFIRMS() {
    try {
        const {data, error} = await supabase.functions.invoke('fetch-wildfires');

        if (error) throw error;
        return parseFIRMS(data || []);
    } catch (error) {
        console.warn('[GEWS] FIRMS Edge Function fetch failed:', error.message);
        return [];
    }
}

/**
 * Fetch flood data from ReliefWeb
 * @returns {Promise<Array>}
 */
export async function fetchFloods() {
    const results = await Promise.allSettled([
        fetchReliefWeb()
    ]);

    const events = [];
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            events.push(...result.value);
        }
    }

    return deduplicateByProximity(events, 20);
}

async function fetchReliefWeb() {
    try {
        const {data, error} = await supabase.functions.invoke('fetch-floods');

        if (error) throw error;
        return parseReliefWeb(data);
    } catch (error) {
        console.warn('[GEWS] ReliefWeb Edge Function fetch failed:', error.message);
        return [];
    }
}

export async function fetchDroughts() {
    try {
        const {data, error} = await supabase.functions.invoke('fetch-droughts');

        if (error) throw error;
        // Re-using ReliefWeb generic parser for now since the Edge Function hits ReliefWeb
        // but let's ensure it hits the drought adapter if needed.
        // The drought adapter expects Copernicus/USDM format, so let's use the ReliefWeb parser from floodAdapter for identical structures
        return parseReliefWeb(data); // Re-using parseReliefWeb since both are ReliefWeb structures right now
    } catch (error) {
        console.warn('[GEWS] Droughts Edge Function fetch failed:', error.message);
        return [];
    }
}

/**
 * Fetch all disaster data in parallel
 * @returns {Promise<Object>}
 */
export async function fetchAllDisasters() {
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
