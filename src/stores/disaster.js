/**
 * Disaster Store - WebSocket + Supabase hybrid data management
 * Live events via WebSocket (GEWS Aggregator)
 * Historical data on startup via Supabase views
 */

import {defineStore} from 'pinia';
import {ref, computed, watch} from 'vue';
import {fetchRecentDisasters, subscribeRealtime, fetchAggregatedDisasters} from '@/services/supabaseService.js';
import {readAllFromCache, writeToCache, getLastFetchAt, setLastFetchAt} from '@/services/idbCache.js';
import {useAuthStore} from '@/stores/auth.js';
import {findRegionGeometry} from '@/data/boundaries/index.js';
import {pointInGeometry} from '@/utils/pointInPolygon.js';

// ─────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────
const LS_KEY = 'ga_date_pref';

function loadDatePrefs() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveDatePrefs(prefs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch { /* quota exceeded – ignore */}
}

// Afet tipine göre maksimum tutulacak olay sayısı (bellek yönetimi)
const MAX_EVENTS = {
  earthquake: 30000,
  wildfire: 10000,
  flood: 10000,
  drought: 10000,
  food_security: 10000,
  tsunami: 10000,
  cyclone: 10000,
  volcano: 10000,
  epidemic: 10000,
  disaster: 10000,
};

