import {createDisasterEvent, DISASTER_TYPE, SEVERITY} from './DisasterEvent.js';

/**
 * Drought Adapter
 * Normalizes data from Copernicus GDO, FEWS NET, and US Drought Monitor.
 */

/**
 * Parse Copernicus GDO (Global Drought Observatory) data
 * @param {Object} data - GDO response
 * @returns {Array<DisasterEvent>}
 */
export function parseGDO(data) {
    if (!Array.isArray(data)) return [];

    return data.map(record => {
        const spi = record.spi || record.spei || 0;

        return createDisasterEvent({
            id: `gdo-${record.id || `${record.lat}-${record.lon}`}`,
            type: DISASTER_TYPE.DROUGHT,
            lat: record.lat,
            lng: record.lon,
            severity: getDroughtSeverityBySPI(spi),
            magnitude: Math.abs(spi),
            title: `Drought - ${record.region || record.country || 'Unknown'}`,
            description: `SPI: ${spi.toFixed(2)} | ${getDroughtCategory(spi)}`,
            time: record.time || record.date,
            source: 'Copernicus GDO',
            sourceUrl: 'https://edo.jrc.ec.europa.eu/gdo/',
            raw: record,
            extra: {
                spi: spi,
                spei: record.spei,
                region: record.region,
                country: record.country,
                category: getDroughtCategory(spi)
            }
        });
    });
}

/**
 * Parse FEWS NET (Famine Early Warning Systems Network) data
 * @param {Object} data - FEWS NET response
 * @returns {Array<DisasterEvent>}
 */
export function parseFEWSNET(data) {
    if (!data?.features) return [];

    return data.features.map(feature => {
        const props = feature.properties;
        const coords = feature.geometry?.coordinates;
        const lat = coords ? (Array.isArray(coords[0]) ? coords[0][1] : coords[1]) : 0;
        const lng = coords ? (Array.isArray(coords[0]) ? coords[0][0] : coords[0]) : 0;

        return createDisasterEvent({
            id: `fewsnet-${props.id || feature.id}`,
            type: DISASTER_TYPE.DROUGHT,
            lat,
            lng,
            severity: getFEWSSeverity(props.ipc_phase || props.CS),
            magnitude: props.ipc_phase || props.CS || null,
            title: `Food Insecurity - ${props.country || props.ADMIN0 || 'Unknown'}`,
            description: `IPC Phase: ${props.ipc_phase || props.CS || 'N/A'} | ${props.country || props.ADMIN0 || 'Unknown'}`,
            time: props.date || props.period_date,
            source: 'FEWS NET',
            sourceUrl: 'https://fews.net/',
            raw: feature,
            extra: {
                ipcPhase: props.ipc_phase || props.CS,
                country: props.country || props.ADMIN0,
                region: props.ADMIN1
            }
        });
    });
}

/**
 * Parse US Drought Monitor data
 * @param {Object} data - USDM response
 * @returns {Array<DisasterEvent>}
 */
export function parseUSDM(data) {
    if (!Array.isArray(data)) return [];

    return data.map(record => {
        return createDisasterEvent({
            id: `usdm-${record.FIPS || record.id}`,
            type: DISASTER_TYPE.DROUGHT,
            lat: record.lat || 0,
            lng: record.lon || 0,
            severity: getUSDMSeverity(record.DM || record.d_category),
            magnitude: record.DM || record.d_category || null,
            title: `Drought - ${record.state || record.county || 'US'}`,
            description: `Category: D${record.DM || record.d_category || '?'} | ${record.state || ''}`,
            time: record.releaseDate || record.date,
            source: 'US Drought Monitor',
            sourceUrl: 'https://droughtmonitor.unl.edu/',
            raw: record,
            extra: {
                category: record.DM || record.d_category,
                state: record.state,
                county: record.county,
                area: record.area
            }
        });
    });
}

/**
 * SPI (Standardized Precipitation Index) classification
 */
function getDroughtSeverityBySPI(spi) {
    if (spi <= -2.0) return SEVERITY.CRITICAL;
    if (spi <= -1.5) return SEVERITY.HIGH;
    if (spi <= -1.0) return SEVERITY.MODERATE;
    if (spi <= -0.5) return SEVERITY.LOW;
    return SEVERITY.MINIMAL;
}

function getDroughtCategory(spi) {
    if (spi <= -2.0) return 'Exceptional Drought';
    if (spi <= -1.5) return 'Extreme Drought';
    if (spi <= -1.0) return 'Severe Drought';
    if (spi <= -0.5) return 'Moderate Drought';
    return 'Abnormally Dry';
}

function getFEWSSeverity(ipcPhase) {
    if (ipcPhase >= 4) return SEVERITY.CRITICAL;
    if (ipcPhase >= 3) return SEVERITY.HIGH;
    if (ipcPhase >= 2) return SEVERITY.MODERATE;
    return SEVERITY.LOW;
}

function getUSDMSeverity(dm) {
    if (dm >= 4) return SEVERITY.CRITICAL;
    if (dm >= 3) return SEVERITY.HIGH;
    if (dm >= 2) return SEVERITY.MODERATE;
    if (dm >= 1) return SEVERITY.LOW;
    return SEVERITY.MINIMAL;
}
