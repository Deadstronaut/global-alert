/**
 * Disaster Store - WebSocket + Supabase hybrid data management
 * Live events via WebSocket (GEWS Aggregator)
 * Historical data on startup via Supabase views
 */

import {defineStore} from 'pinia';
import {ref, computed, watch} from 'vue';
import {fetchRecentDisasters, subscribeRealtime} from '@/services/supabaseService.js';
import {readAllFromCache, writeToCache, getLastFetchAt, setLastFetchAt} from '@/services/idbCache.js';

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

  const activeLayers = ref(new Set([
    'earthquake'
  ]));
  const activeSeverities = ref(new Set(['critical', 'high', 'moderate', 'low', 'minimal']));

  const isConnected = ref(false);
  const isLoading = ref(true);
  const lastUpdated = ref(null);
  const startDate = ref(null);
  const endDate = ref(null);
  const selectedTimeRange = ref(24); // saat
  const sourcesStatus = ref({});  // { EMSC: true, USGS: true, ... }
  const errors = ref([]);

  const minMagnitude = ref(0);    // 0–9
  const maxDepth = ref(null); // null = TÜMÜ, sayı = km

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

  // ─────────────────────────────────────────
  // Computed
  // ─────────────────────────────────────────
  const allEvents = computed(() => {
    const events = [];
    for (const type of activeLayers.value) {
      const store = storeMap.value[type];
      if (store) events.push(...store.value);
    }

    let filtered = events.filter(e => {
      if (!activeSeverities.value.has(e.severity)) return false;
      if (minMagnitude.value > 0 && (e.magnitude == null || e.magnitude < minMagnitude.value)) return false;
      if (maxDepth.value !== null && e.depth != null && e.depth > maxDepth.value) return false;
      return true;
    });

    // Zaman filtresi
    if (startDate.value || endDate.value) {
      const from = startDate.value ? new Date(startDate.value).getTime() : 0;
      const to = endDate.value ? new Date(endDate.value).getTime() : Infinity;
      return filtered.filter(e => {
        const t = new Date(e.time).getTime();
        return t >= from && t <= to;
      });
    }

    const cutoff = Date.now() - selectedTimeRange.value * 60 * 60 * 1000;
    return filtered.filter(e => new Date(e.time).getTime() >= cutoff);
  });

  const totalCount = computed(() => {
    const counts = {};
    const from = startDate.value ? new Date(startDate.value).getTime() : 0;
    const to = endDate.value ? new Date(endDate.value).getTime() : Infinity;
    const cutoff = Date.now() - selectedTimeRange.value * 60 * 60 * 1000;
    const useDateRange = startDate.value || endDate.value;

    for (const [key, store] of Object.entries(storeMap.value)) {
      if (key === 'disaster') continue;

      counts[key] = store.value.filter(e => {
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

  // ─────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────

  /**
   * Gelen single event'i store'a ekle
   */
  function addEvent(event) {
    const store = storeMap.value[event.type] || otherDisasters;
    const arr = store.value;

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
    for (const e of events) {
      if (!groups[e.type]) groups[e.type] = [];
      groups[e.type].push(e);
    }

    for (const [type, typeEvents] of Object.entries(groups)) {
      const store = storeMap.value[type] || otherDisasters;
      const existingIds = new Set(store.value.map(e => e.id));
      const newOnes = typeEvents.filter(e => !existingIds.has(e.id));
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

  watch([selectedTimeRange, startDate, endDate], () => {
    const days = getRangeDays();
    if (days > 180) { // More than 6 months -> only Critical & High
      activeSeverities.value = new Set(['critical', 'high']);
    } else if (days > 30) { // More than 1 month -> Moderate too
      activeSeverities.value = new Set(['critical', 'high', 'moderate']);
    } else { // Shorter -> Show all
      activeSeverities.value = new Set(['critical', 'high', 'moderate', 'low', 'minimal']);
    }
    // Tarih aralığı değişince her zaman full fetch yap
    loadFromSupabase(true);
  }, {immediate: false});

  // ─────────────────────────────────────────
  // Supabase counts (for badge display)
  // ─────────────────────────────────────────
  const supabaseCounts = ref({});
  const supabaseLoading = ref(false);
  let _realtimeUnsub = null;

  async function loadFromSupabase(forceFullFetch = false) {
    supabaseLoading.value = true;
    if (forceFullFetch) {
      // Tarih aralığı değişince eski veriyi temizle
      earthquakes.value = [];
      wildfires.value = [];
      floods.value = [];
      droughts.value = [];
      foodSecurity.value = [];
      tsunamis.value = [];
      cyclones.value = [];
      volcanoes.value = [];
      epidemics.value = [];
      otherDisasters.value = [];
    }
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

    // 2. Arka planda Supabase delta fetch
    loadFromSupabase().finally(() => {isLoading.value = false;});

    // 3. Realtime subscription
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
    activeLayers, activeSeverities,
    isConnected, isLoading, lastUpdated,
    startDate, endDate, selectedTimeRange,
    sourcesStatus, errors,
    minMagnitude, maxDepth,
    earlyWarnings, activeWarning,
    supabaseCounts, supabaseLoading,
    allEvents, totalCount, criticalEvents, sourcesOnline,
    addEvent, loadBatch, addEarlyWarning,
    startWebSocket, stopWebSocket,
    startPolling, stopPolling,
    toggleLayer, isLayerActive,
    toggleSeverity, isSeverityActive,
    loadFromCache, loadFromSupabase,
    refreshAll: (force = true) => loadFromSupabase(force),
  };
});