export const useDisasterStore = defineStore('disaster', () => {
  // ─────────────────────────────────────────
  // State
  // ─────────────────────────────────────────
  const earthquakes = ref([]);
  const wildfires = ref([]);
  const floods = ref([]);
  const droughts = ref([]);
  const foodSecurity = ref([]);
  const tsunamis = ref([]);
  const cyclones = ref([]);
  const volcanoes = ref([]);
  const epidemics = ref([]);
  const otherDisasters = ref([]);
  const aggregatedH3Data = ref([]);

  const activeLayers = ref(new Set([
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'cyclone', 'volcano', 'epidemic', 'disaster',
    // dust_storm/heatwave/coldwave (2026-08-18) have no dedicated table —
    // their rows live inside the generic 'disaster' bucket, so 'disaster'
    // itself must stay in this Set for them to be FETCHED at all (as it
    // already was). These 3 are listed separately here only so each has
    // its own default-on entry for allEvents' per-subtype filter below —
    // toggling one off does not touch 'disaster' itself, which still needs
    // to stay on for every OTHER type that also falls into that bucket
    // (e.g. landslide_susceptibility-adjacent future additions).
    'dust_storm', 'heatwave', 'coldwave',
  ]));
  const activeSeverities = ref(new Set(['critical', 'high', 'moderate', 'low', 'minimal']));

  const isConnected = ref(false);
  const isLoading = ref(true);
  const lastUpdated = ref(null);
  // Restore from localStorage so date selection survives page refreshes
  const _prefs = loadDatePrefs();
  const startDate = ref(_prefs.startDate ?? null);
  const endDate = ref(_prefs.endDate ?? null);
  const selectedTimeRange = ref(_prefs.selectedTimeRange ?? 24); // saat
  const sourcesStatus = ref({});  // { EMSC: true, USGS: true, ... }
  const errors = ref([]);

  const minMagnitude = ref(0);    // 0–9
  const maxDepth = ref(null); // null = TÜMÜ, sayı = km

  // Ülke bbox filtresi — null = global görünüm
  const activeBbox = ref(null); // { minLat, maxLat, minLng, maxLng }

  // "Sadece bölgemi göster" — kullanıcının kendi tercihi (güvenlik kısıtlaması
  // DEĞİL, sadece view filtresi), profiles.region_code'a atanmış il/bölge
  // sınırına (varsa) göre filtreler. Sınır dosyası (örn. tr-provinces.json,
  // ~1.3MB) sadece bu kullanıcının gerçekten bir bölgesi VARSA, ihtiyaç
  // anında (lazy) yükleniyor — her ziyaretçi için baştan yüklenmiyor.
  const showOnlyMyRegion = ref(false);
  const myRegionGeometry = ref(null);

  async function loadMyRegionGeometry() {
    const auth = useAuthStore();
    const cc = auth.countryCode?.toLowerCase();
    const regionName = auth.regionCode;
    if (!cc || !regionName) { myRegionGeometry.value = null; return; }
    myRegionGeometry.value = await findRegionGeometry(cc, regionName);
  }

  // Session'daki ülke/bölge değiştikçe (login/logout/rol güncelleme sonrası)
  // sınır dosyasını yeniden değerlendir — sadece gerçekten bir region_code
  // atanmışsa indirir, aksi halde hiç network isteği yapmaz.
  watch(
    () => {
      const auth = useAuthStore();
      return [auth.countryCode, auth.regionCode];
    },
    () => { loadMyRegionGeometry(); },
    { immediate: true },
  );

  // Erken uyarılar
  const earlyWarnings = ref([]);   // Son 10 erken uyarı
  const activeWarning = ref(null); // Şu an gösterilen uyarı

  // ─────────────────────────────────────────
  // Tip → ref eşlemesi
  // ─────────────────────────────────────────
  const storeMap = computed(() => ({
    earthquake: earthquakes,
    wildfire: wildfires,
    flood: floods,
    drought: droughts,
    food_security: foodSecurity,
    tsunami: tsunamis,
    cyclone: cyclones,
    volcano: volcanoes,
    epidemic: epidemics,
    disaster: otherDisasters,
  }));

  // Hazard types with no dedicated table (their rows live inside the
  // generic 'disaster' bucket, otherDisasters) but that DO get their own
  // toggleable chip in HazardTypeNav.vue — unlike every other type in that
  // bucket (e.g. a future landslide_susceptibility-adjacent addition),
  // which stays permanently visible since it has no chip of its own.
  const DISASTER_BUCKET_SUBTYPES = new Set(['dust_storm', 'heatwave', 'coldwave']);

  // ─────────────────────────────────────────
  // Computed
  // ─────────────────────────────────────────
  const allEvents = computed(() => {
    const rawEvents = [];
    for (const type of activeLayers.value) {
      // dust_storm/heatwave/coldwave have no dedicated storeMap entry —
      // their rows live inside 'disaster' (otherDisasters) and are handled
      // by that branch below via DISASTER_BUCKET_SUBTYPES. They're still
      // listed in activeLayers as their OWN toggle entries so
      // isLayerActive()/toggleLayer() have something to flip; this loop
      // just has nothing to fetch for them directly.
      if (DISASTER_BUCKET_SUBTYPES.has(type)) continue;
      const store = storeMap.value[type];
      if (!store) continue;
      if (type === 'disaster') {
        // The generic bucket can hold several real hazard types mixed
        // together — only sub-filter the ones that have their own
        // independent toggle (DISASTER_BUCKET_SUBTYPES); everything else
        // in this bucket follows 'disaster' itself, same as before.
        rawEvents.push(...store.value.filter(
          (e) => !DISASTER_BUCKET_SUBTYPES.has(e.type) || activeLayers.value.has(e.type),
        ));
      } else {
        rawEvents.push(...store.value);
      }
    }

    // 1. Zaman aralığı sınırlarını hesapla
    const useDateRange = !!(startDate.value || endDate.value);
    const from = useDateRange ? new Date(startDate.value).getTime() : (Date.now() - selectedTimeRange.value * 3_600_000);
    const to   = useDateRange ? (endDate.value ? new Date(endDate.value).getTime() : Infinity) : Infinity;

    // 2. Temel filtre + zaman filtresi birlikte (severity HARİÇ — dedup sonrası uygulanır)
    // Severity filtresini dedup'tan önce uygularsak, yüksek-severity olayları düşük-severity
    // aynı lokasyondaki olayları "yutamaz" ve filtre sonuçları tutarsız olur.
    const status = sourcesStatus.value;
    const bbox = activeBbox.value;
    const filtered = rawEvents.filter(e => {
      if (minMagnitude.value > 0 && (e.magnitude == null || e.magnitude < minMagnitude.value)) return false;
      if (maxDepth.value !== null && e.depth != null && e.depth > maxDepth.value) return false;
      if (status[(e.source || 'Unknown')] === false) return false;
      if (bbox) {
        const lat = Number(e.lat);
        const lng = Number(e.lng);
        if (lat < bbox.minLat || lat > bbox.maxLat || lng < bbox.minLng || lng > bbox.maxLng) return false;
      }
      if (showOnlyMyRegion.value && myRegionGeometry.value) {
        if (!pointInGeometry(Number(e.lat), Number(e.lng), myRegionGeometry.value)) return false;
      }

      const t = new Date(e.time || e.created_at).getTime();
      if (isNaN(t)) return true;
      return t >= from && t <= to;
    });

    // 3. Dedup — larger magnitude first; if equal magnitude, prefer source priority
    // Tight params: only remove events that are almost certainly the same physical earthquake
    // (same location ±0.2°, same time ±20min, same magnitude ±0.3)
    const WINDOW_MS = 20 * 60 * 1000;
    const DISTANCE_SQ = 0.04;   // 0.2° ≈ 22 km
    const MAG_TOLERANCE = 0.3;  // agencies typically agree within 0.2-0.3 for same event

    // Source Priority Map (higher number = higher priority)
    const SOURCE_PRIORITY = {
      'EMSC': 100,
      'USGS': 90,
      'Kandilli': 80,
      'AFAD': 75,
      'GEOFON': 60,
      'GDACS': 50
    };

    filtered.sort((a, b) => {
      // 1. Magnitude priority
      const md = (b.magnitude || 0) - (a.magnitude || 0);
      if (md !== 0) return md;
      
      // 2. Source priority
      const pa = SOURCE_PRIORITY[a.source] || 0;
      const pb = SOURCE_PRIORITY[b.source] || 0;
      if (pa !== pb) return pb - pa;

      // 3. Time priority (earlier first)
      return (new Date(a.time || a.created_at).getTime() || 0) -
             (new Date(b.time || b.created_at).getTime() || 0);
    });

    // Zaman bucket'ı → event listesi (hızlı arama için)
    const timeIdx = new Map();
    const addIdx = (ev, t) => {
      const b = Math.floor(t / WINDOW_MS);
      if (!timeIdx.has(b)) timeIdx.set(b, []);
      timeIdx.get(b).push({ ev, t });
    };

    const deduped = [];
    for (const event of filtered) {
      const t = new Date(event.time || event.created_at).getTime();
      if (isNaN(t)) { deduped.push(event); continue; }

      const eLat = Number(event.lat || 0);
      const eLng = Number(event.lng || 0);
      const bucket = Math.floor(t / WINDOW_MS);
      let isDuplicate = false;

      outer:
      for (const b of [bucket - 1, bucket, bucket + 1]) {
        for (const { ev: ex, t: tEx } of (timeIdx.get(b) || [])) {
          if (Math.abs(t - tEx) > WINDOW_MS) continue;
          if (ex.type !== event.type) continue;
          const dLat = Number(ex.lat || 0) - eLat;
          const dLng = Number(ex.lng || 0) - eLng;
          if (dLat * dLat + dLng * dLng > DISTANCE_SQ) continue;
          if (event.type === 'earthquake' && ex.magnitude != null && event.magnitude != null) {
            if (Math.abs(Number(ex.magnitude) - Number(event.magnitude)) > MAG_TOLERANCE) continue;
          }
          isDuplicate = true;
          break outer;
        }
      }

      if (!isDuplicate) {
        deduped.push(event);
        addIdx(event, t);
      }
    }

    // Severity filtresi dedup'tan SONRA uygulanır → filtre seçimi ne olursa olsun
    // dedup seti tutarlı kalır, her severity grubunun olayları birbirinden bağımsız görünür.
    return deduped.filter(e => activeSeverities.value.has(e.severity));
  });

  const toggleSource = (sourceName) => {
    // Force reactivity by creating a new object reference
    const currentStatus = { ...sourcesStatus.value };
    const isCurrentlyActive = currentStatus[sourceName] !== false;
    
    currentStatus[sourceName] = !isCurrentlyActive;
    sourcesStatus.value = currentStatus;

    console.log(`[Store] Source ${sourceName} toggled to: ${!isCurrentlyActive ? 'ACTIVE' : 'INACTIVE'}`);
  };

  const totalCount = computed(() => {
    const counts = {};
    const from = startDate.value ? new Date(startDate.value).getTime() : 0;
    const to = endDate.value ? new Date(endDate.value).getTime() : Infinity;
    const cutoff = Date.now() - selectedTimeRange.value * 60 * 60 * 1000;
    const useDateRange = startDate.value || endDate.value;
    // Same bbox this computed's per-type counts were missing — matches
    // allEvents' own filter so a selected country's per-hazard badge counts
    // (e.g. "Deprem 7000") don't keep showing the GLOBAL total for the
    // active date range once a country is selected (live-testing finding,
    // user-reported).
    const bbox = activeBbox.value;

    for (const [key, store] of Object.entries(storeMap.value)) {
      // 'disaster' is the generic multi-hazard-type bucket (landslide, etc. —
      // see 20260727000000 migration) — a single count under this one key
      // would conflate unrelated hazard types and has no corresponding UI
      // slot (SidebarPanel's disasterTypes list has no 'disaster' row).
      // The aggregate total below (counts.total) already includes bucketed
      // events via allEvents, so nothing is lost by skipping it here.
      if (key === 'disaster') continue;

      counts[key] = store.value.filter(e => {
        if (bbox) {
          const lat = Number(e.lat);
          const lng = Number(e.lng);
          if (lat < bbox.minLat || lat > bbox.maxLat || lng < bbox.minLng || lng > bbox.maxLng) return false;
        }
        const t = new Date(e.time).getTime();
        return useDateRange ? (t >= from && t <= to) : (t >= cutoff);
      }).length;
    }

    counts.total = allEvents.value.length;
    return counts;
  });

  const criticalEvents = computed(() =>
    allEvents.value.filter(e => e.severity === 'critical' || e.severity === 'high')
  );

  const sourcesOnline = computed(() =>
    Object.values(sourcesStatus.value).filter(Boolean).length
  );

  /**
   * Aggregates all active events by their h3_id
   * Used for rendering the fixed hex grid / static mesh
   */
  const h3Events = computed(() => {
    const map = new Map();
    for (const event of allEvents.value) {
      // If no h3_id and no coordinates, we can't map it
      if (!event.h3_id && (event.lat == null || event.lng == null)) continue;
      
      // Use existing h3_id or a temporary key for the worker to resolve
      const key = event.h3_id || `pending:${event.lat},${event.lng}`;
      
      const existing = map.get(key) || {
        h3_id: event.h3_id,
        lat: event.lat,
        lng: event.lng,
        count: 0,
        maxSeverity: 'minimal',
        primaryType: event.type,
        typeCounts: {},
        events: []
      };
      
      existing.count++;
      existing.events.push(event);
      existing.typeCounts[event.type] = (existing.typeCounts[event.type] || 0) + 1;
      
      const severityOrder = ['minimal', 'low', 'moderate', 'high', 'critical'];
      const currentIdx = severityOrder.indexOf(existing.maxSeverity);
      const eventIdx = severityOrder.indexOf(event.severity);
      
      if (eventIdx > currentIdx) {
        existing.maxSeverity = event.severity;
        existing.primaryType = event.type;
      } else if (eventIdx === currentIdx) {
        if (existing.typeCounts[event.type] > (existing.typeCounts[existing.primaryType] || 0)) {
          existing.primaryType = event.type;
        }
      }
      
      map.set(key, existing);
    }
    return Array.from(map.values());
  });

  // ─────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────

  /**
   * Gelen single event'i store'a ekle
   */
  function addEvent(event) {
    const store = storeMap.value[event.type] || otherDisasters;
    const arr = store.value;

    // Kaynağı takip et (varsayılan açık)
    if (event.source && sourcesStatus.value[event.source] === undefined) {
      sourcesStatus.value[event.source] = true;
    }

    // Duplicate ID kontrolü
    if (arr.some(e => e.id === event.id)) return;

    // Başa ekle, tarihe göre sırala (en yeni en üstte), max sınırını koru
    const updatedArr = [event, ...arr].sort((a, b) => {
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    });
    store.value = updatedArr.slice(0, MAX_EVENTS[event.type] || 200);
    lastUpdated.value = new Date().toISOString();

    if (event.type === 'earthquake') {
      writeToCache('earthquake', earthquakes.value.slice(0, 50));
    }
  }

  /**
   * Toplu batch yükle (ilk bağlantıda)
   */
  function loadBatch(events) {
    const groups = {};
    const newSources = { ...sourcesStatus.value };

    for (const e of events) {
      if (!groups[e.type]) groups[e.type] = [];
      groups[e.type].push(e);
      if (e.source && newSources[e.source] === undefined) {
        newSources[e.source] = true;
      }
    }

    // sourcesStatus'u bir kerede güncelle (tek reaktif tetik)
    sourcesStatus.value = newSources;

    const map = storeMap.value;
    for (const [type, typeEvents] of Object.entries(groups)) {
      const store = map[type] || otherDisasters;
      const existingIds = new Set(store.value.map(e => e.id));
      const newOnes = typeEvents.filter(e => !existingIds.has(e.id));
      if (newOnes.length === 0) continue;
      store.value = [...newOnes, ...store.value]
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, MAX_EVENTS[type] || 200);
    }

    isLoading.value = false;
    lastUpdated.value = new Date().toISOString();
  }



  /**
   * Erken uyarı ekle ve 60s sonra kapat
   */
  function addEarlyWarning(warning) {
    earlyWarnings.value = [warning, ...earlyWarnings.value].slice(0, 10);
    activeWarning.value = warning;

    setTimeout(() => {
      if (activeWarning.value?.eventId === warning.eventId) {
        activeWarning.value = null;
      }
    }, 60 * 1000);
  }

  // ─────────────────────────────────────────
  // Auto-Severity Adjust based on Time Range
  // ─────────────────────────────────────────
  const getRangeDays = () => {
    if (startDate.value && endDate.value) {
      return (new Date(endDate.value).getTime() - new Date(startDate.value).getTime()) / (1000 * 3600 * 24);
    }
    return selectedTimeRange.value / 24;
  };

  // Persist date preferences to localStorage whenever they change
  watch([selectedTimeRange, startDate, endDate], ([tr, sd, ed]) => {
    saveDatePrefs({selectedTimeRange: tr, startDate: sd, endDate: ed});

    // A country-locked session already has its ENTIRE history client-side
    // (see loadCountryHistory) — re-fetching here is not just redundant,
    // it's actively harmful: get_aggregated_disasters has no bbox param, so
    // widening SÜRE to "10 Yıl"/"20 Yıl" while a country is selected sent an
    // unscoped, global multi-year aggregation request that blew the DB's
    // statement_timeout (live-testing finding, 2026-07-31 — 500 error
    // "canceling statement due to statement timeout"). Every filter stays a
    // pure client-side re-filter in this case, per loadCountryHistory's own
    // header comment (the intent b432005 documented but this watch never
    // actually honored).
    const countryHistoryLoaded = activeBbox.value != null
      && _countryHistoryLoadedForBboxKey.value === JSON.stringify(activeBbox.value);
    if (countryHistoryLoaded) return;

    const days = getRangeDays();

    // Always reload individual events so allEvents reflects the new date range
    loadFromSupabase(true);
    if (days > 3) {
      fetchAggregatedData();
    } else {
      aggregatedH3Data.value = [];
    }
  }, {immediate: false});

  // spec 069 follow-up: toggleLayer()/toggleSeverity() never refreshed
  // aggregatedH3Data — MapView.vue's hex/"Petek" signal now prefers that
  // server-aggregated data over the client-computed (and per-type-capped)
  // h3Events fallback (see buildSignalMap in MapView.vue), so a stale
  // aggregation would keep showing hex counts for whatever types/severities
  // were active the last time fetchAggregatedData() happened to run instead
  // of the user's current toggle state. Same country-history guard as the
  // date-range watch above — same reasoning (get_aggregated_disasters has no
  // bbox param; re-fetching here while a country's full history is already
  // loaded client-side is redundant AND would send an unscoped global query).
  watch([activeLayers, activeSeverities], () => {
    const countryHistoryLoaded = activeBbox.value != null
      && _countryHistoryLoadedForBboxKey.value === JSON.stringify(activeBbox.value);
    if (countryHistoryLoaded) return;
    fetchAggregatedData();
  }, {immediate: false});

  // ─────────────────────────────────────────
  // Supabase counts (for badge display)
  // ─────────────────────────────────────────
  const supabaseCounts = ref({});
  const supabaseLoading = ref(false);
  let _realtimeUnsub = null;

  async function loadFromSupabase(forceFullFetch = false) {
    supabaseLoading.value = true;
    // Verileri asla siliyoruz, sadece yenilerini ekliyoruz veya mevcutları güncelliyoruz.
    // loadBatch zaten ID kontrolü yaptığı için mükerrer veri eklenmez.
    try {
      let hoursAgo = selectedTimeRange.value;

      if (!forceFullFetch) {
        const lastAt = await getLastFetchAt('_all');
        if (lastAt) {
          const deltaHours = (Date.now() - new Date(lastAt).getTime()) / 3_600_000 + 0.1;
          hoursAgo = Math.min(selectedTimeRange.value, deltaHours);
        }
      }

      const fetchOptions = {
        hours: hoursAgo,
        fromDate: startDate.value ? new Date(startDate.value).toISOString() : null,
        toDate: endDate.value ? new Date(new Date(endDate.value).setHours(23, 59, 59, 999)).toISOString() : null
      };

      const events = await fetchRecentDisasters(fetchOptions);
      if (events.length > 0) {
        loadBatch(events);
        // Tipe göre grupla ve IDB'ye yaz
        const groups = {};
        for (const e of events) {
          if (!groups[e.type]) groups[e.type] = [];
          groups[e.type].push(e);
        }
        for (const [type, typeEvents] of Object.entries(groups)) {
          writeToCache(type, typeEvents);
        }
        console.log(`[Supabase] ${events.length} yeni event (son ${hoursAgo.toFixed(1)}h)`);
      }
      await setLastFetchAt('_all', new Date().toISOString());
    } catch (err) {
      console.warn('[Store] Supabase load failed:', err.message);
    } finally {
      supabaseLoading.value = false;
      isLoading.value = false;
    }
  }

  // Loads a selected country's ENTIRE history once (not windowed by
  // selectedTimeRange/startDate/endDate) so every filter — duration,
  // magnitude, depth, severity — can stay a pure client-side re-filter over
  // an already-complete dataset afterward, the same way magnitude/depth
  // already work, instead of the duration slider silently depending on a
  // fresh network fetch it never actually triggered (live-testing finding,
  // user-reported: widening "SÜRE" to 20 yıl showed a smaller, wrong event
  // set — e.g. a real M7.8 missing — because nothing had asked the server
  // for that older data; a long-lived local dev cache had masked this).
  // Scoped server-side via bbox (not just filtered client-side afterward)
  // since real end users are always country-locked in practice — this is
  // "load this one country's full history", not "load the whole world's".
  // Re-selecting the same country (same bbox) is a no-op — already cached.
  const _countryHistoryLoadedForBboxKey = ref(null);
  async function loadCountryHistory(bbox) {
    if (!bbox) return;
    const bboxKey = JSON.stringify(bbox);
    if (_countryHistoryLoadedForBboxKey.value === bboxKey) return;
    _countryHistoryLoadedForBboxKey.value = bboxKey;

    supabaseLoading.value = true;
    try {
      const events = await fetchRecentDisasters({
        fromDate: new Date(0).toISOString(), // "from the beginning of records"
        bbox,
      });
      if (events.length > 0) {
        loadBatch(events);
        const groups = {};
        for (const e of events) {
          if (!groups[e.type]) groups[e.type] = [];
          groups[e.type].push(e);
        }
        for (const [type, typeEvents] of Object.entries(groups)) {
          writeToCache(type, typeEvents);
        }
        console.log(`[Supabase] loadCountryHistory: ${events.length} event`);
      }
    } catch (err) {
      console.warn('[Store] loadCountryHistory failed:', err.message);
      _countryHistoryLoadedForBboxKey.value = null; // allow a retry on next selection
    } finally {
      supabaseLoading.value = false;
    }
  }

  function startRealtime() {
    if (_realtimeUnsub) return;
    _realtimeUnsub = subscribeRealtime((event) => {
      addEvent(event);
      writeToCache(event.type, [event]);
    });
    isConnected.value = true;
  }

  // ─────────────────────────────────────────
  // Başlatma
  // ─────────────────────────────────────────
  async function startWebSocket() {
    // 1. IDB'den anında yükle (loading screen kalkar)
    const hadCache = await loadFromCache();
    if (!hadCache) isLoading.value = true;

    // 2. Safety: 8s sonra loading'i zorla kapat
    const safetyTimer = setTimeout(() => { isLoading.value = false; }, 8000);

    // 3. Arka planda Supabase delta fetch
    loadFromSupabase().finally(() => {
      clearTimeout(safetyTimer);
      isLoading.value = false;
    });

    // 4. Realtime subscription
    startRealtime();
  }

  function stopWebSocket() {
    _realtimeUnsub?.();
    _realtimeUnsub = null;
    isConnected.value = false;
  }

  // ─────────────────────────────────────────
  // Filtreler
  // ─────────────────────────────────────────
  function toggleLayer(type) {
    const s = new Set(activeLayers.value);
    if (s.has(type)) {
      s.delete(type);
    } else {
      s.add(type);
    }
    activeLayers.value = s;
  }

  function isLayerActive(type) {
    return activeLayers.value.has(type);
  }

  function toggleSeverity(severity) {
    const s = new Set(activeSeverities.value);
    if (s.has(severity)) {
      s.delete(severity);
    } else {
      s.add(severity);
    }
    activeSeverities.value = s;
  }

  function isSeverityActive(severity) {
    return activeSeverities.value.has(severity);
  }

  async function fetchAggregatedData() {
    try {
      aggregatedH3Data.value = await fetchAggregatedDisasters({
        hours: selectedTimeRange.value,
        types: Array.from(activeLayers.value),
        severities: Array.from(activeSeverities.value),
        fromDate: startDate.value ? new Date(startDate.value).toISOString() : null,
        toDate: endDate.value ? new Date(new Date(endDate.value).setHours(23, 59, 59, 999)).toISOString() : null
      });
    } catch (error) {
      console.error('Failed to fetch aggregated data:', error);
    }
  }

  async function loadFromCache() {
    try {
      const cached = await readAllFromCache();
      let total = 0;
      for (const [type, events] of Object.entries(cached)) {
        if (!events.length) continue;
        const store = storeMap.value[type];
        if (store) {store.value = events; total += events.length;}
      }
      if (total > 0) {
        isLoading.value = false;
        lastUpdated.value = new Date().toISOString();
        console.log(`[Cache] IDB'den ${total} event yüklendi`);
      }
      return total > 0;
    } catch (err) {
      console.warn('[Cache] IDB okuma hatası:', err.message);
      return false;
    }
  }

  // Geriye uyumluluk - eski polling imzaları
  function startPolling() {startWebSocket();}
  function stopPolling() {stopWebSocket();}

  // ─────────────────────────────────────────
  return {
    earthquakes, wildfires, floods, droughts, foodSecurity,
    tsunamis, cyclones, volcanoes, epidemics, otherDisasters,
    aggregatedH3Data,
    activeLayers, activeSeverities,
    isConnected, isLoading, lastUpdated,
    startDate, endDate, selectedTimeRange,
    sourcesStatus, errors,
    minMagnitude, maxDepth, activeBbox,
    showOnlyMyRegion, myRegionGeometry,
    earlyWarnings, activeWarning,
    supabaseCounts, supabaseLoading,
    allEvents, totalCount, criticalEvents, sourcesOnline, h3Events,
    addEvent, loadBatch, addEarlyWarning,
    startWebSocket, stopWebSocket,
    startPolling, stopPolling,
    toggleLayer, isLayerActive,
    toggleSeverity, isSeverityActive,
    toggleSource,
    loadFromCache, loadFromSupabase, loadCountryHistory,
    fetchAggregatedData,
    refreshAll: (force = true) => {
      loadFromSupabase(force);
      fetchAggregatedData();
    },
  };
});
