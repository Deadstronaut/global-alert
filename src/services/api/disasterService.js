import {parseUSGS} from '../adapters/earthquakeAdapter.js';
import {createDisasterEvent, deduplicateByProximity} from '../adapters/DisasterEvent.js';
import {supabase} from './config.js';

/**
 * Helper to hydrate plain JSON objects from backend with getters
 */
function hydrateEvents(dataArray) {
    if (!Array.isArray(dataArray)) return [];
    return dataArray.map(evt => createDisasterEvent(evt));
}

/**
 * Fetch earthquakes from USGS and EMSC (via Supabase Edge)
 */
export async function fetchEarthquakes(period = 'day', minMagnitude = '2.5') {
    try {
        const {data, error} = await supabase.functions.invoke('fetch-earthquakes', {
            body: {period, minMagnitude}
        });
        if (error) throw error;
        // USGS returns raw GeoJSON, needs client adapter
        const evs = parseUSGS(data);
        return deduplicateByProximity(evs, 15);
    } catch (error) {
        console.warn('[GEWS] USGS Edge Function fetch failed', error);
        return [];
    }
}

/**
 * Fetch wildfires from NASA FIRMS (via Supabase Edge)
 */
export async function fetchWildfires() {
    try {
        const {data, error} = await supabase.functions.invoke('fetch-wildfires');
        if (error) throw error;
        // Edge function already normalizes and formats the data object internally
        const mappedData = data && data.data ? data.data : [];
        const hydratedData = hydrateEvents(mappedData);
        return deduplicateByProximity(hydratedData, 5);
    } catch (error) {
        console.warn('[GEWS] FIRMS Edge Function fetch failed', error);
        return [];
    }
}

/**
 * Fetch flood data from ReliefWeb/Fallback (via Supabase Edge)
 */
export async function fetchFloods() {
    try {
        const {data, error} = await supabase.functions.invoke('fetch-floods');
        if (error) throw error;
        // Edge function already normalizes and formats the data object internally
        const mappedData = data && data.data ? data.data : [];
        return deduplicateByProximity(mappedData, 20);
    } catch (error) {
        console.warn('[GEWS] ReliefWeb/Floods Edge Function failed', error);
        return [];
    }
}

/**
 * Fetch drought data from ReliefWeb/Fallback (via Supabase Edge)
 */
export async function fetchDroughts() {
    try {
        const {data, error} = await supabase.functions.invoke('fetch-droughts');
        if (error) throw error;
        // Edge function already normalizes and formats the data object internally
        const mappedData = data && data.data ? data.data : [];
        const hydratedData = hydrateEvents(mappedData);
        return deduplicateByProximity(hydratedData, 20); // reuse proximity logic
    } catch (error) {
        console.warn('[GEWS] Droughts Edge Function failed', error);
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
