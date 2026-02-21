import {createClient} from '@supabase/supabase-js';

/**
 * API Configuration
 * All external API calls are proxied through Supabase Edge Functions
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mjvuzbpjyhhiwarjcvlm.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Direct API endpoints (used by Edge Functions, or as fallbacks)
 */
export const API_ENDPOINTS = {
    // Earthquake sources
    USGS_REALTIME: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary',
    EMSC_REALTIME: 'https://www.seismicportal.eu/fdsnws/event/1/query',

    // Wildfire sources
    NASA_FIRMS: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv',
    NASA_FIRMS_JSON: 'https://firms.modaps.eosdis.nasa.gov/api/country/csv',

    // Flood sources
    OPENWEATHER_ONECALL: 'https://api.openweathermap.org/data/3.0/onecall',
    RELIEFWEB: 'https://api.reliefweb.int/v1/disasters',

    // Drought sources
    USDM: 'https://usdmdataservices.unl.edu/api/StateStatistics'
};

/**
 * Supabase Edge Function URLs
 */
export const EDGE_FUNCTIONS = {
    HISTORICAL: `${supabaseUrl}/functions/v1/fetch-historical-events`,
    EARTHQUAKES: `${supabaseUrl}/functions/v1/fetch-earthquakes`,
    WILDFIRES: `${supabaseUrl}/functions/v1/fetch-wildfires`,
    FLOODS: `${supabaseUrl}/functions/v1/fetch-floods`,
    DROUGHTS: `${supabaseUrl}/functions/v1/fetch-droughts`,
    FOOD_SECURITY: `${supabaseUrl}/functions/v1/fetch-food-security`
};

/**
 * Polling intervals in milliseconds
 */
export const POLLING_INTERVALS = {
    earthquake: 60 * 1000,       // 1 minute
    wildfire: 15 * 60 * 1000,   // 15 minutes
    flood: 5 * 60 * 1000,       // 5 minutes
    drought: 60 * 60 * 1000,     // 1 hour
    food_security: 60 * 60 * 1000 // 1 hour
};

/**
 * Cache TTLs in milliseconds
 */
export const CACHE_TTL = {
    earthquake: 60 * 1000,
    wildfire: 15 * 60 * 1000,
    flood: 5 * 60 * 1000,
    drought: 60 * 60 * 1000
};
