/**
 * Offline Cache Service
 * Persists last disaster events to localStorage for offline access.
 */
import {createDisasterEvent} from './adapters/DisasterEvent.js';

const CACHE_PREFIX = 'gews_cache_';
const MAX_EVENTS_PER_TYPE = 50;

/**
 * Save disaster events to localStorage
 * @param {string} type - disaster type key
 * @param {Array} events - array of DisasterEvent
 */
export function cacheEvents(type, events) {
    try {
        const data = {
            events: events.slice(0, MAX_EVENTS_PER_TYPE),
            cachedAt: new Date().toISOString()
        };
        localStorage.setItem(`${CACHE_PREFIX}${type}`, JSON.stringify(data));
    } catch (error) {
        console.warn(`[GEWS] Cache write failed for ${type}:`, error.message);
    }
}

/**
 * Load cached disaster events from localStorage
 * @param {string} type - disaster type key
 * @returns {{ events: Array, cachedAt: string|null }}
 */
export function loadCachedEvents(type) {
    try {
        const raw = localStorage.getItem(`${CACHE_PREFIX}${type}`);
        if (!raw) return {events: [], cachedAt: null};
        const data = JSON.parse(raw);
        return {
            events: (data.events || []).map(e => createDisasterEvent(e)),
            cachedAt: data.cachedAt || null
        };
    } catch (error) {
        console.warn(`[GEWS] Cache read failed for ${type}:`, error.message);
        return {events: [], cachedAt: null};
    }
}

/**
 * Clear all cached disaster events
 */
export function clearCache() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    keys.forEach(key => localStorage.removeItem(key));
}

/**
 * Check if we have cached data available
 * @returns {boolean}
 */
export function hasCachedData() {
    return Object.keys(localStorage).some(k => k.startsWith(CACHE_PREFIX));
}

/**
 * Load all cached data at once
 * @returns {Object}
 */
export function loadAllCachedData() {
    return {
        earthquakes: loadCachedEvents('earthquake').events,
        wildfires: loadCachedEvents('wildfire').events,
        floods: loadCachedEvents('flood').events,
        droughts: loadCachedEvents('drought').events
    };
}
