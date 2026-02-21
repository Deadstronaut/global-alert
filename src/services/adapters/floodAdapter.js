import {createDisasterEvent, DISASTER_TYPE, SEVERITY} from './DisasterEvent.js';

/**
 * Flood Adapter
 * Normalizes data from OpenWeatherMap, ReliefWeb, and GloFAS.
 */

/**
 * Parse OpenWeatherMap weather alerts
 * @param {Object} data - OWM response with alerts
 * @returns {Array<DisasterEvent>}
 */
export function parseOpenWeatherAlerts(data) {
    if (!data?.alerts) return [];

    return data.alerts
        .filter(alert => isFloodRelated(alert.event))
        .map((alert, index) => {
            return createDisasterEvent({
                id: `owm-${data.lat}-${data.lon}-${index}`,
                type: DISASTER_TYPE.FLOOD,
                lat: data.lat,
                lng: data.lon,
                severity: getAlertSeverity(alert.event),
                magnitude: null,
                title: alert.event || 'Weather Alert',
                description: (alert.description || '').substring(0, 300),
                time: alert.start ? new Date(alert.start * 1000).toISOString() : new Date().toISOString(),
                source: `OpenWeatherMap (${alert.sender_name || 'OWM'})`,
                sourceUrl: '',
                raw: alert,
                extra: {
                    sender: alert.sender_name,
                    end: alert.end ? new Date(alert.end * 1000).toISOString() : null,
                    tags: alert.tags
                }
            });
        });
}

/**
 * Parse ReliefWeb disaster reports
 * @param {Object} data - ReliefWeb API response
 * @returns {Array<DisasterEvent>}
 */
export function parseReliefWeb(data) {
    if (!data?.data) return [];

    return data.data
        .filter(report => {
            const types = report.fields?.type || [];
            return types.some(t => t.name?.toLowerCase().includes('flood'));
        })
        .map(report => {
            const fields = report.fields;
            const country = fields.country?.[0] || {};
            const lat = country.location?.lat || 0;
            const lng = country.location?.lon || 0;

            return createDisasterEvent({
                id: `rw-${report.id}`,
                type: DISASTER_TYPE.FLOOD,
                lat,
                lng,
                severity: getReliefWebSeverity(fields.status),
                magnitude: null,
                title: fields.title || 'Flood Report',
                description: (fields.body || '').substring(0, 300),
                time: fields.date?.created,
                source: 'ReliefWeb',
                sourceUrl: fields.url_alias || `https://reliefweb.int/node/${report.id}`,
                raw: report,
                extra: {
                    country: country.name,
                    status: fields.status,
                    disasterTypes: fields.type?.map(t => t.name)
                }
            });
        });
}

/**
 * Parse GloFAS (Global Flood Awareness System) data
 * @param {Object} data - GloFAS response
 * @returns {Array<DisasterEvent>}
 */
export function parseGloFAS(data) {
    if (!Array.isArray(data)) return [];

    return data.map(point => {
        return createDisasterEvent({
            id: `glofas-${point.id || `${point.lat}-${point.lon}`}`,
            type: DISASTER_TYPE.FLOOD,
            lat: point.lat,
            lng: point.lon,
            severity: getGloFASSeverity(point.alert_level),
            magnitude: point.discharge || null,
            title: `Flood Alert - ${point.basin || 'Unknown Basin'}`,
            description: `Alert Level: ${point.alert_level || 'N/A'} | Discharge: ${point.discharge || 'N/A'} m³/s`,
            time: point.time,
            source: 'GloFAS/Copernicus',
            sourceUrl: 'https://www.globalfloods.eu/',
            raw: point,
            extra: {
                alertLevel: point.alert_level,
                discharge: point.discharge,
                basin: point.basin
            }
        });
    });
}

function isFloodRelated(eventName) {
    if (!eventName) return false;
    const lower = eventName.toLowerCase();
    return lower.includes('flood') || lower.includes('rain') ||
        lower.includes('storm') || lower.includes('hurricane') ||
        lower.includes('typhoon') || lower.includes('cyclone') ||
        lower.includes('tsunami');
}

function getAlertSeverity(event) {
    if (!event) return SEVERITY.MODERATE;
    const lower = event.toLowerCase();
    if (lower.includes('extreme') || lower.includes('hurricane') || lower.includes('tsunami')) return SEVERITY.CRITICAL;
    if (lower.includes('severe') || lower.includes('warning')) return SEVERITY.HIGH;
    if (lower.includes('watch') || lower.includes('advisory')) return SEVERITY.MODERATE;
    return SEVERITY.LOW;
}

function getReliefWebSeverity(status) {
    if (status === 'alert') return SEVERITY.CRITICAL;
    if (status === 'ongoing') return SEVERITY.HIGH;
    return SEVERITY.MODERATE;
}

function getGloFASSeverity(alertLevel) {
    if (alertLevel >= 3) return SEVERITY.CRITICAL;
    if (alertLevel >= 2) return SEVERITY.HIGH;
    if (alertLevel >= 1) return SEVERITY.MODERATE;
    return SEVERITY.LOW;
}
