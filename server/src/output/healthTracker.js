/**
 * Source Health Tracker
 * Her kaynak HTTP durumunu buraya raporlar
 * { code: 200, at: timestamp, eventCount: n }
 */

export const sourceHealth = {};
const listeners = [];

/**
 * @param {string} name  - kaynak adı (USGS, AFAD, ...)
 * @param {number} code  - HTTP status kodu (200, 400, 401, 404, 0=bağlantı yok)
 * @param {number} [count] - bu poll'da gelen event sayısı
 */
export function reportStatus(name, code, count = 0) {
  sourceHealth[name] = { code, at: Date.now(), count };
  for (const cb of listeners) cb({ ...sourceHealth });
}

export function onHealthChange(cb) {
  listeners.push(cb);
}
