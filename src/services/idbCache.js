/**
 * IndexedDB Cache
 * Disaster event'lerini tarayıcıda saklar.
 * Her tip ayrı store — silme/güncelleme bağımsız.
 */

const DB_NAME = 'mhews-cache';
const DB_VERSION = 1;
const META_STORE = 'meta';

const EVENT_STORES = [
  'earthquake', 'wildfire', 'flood', 'drought',
  'food_security', 'tsunami', 'cyclone', 'volcano', 'epidemic',
];

// Tip başına tutulacak maksimum kayıt
const MAX_PER_TYPE = {
  earthquake: 30000,
  wildfire: 10000,
  flood: 10000,
  drought: 10000,
  food_security: 10000,
  tsunami: 10000,
  cyclone: 10000,
  volcano: 10000,
  epidemic: 10000,
};

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const name of EVENT_STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, {keyPath: 'id'});
          store.createIndex('time', 'time', {unique: false});
        }
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, {keyPath: 'key'});
      }
    };

    req.onsuccess = (e) => {_db = e.target.result; resolve(_db);};
    req.onerror = () => reject(req.error);
  });
}

/** Tüm event tiplerini IDB'den oku — harita için */
export async function readAllFromCache() {
  const db = await openDB();
  const result = {};

  await Promise.all(EVENT_STORES.map(type => new Promise((resolve, reject) => {
    const tx = db.transaction(type, 'readonly');
    const req = tx.objectStore(type).getAll();
    req.onsuccess = () => {result[type] = req.result ?? []; resolve();};
    req.onerror = () => {result[type] = []; resolve();};
  })));

  return result;
}

/** Event listesini IDB'ye yaz, limit aşarsa eskiyi sil */
export async function writeToCache(type, events) {
  if (!EVENT_STORES.includes(type)) return;
  const db = await openDB();
  const max = MAX_PER_TYPE[type] ?? 200;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(type, 'readwrite');
    const store = tx.objectStore(type);

    // Önce mevcut sayıyı al, fazlasını sil
    const countReq = store.count();
    countReq.onsuccess = () => {
      const current = countReq.result;
      const toDelete = current + events.length - max;

      if (toDelete > 0) {
        // En eski kayıtları sil (time index'ten)
        const idx = store.index('time');
        const cursor = idx.openCursor();
        let deleted = 0;
        cursor.onsuccess = (e) => {
          const c = e.target.result;
          if (c && deleted < toDelete) {
            c.delete();
            deleted++;
            c.continue();
          }
        };
      }

      // Yeni eventleri yaz
      for (const ev of events) {
        try {
          const cleanEv = JSON.parse(JSON.stringify(ev));
          store.put(cleanEv);
        } catch (err) {
          console.warn('IDB put error for event', ev.id, err);
        }
      }
    };

    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

/** Son fetch zamanını oku */
export async function getLastFetchAt(type) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(`lastFetch_${type}`);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => resolve(null);
  });
}

/** Son fetch zamanını yaz */
export async function setLastFetchAt(type, isoString) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({key: `lastFetch_${type}`, value: isoString});
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

/** Cache'i tamamen temizle (debug/reset için) */
export async function clearCache() {
  const db = await openDB();
  const tx = db.transaction([...EVENT_STORES, META_STORE], 'readwrite');
  for (const name of [...EVENT_STORES, META_STORE]) {
    tx.objectStore(name).clear();
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}
