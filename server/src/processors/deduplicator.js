/**
 * Deduplicator - Aynı olayın farklı kaynaklardan gelmesini engeller
 * Proximity (yakınlık) + zaman + büyüklük benzerliğine göre çalışır
 */

const RADIUS_KM = {
  earthquake: 25,   // 25km içindeki aynı büyüklükteki depremler = aynı olay
  wildfire: 5,
  flood: 30,
  drought: 50,
  food_security: 100,
  tsunami: 50,
  cyclone: 100,
  volcano: 10,
  disaster: 20,
};

const TIME_WINDOW_MS = {
  earthquake: 5 * 60 * 1000,   // 5 dakika
  wildfire: 30 * 60 * 1000,    // 30 dakika
  flood: 60 * 60 * 1000,       // 1 saat
  drought: 24 * 60 * 60 * 1000, // 1 gün
  food_security: 7 * 24 * 60 * 60 * 1000, // 1 hafta
  tsunami: 30 * 60 * 1000,
  cyclone: 6 * 60 * 60 * 1000,
  volcano: 60 * 60 * 1000,
  disaster: 60 * 60 * 1000,
};

export class Deduplicator {
  constructor() {
    // Map<id, event> - son görülen olaylar
    this.store = new Map();
    // Temizleme: 1 günden eski kayıtları sil
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Yeni bir olay duplicate mı?
   * @returns {boolean} true = duplicate, atla
   */
  isDuplicate(event) {
    // Aynı ID → kesin duplicate
    if (this.store.has(event.id)) return true;

    const type = event.type;
    const radiusKm = RADIUS_KM[type] || 20;
    const timeWindowMs = TIME_WINDOW_MS[type] || 60 * 60 * 1000;
    const eventTime = new Date(event.time).getTime();

    for (const existing of this.store.values()) {
      if (existing.type !== type) continue;

      const existingTime = new Date(existing.time).getTime();
      const timeDiff = Math.abs(eventTime - existingTime);
      if (timeDiff > timeWindowMs) continue;

      const dist = haversineKm(event.lat, event.lng, existing.lat, existing.lng);
      if (dist > radiusKm) continue;

      // Büyüklük benzerliği kontrolü (deprem için)
      if (type === 'earthquake' && event.magnitude !== null && existing.magnitude !== null) {
        const magDiff = Math.abs(event.magnitude - existing.magnitude);
        if (magDiff > 0.5) continue; // Farklı büyüklük = farklı olay
      }

      return true; // Duplicate!
    }

    return false;
  }

  /**
   * Olayı kaydet (duplicate değilse çağrılır)
   */
  add(event) {
    this.store.set(event.id, event);
  }

  /**
   * 24 saatten eski kayıtları temizle
   */
  cleanup() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, event] of this.store.entries()) {
      if (new Date(event.receivedAt).getTime() < cutoff) {
        this.store.delete(id);
      }
    }
    console.log(`[Deduplicator] Store size: ${this.store.size}`);
  }
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

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
