/**
 * DisasterEvent - Unified data model for all disaster types.
 * All API adapters normalize their data into this format.
 */

/**
 * Severity levels for disasters
 * @enum {string}
 */
export const SEVERITY = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MODERATE: 'moderate',
    LOW: 'low',
    MINIMAL: 'minimal'
};

/**
 * Disaster type identifiers
 * @enum {string}
 */
export const DISASTER_TYPE = {
    EARTHQUAKE: 'earthquake',
    WILDFIRE: 'wildfire',
    FLOOD: 'flood',
    DROUGHT: 'drought'
};

/**
 * Creates a normalized DisasterEvent object
 * @param {Object} params
 * @returns {Object} DisasterEvent
 */
export function createDisasterEvent({
    id,
    type,
    lat,
    lng,
    severity = SEVERITY.LOW,
    magnitude = null,
    title = '',
    description = '',
    time = null,
    source = '',
    sourceUrl = '',
    raw = null,
    extra = {}
}) {
    return {
        id: String(id),
        type,
        lat: Number(lat),
        lng: Number(lng),
        severity,
        magnitude: magnitude !== null ? Number(magnitude) : null,
        title,
        description,
        time: time ? new Date(time).toISOString() : new Date().toISOString(),
        source,
        sourceUrl,
        raw,
        extra,
        // Computed helpers
        get color() {
            return getSeverityColor(this.severity);
        },
        get icon() {
            return getDisasterIcon(this.type);
        }
    };
}

/**
 * Returns the CSS color variable for a severity level
 */
export function getSeverityColor(severity) {
    const map = {
        [SEVERITY.CRITICAL]: 'var(--color-critical)',
        [SEVERITY.HIGH]: 'var(--color-high)',
        [SEVERITY.MODERATE]: 'var(--color-moderate)',
        [SEVERITY.LOW]: 'var(--color-low)',
        [SEVERITY.MINIMAL]: 'var(--color-minimal)'
    };
    return map[severity] || map[SEVERITY.LOW];
}

/**
 * Returns hex color for globe.gl points
 */
export function getSeverityHex(severity) {
    const map = {
        [SEVERITY.CRITICAL]: '#ff1744',
        [SEVERITY.HIGH]: '#ff6d00',
        [SEVERITY.MODERATE]: '#ffd600',
        [SEVERITY.LOW]: '#00e676',
        [SEVERITY.MINIMAL]: '#00bfa5'
    };
    return map[severity] || map[SEVERITY.LOW];
}

/**
 * Returns emoji icon for a disaster type
 */
export function getDisasterIcon(type) {
    const map = {
        [DISASTER_TYPE.EARTHQUAKE]: '🔴',
        [DISASTER_TYPE.WILDFIRE]: '🔥',
        [DISASTER_TYPE.FLOOD]: '🌊',
        [DISASTER_TYPE.DROUGHT]: '☀️'
    };
    return map[type] || '⚠️';
}

/**
 * Calculates distance between two coordinates in km (Haversine)
 */
export function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Deduplicates disaster events by proximity
 * @param {Array} events
 * @param {number} radiusKm - minimum separation
 * @returns {Array}
 */
export function deduplicateByProximity(events, radiusKm = 10) {
    const result = [];
    for (const event of events) {
        const isDup = result.some(
            e => e.type === event.type && distanceKm(e.lat, e.lng, event.lat, event.lng) < radiusKm
        );
        if (!isDup) {
            result.push(event);
        }
    }
    return result;
}
