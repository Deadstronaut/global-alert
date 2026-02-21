import {createDisasterEvent, DISASTER_TYPE, SEVERITY} from './DisasterEvent.js';

/**
 * Earthquake Adapter
 * Normalizes data from USGS and EMSC into DisasterEvent format.
 */

/**
 * Parse USGS GeoJSON earthquake response
 * @param {Object} geojson - USGS earthquake GeoJSON
 * @returns {Array<DisasterEvent>}
 */
export function parseUSGS(geojson) {
    if (!geojson?.features) return [];

    return geojson.features.map(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;
        const mag = props.mag || 0;

        return createDisasterEvent({
            id: `usgs-${feature.id}`,
            type: DISASTER_TYPE.EARTHQUAKE,
            lat: coords[1],
            lng: coords[0],
            severity: getEarthquakeSeverity(mag),
            magnitude: mag,
            title: props.title || props.place || 'Unknown Earthquake',
            description: `M${mag} - ${props.place || 'Unknown location'} | Depth: ${coords[2]}km`,
            time: props.time,
            source: 'USGS',
            sourceUrl: props.url || '',
            raw: feature,
            extra: {
                depth: coords[2],
                felt: props.felt,
                tsunami: props.tsunami,
                status: props.status,
                type: props.type
            }
        });
    });
}

/**
 * Parse EMSC earthquake JSON response
 * @param {Object} data - EMSC response
 * @returns {Array<DisasterEvent>}
 */
export function parseEMSC(data) {
    if (!data?.features) return [];

    return data.features.map(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;
        const mag = props.mag || 0;

        return createDisasterEvent({
            id: `emsc-${props.source_id || feature.id}`,
            type: DISASTER_TYPE.EARTHQUAKE,
            lat: coords[1],
            lng: coords[0],
            severity: getEarthquakeSeverity(mag),
            magnitude: mag,
            title: `M${mag} - ${props.flynn_region || 'Unknown'}`,
            description: `M${mag} - ${props.flynn_region || 'Unknown'} | Depth: ${coords[2]}km`,
            time: props.time || props.lastupdate,
            source: 'EMSC',
            sourceUrl: props.source_catalog ? `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${props.source_id}` : '',
            raw: feature,
            extra: {
                depth: coords[2],
                region: props.flynn_region,
                auth: props.auth
            }
        });
    });
}

/**
 * Determine earthquake severity based on magnitude
 */
function getEarthquakeSeverity(magnitude) {
    if (magnitude >= 7.0) return SEVERITY.CRITICAL;
    if (magnitude >= 5.5) return SEVERITY.HIGH;
    if (magnitude >= 4.0) return SEVERITY.MODERATE;
    if (magnitude >= 2.5) return SEVERITY.LOW;
    return SEVERITY.MINIMAL;
}
