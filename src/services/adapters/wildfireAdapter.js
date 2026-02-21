import {createDisasterEvent, DISASTER_TYPE, SEVERITY} from './DisasterEvent.js';

/**
 * Wildfire Adapter
 * Normalizes data from NASA FIRMS and GWIS into DisasterEvent format.
 */

/**
 * Parse NASA FIRMS JSON response (MODIS/VIIRS hotspot data)
 * @param {Array} records - FIRMS fire records
 * @returns {Array<DisasterEvent>}
 */
export function parseFIRMS(records) {
    if (!Array.isArray(records)) return [];

    return records.map((record, index) => {
        const confidence = Number(record.confidence || record.frp || 0);

        return createDisasterEvent({
            id: `firms-${record.acq_date}-${record.latitude}-${record.longitude}-${index}`,
            type: DISASTER_TYPE.WILDFIRE,
            lat: record.latitude,
            lng: record.longitude,
            severity: getFireSeverity(confidence, record.frp),
            magnitude: record.frp || null,
            title: `Active Fire - ${record.daynight === 'D' ? 'Daytime' : 'Nighttime'}`,
            description: `Brightness: ${record.brightness || 'N/A'}K | FRP: ${record.frp || 'N/A'} MW | Confidence: ${confidence}%`,
            time: `${record.acq_date} ${record.acq_time || '00:00'}`,
            source: `NASA FIRMS (${record.instrument || 'MODIS'})`,
            sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/',
            raw: record,
            extra: {
                brightness: record.brightness,
                brightT31: record.bright_t31,
                frp: record.frp,
                confidence: confidence,
                instrument: record.instrument,
                satellite: record.satellite,
                daynight: record.daynight,
                scan: record.scan,
                track: record.track
            }
        });
    });
}

/**
 * Parse GWIS (Global Wildfire Information System) response
 * @param {Object} data - GWIS data
 * @returns {Array<DisasterEvent>}
 */
export function parseGWIS(data) {
    if (!data?.features) return [];

    return data.features.map(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;

        return createDisasterEvent({
            id: `gwis-${props.id || feature.id}`,
            type: DISASTER_TYPE.WILDFIRE,
            lat: Array.isArray(coords[0]) ? coords[0][1] : coords[1],
            lng: Array.isArray(coords[0]) ? coords[0][0] : coords[0],
            severity: props.area_ha > 10000 ? SEVERITY.CRITICAL : props.area_ha > 1000 ? SEVERITY.HIGH : SEVERITY.MODERATE,
            magnitude: props.area_ha || null,
            title: `Wildfire - ${props.country || 'Unknown'}`,
            description: `Area: ${props.area_ha || 'N/A'} ha | ${props.country || 'Unknown'}`,
            time: props.firedate || props.initialdate,
            source: 'GWIS',
            sourceUrl: 'https://gwis.jrc.ec.europa.eu/',
            raw: feature,
            extra: {
                area_ha: props.area_ha,
                country: props.country
            }
        });
    });
}

/**
 * Determine fire severity based on confidence and FRP
 */
function getFireSeverity(confidence, frp) {
    if (frp && frp > 100) return SEVERITY.CRITICAL;
    if (confidence >= 90 || (frp && frp > 50)) return SEVERITY.HIGH;
    if (confidence >= 70 || (frp && frp > 20)) return SEVERITY.MODERATE;
    if (confidence >= 40) return SEVERITY.LOW;
    return SEVERITY.MINIMAL;
}
