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
    // Temizleme: 1 günden eski kayıtları sil. unref(): server process zaten
    // HTTP/WS bağlantılarıyla ayakta kalıyor, bu timer'ın kendisi process'i
    // canlı tutmasına gerek yok — unref'siz haliyle `node --test` bu interval
    // yüzünden asla çıkmıyordu (her test dosyası kendi Deduplicator'ını
    // kurup asla temizlemiyor).
    setInterval(() => this.cleanup(), 60 * 60 * 1000).unref();
  }

  /**
   * Yeni bir olay daha önce görülen bir olayla eşleşiyor mu?
   * @returns {object|null} eşleşen mevcut event (aynı fiziksel olay,
   *   muhtemelen farklı kaynaktan) — yoksa null. Eskiden sadece boolean
   *   dönüyordu; artık eşleşen kaydı döndürüyor ki çağıran taraf
   *   mergeSource() ile kaynak bilgisini (source/magnitude/sourceUrl)
   *   atmak yerine biriktirebilsin (spec: çoklu ajans rozetleri, 2026-08-03).
   */
  findMatch(event) {
    // Aynı ID → kesin duplicate (kendi kaydı zaten store'da)
    if (this.store.has(event.id)) return this.store.get(event.id);

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

      return existing; // Duplicate!
    }

    return null;
  }

  /**
   * Olayı kaydet (duplicate değilse çağrılır) — contributingSources'ı
   * kendi tek kaynağıyla başlatır, mergeSource() sonradan başka
   * ajanslar geldikçe bu diziye ekler.
   */
  add(event) {
    if (!event.contributingSources) {
      event.contributingSources = [
        { source: event.source, magnitude: event.magnitude, sourceUrl: event.sourceUrl, receivedAt: event.receivedAt },
      ];
    }
    this.store.set(event.id, event);
  }

  /**
   * Aynı fiziksel olayı bildiren ikinci (üçüncü, ...) bir kaynağın bilgisini
   * mevcut kayda ekler — atmak yerine biriktirir. Aynı source adı zaten
   * varsa tekrar eklemez (idempotent: bir kaynağın WS'i yeniden bağlanıp
   * aynı olayı tekrar gönderirse rozet çiftlenmesin).
   */
  mergeSource(existing, incoming) {
    if (!existing.contributingSources) {
      existing.contributingSources = [
        { source: existing.source, magnitude: existing.magnitude, sourceUrl: existing.sourceUrl, receivedAt: existing.receivedAt },
      ];
    }
    const alreadyHasSource = existing.contributingSources.some((s) => s.source === incoming.source);
    if (!alreadyHasSource) {
      existing.contributingSources.push({
        source: incoming.source,
        magnitude: incoming.magnitude,
        sourceUrl: incoming.sourceUrl,
        receivedAt: incoming.receivedAt,
      });
    }
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
