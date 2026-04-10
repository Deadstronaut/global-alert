/**
 * P-Wave Early Warning System
 * Deprem anında S-dalgasının nüfuslu merkezlere varış süresini hesaplar
 * ve "X saniye kaldı" erken uyarı mesajları üretir
 *
 * P-dalgası: ~6.0 km/s (yer kabuğu)
 * S-dalgası: ~3.5 km/s (yıkıcı olan)
 * Halk uyarısı eşiği: M4.0+
 */

const P_WAVE_SPEED = 6.0;    // km/s
const S_WAVE_SPEED = 3.5;    // km/s
const ALERT_THRESHOLD_MAG = 4.0;
const MAX_ALERT_RADIUS_KM = 500; // 500km ötesine uyarı gönderme

// Önemli şehirler (genişletilebilir)
const MAJOR_CITIES = [
  { name: 'Istanbul',      lat: 41.015, lng: 28.979,  pop: 15000000 },
  { name: 'Ankara',        lat: 39.920, lng: 32.854,  pop: 5700000  },
  { name: 'İzmir',         lat: 38.423, lng: 27.143,  pop: 4400000  },
  { name: 'Bursa',         lat: 40.183, lng: 29.067,  pop: 3100000  },
  { name: 'Adana',         lat: 37.000, lng: 35.321,  pop: 2200000  },
  { name: 'Gaziantep',     lat: 37.066, lng: 37.378,  pop: 2100000  },
  { name: 'Konya',         lat: 37.871, lng: 32.485,  pop: 2300000  },
  { name: 'Antalya',       lat: 36.897, lng: 30.713,  pop: 2500000  },
  { name: 'Athens',        lat: 37.983, lng: 23.728,  pop: 3700000  },
  { name: 'Sofia',         lat: 42.697, lng: 23.322,  pop: 1300000  },
  { name: 'Bucharest',     lat: 44.432, lng: 26.103,  pop: 2000000  },
  { name: 'Tbilisi',       lat: 41.694, lng: 44.834,  pop: 1150000  },
  { name: 'Baku',          lat: 40.409, lng: 49.867,  pop: 2300000  },
  { name: 'Tehran',        lat: 35.689, lng: 51.389,  pop: 9300000  },
  { name: 'Cairo',         lat: 30.033, lng: 31.233,  pop: 21000000 },
  { name: 'Rome',          lat: 41.902, lng: 12.496,  pop: 4200000  },
  { name: 'Los Angeles',   lat: 34.052, lng: -118.24, pop: 13000000 },
  { name: 'San Francisco', lat: 37.774, lng: -122.41, pop: 4700000  },
  { name: 'Tokyo',         lat: 35.689, lng: 139.69,  pop: 37000000 },
  { name: 'Jakarta',       lat: -6.208, lng: 106.84,  pop: 10600000 },
  { name: 'Mexico City',   lat: 19.432, lng: -99.133, pop: 21600000 },
  { name: 'Lima',          lat: -12.04, lng: -77.03,  pop: 10750000 },
  { name: 'Kathmandu',     lat: 27.700, lng: 85.318,  pop: 1000000  },
  { name: 'Islamabad',     lat: 33.729, lng: 73.094,  pop: 1100000  },
  { name: 'Karachi',       lat: 24.861, lng: 67.010,  pop: 14900000 },
];

/**
 * Deprem için erken uyarı hesapla
 * @param {Object} event - Normalized earthquake event
 * @returns {Object|null} earlyWarning objesi veya null
 */
export function calculateEarlyWarning(event) {
  if (event.type !== 'earthquake') return null;
  if ((event.magnitude || 0) < ALERT_THRESHOLD_MAG) return null;
  if (!event.lat || !event.lng) return null;

  const depth = event.depth || 10; // km
  const detectionTime = new Date(event.time);
  const now = new Date();
  const elapsedSec = Math.max(0, (now - detectionTime) / 1000);

  const alerts = [];

  for (const city of MAJOR_CITIES) {
    const surfaceDistKm = haversineKm(event.lat, event.lng, city.lat, city.lng);
    if (surfaceDistKm > MAX_ALERT_RADIUS_KM) continue;

    // Hiposentral mesafe (derinlik dahil)
    const hypoDist = Math.sqrt(surfaceDistKm ** 2 + depth ** 2);

    // P ve S dalga varış süreleri (saniye cinsinden)
    const pArrivalSec = hypoDist / P_WAVE_SPEED;
    const sArrivalSec = hypoDist / S_WAVE_SPEED;

    // Tespitten bu yana geçen süreyi çıkar
    const sRemainingMs = Math.round((sArrivalSec - elapsedSec) * 1000);

    // Tahmini hasar alanı (basit azalım formülü)
    const estimatedIntensity = estimateIntensity(event.magnitude, surfaceDistKm, depth);

    alerts.push({
      city: city.name,
      lat: city.lat,
      lng: city.lng,
      population: city.pop,
      distanceKm: Math.round(surfaceDistKm),
      pArrivalSec: Math.round(pArrivalSec),
      sArrivalSec: Math.round(sArrivalSec),
      sRemainingMs,          // negatifse S-dalgası geçmiş
      warningTimeMs: Math.max(0, sRemainingMs),
      intensity: estimatedIntensity, // 0-12 MMI
      hasWarningTime: sRemainingMs > 5000, // 5 saniyeden fazla süre var mı?
    });
  }

  // En yakın şehirler önce
  alerts.sort((a, b) => a.distanceKm - b.distanceKm);

  if (alerts.length === 0) return null;

  return {
    eventId: event.id,
    earthquake: {
      magnitude: event.magnitude,
      depth,
      lat: event.lat,
      lng: event.lng,
      time: event.time,
    },
    maxWarningTimeSec: Math.round(Math.max(...alerts.map(a => a.warningTimeMs)) / 1000),
    affectedCities: alerts,
    // Tahmini etkilenen nüfus
    estimatedAffectedPop: alerts
      .filter(a => a.intensity >= 5) // MMI V+
      .reduce((sum, a) => sum + a.population, 0),
  };
}

/**
 * Basit yoğunluk tahmini (Modified Mercalli Intensity - MMI)
 * Attenuation relation (basitleştirilmiş)
 */
function estimateIntensity(magnitude, distKm, depth) {
  if (distKm < 1) distKm = 1;
  const hypoDist = Math.sqrt(distKm ** 2 + depth ** 2);
  // Empirical attenuation (Wald et al. 1999 basitleştirilmiş)
  const mmi = 3.66 * Math.log10(magnitude) - 1.66 * Math.log10(hypoDist) + 4.511;
  return Math.min(12, Math.max(0, Math.round(mmi)));
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return (deg * Math.PI) / 180; }
