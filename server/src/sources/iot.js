/**
 * IoT / HTTP Sensor Source Adapter
 * Herhangi bir HTTP(S) endpoint'ten sensör verisi çeker.
 * OGC SensorThings API, custom JSON endpoint, veya düz array destekler.
 *
 * Kullanım:
 *   import { startIoTSource } from './iot.js'
 *   startIoTSource(handleEvent, {
 *     name: 'Custom Sensor Network',
 *     url: 'https://sensors.example.gov/api/readings',
 *     type: 'earthquake',
 *     intervalMs: 30_000,
 *     headers: { 'X-API-Key': process.env.SENSOR_KEY },
 *     transform: (raw) => ({ lat, lng, magnitude, title, ... })
 *   })
 */

import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

/**
 * OGC SensorThings API transformer
 * Spec: https://docs.ogc.org/is/18-088/18-088.html
 */
function transformSensorThings(data, type) {
  const observations = data.value ?? data;
  if (!Array.isArray(observations)) return [];

  return observations.map((obs, i) => {
    const loc = obs.FeatureOfInterest?.feature?.coordinates;
    return {
      id:        `sensorthings-${obs['@iot.id'] ?? i}`,
      type,
      lat:       loc?.[1] ?? 0,
      lng:       loc?.[0] ?? 0,
      magnitude: obs.result ?? null,
      title:     obs.Datastream?.name ?? `Sensor Reading`,
      description: `Observation: ${obs.result ?? 'N/A'} | ${obs.phenomenonTime ?? ''}`,
      time:      obs.phenomenonTime ?? obs.resultTime,
      source:    obs.Datastream?.unitOfMeasurement?.name ?? 'IoT Sensor',
      sourceUrl: '',
      extra:     { iotId: obs['@iot.id'], unitOfMeasurement: obs.Datastream?.unitOfMeasurement },
    };
  });
}

/**
 * Start polling an HTTP JSON endpoint.
 *
 * @param {Function} onEvent   - handleEvent callback
 * @param {Object}   config
 * @param {string}   config.name        - source display name
 * @param {string}   config.url         - JSON endpoint URL
 * @param {string}   config.type        - disaster type
 * @param {number}   [config.intervalMs=60_000]
 * @param {Object}   [config.headers]   - additional request headers
 * @param {Function} [config.transform] - (rawData) => Array of partial events
 * @param {string}   [config.apiFormat] - 'sensorthings' | 'array' | 'custom' (default: 'array')
 * @returns {Function} stop()
 */
export function startIoTSource(onEvent, {
  name,
  url,
  type,
  intervalMs = 60_000,
  headers = {},
  transform,
  apiFormat = 'array',
}) {
  async function poll() {
    try {
      const res = await fetch(url, {
        headers: {
          'Accept':     'application/json',
          'User-Agent': 'MHEWS/1.0 (Global Alert System)',
          ...headers,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      let rawEvents;
      if (transform) {
        rawEvents = transform(data);
      } else if (apiFormat === 'sensorthings') {
        rawEvents = transformSensorThings(data, type);
      } else {
        rawEvents = Array.isArray(data) ? data : (data.data ?? data.results ?? data.features ?? []);
      }

      let count = 0;
      for (const raw of rawEvents) {
        try {
          const event = normalize({ type, ...raw });
          if (event.lat && event.lng) { onEvent(event); count++; }
        } catch (err) {
          console.warn(`[IoT:${name}] Normalize failed:`, err.message);
        }
      }

      reportStatus(name, 200);
      if (count > 0) console.log(`[IoT:${name}] ${count} events`);
    } catch (err) {
      reportStatus(name, 0);
      console.warn(`[IoT:${name}] Poll failed: ${err.message}`);
    }
  }

  poll();
  const timer = setInterval(poll, intervalMs);
  return () => clearInterval(timer);
}
