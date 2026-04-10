/**
 * Disaster Store - WebSocket + Supabase hybrid data management
 * Live events via WebSocket (GEWS Aggregator)
 * Historical data on startup via Supabase views
 */

import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {wsClient} from '@/services/websocket/wsClient.js';
import {cacheEvents, loadAllCachedData} from '@/services/offlineCache.js';
import {fetchAllDisasters, fetchDisasterCounts} from '@/services/supabaseService.js';

// Afet tipine göre maksimum tutulacak olay sayısı (bellek yönetimi)
const MAX_EVENTS = {
  earthquake: 500,
  wildfire: 300,
  flood: 300,
  drought: 200,
  food_security: 200,
  tsunami: 100,
  cyclone: 100,
  volcano: 100,
  epidemic: 100,
  disaster: 200,
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
    'earthquake', 'wildfire', 'flood', 'drought',
    'food_security', 'tsunami', 'cyclone', 'volcano'
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

  const totalCount = computed(() => ({
    earthquake: earthquakes.value.length,
    wildfire: wildfires.value.length,
    flood: floods.value.length,
    drought: droughts.value.length,
    food_security: foodSecurity.value.length,
    tsunami: tsunamis.value.length,
    cyclone: cyclones.value.length,
    volcano: volcanoes.value.length,
    epidemic: epidemics.value.length,
    total: allEvents.value.length,
  }));

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
      cacheEvents('earthquake', earthquakes.value.slice(0, 50));
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
  // Supabase counts (for badge display)
  // ─────────────────────────────────────────
  const supabaseCounts = ref({});
  const supabaseLoading = ref(false);

  /**
   * Load all historical events from Supabase views on startup.
   * Runs in parallel with WebSocket connection.
   */
  async function loadFromSupabase() {
    supabaseLoading.value = true;
    try {
      // Load counts first (fast, HEAD request)
      const counts = await fetchDisasterCounts();
      supabaseCounts.value = counts;

      // Then load all events (paginated)
      const events = await fetchAllDisasters();
      if (events.length > 0) {
        loadBatch(events);
      }
    } catch (err) {
      console.warn('[DisasterStore] Supabase initial load failed:', err.message);
    } finally {
      supabaseLoading.value = false;
    }
  }

  // ─────────────────────────────────────────
  // WebSocket
  // ─────────────────────────────────────────
  function startWebSocket() {
    loadFromCache();
    loadFromSupabase(); // Load historical data from Supabase in parallel

    wsClient.on('connected', () => {
      isConnected.value = true;
      isLoading.value = false;
      errors.value = [];
    });

    wsClient.on('disconnected', () => {
      isConnected.value = false;
    });

    wsClient.on('event', (event) => {
      addEvent(event);
    });

    wsClient.on('batch', (events) => {
      loadBatch(events);
    });

    wsClient.on('early_warning', (warning) => {
      addEarlyWarning(warning);
    });

    wsClient.on('sources_status', (status) => {
      sourcesStatus.value = status;
    });

    wsClient.connect();
  }

  function stopWebSocket() {
    wsClient.disconnect();
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

  function loadFromCache() {
    const cached = loadAllCachedData();
    if (cached.earthquakes?.length) earthquakes.value = cached.earthquakes;
    if (cached.wildfires?.length) wildfires.value = cached.wildfires;
    if (cached.floods?.length) floods.value = cached.floods;
    if (cached.droughts?.length) droughts.value = cached.droughts;
    if (cached.foodSecurity?.length) foodSecurity.value = cached.foodSecurity;
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
    refreshAll: () => wsClient.send({type: 'refresh'}),
  };
});
