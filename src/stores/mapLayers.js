/**
 * OGC WMS/WFS Map Layer registry store (spec 012).
 * Admin-managed external map overlays, rendered live on MapView.vue —
 * never stored/normalized into the hazard-event pipeline (FR-008).
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabase } from '@/services/api/config.js';
import { isSafeLayerEndpointUrl } from '@/utils/mapLayerUrlSafety.js';

export const useMapLayersStore = defineStore('mapLayers', () => {
  const mapLayers = ref([]);
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref(null);

  async function fetchMapLayers() {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('map_layers')
        .select('*')
        .order('display_name');
      if (err) throw err;
      mapLayers.value = data ?? [];
      loaded.value = true;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  const activeMapLayers = computed(() => mapLayers.value.filter((l) => l.is_active));

  function assertSafeUrl(endpointUrl) {
    if (!isSafeLayerEndpointUrl(endpointUrl)) {
      throw new Error('unsafe_endpoint_url');
    }
  }

  async function createMapLayer(payload) {
    assertSafeUrl(payload.endpoint_url);
    const { data, error: err } = await supabase.from('map_layers').insert(payload).select().single();
    if (err) throw err;
    mapLayers.value.push(data);
    return data;
  }

  async function updateMapLayer(id, payload) {
    if (payload.endpoint_url !== undefined) assertSafeUrl(payload.endpoint_url);
    const { data, error: err } = await supabase.from('map_layers').update(payload).eq('id', id).select().single();
    if (err) throw err;
    const idx = mapLayers.value.findIndex((l) => l.id === id);
    if (idx !== -1) mapLayers.value[idx] = data;
    return data;
  }

  async function deactivateMapLayer(id) {
    return updateMapLayer(id, { is_active: false });
  }

  async function reactivateMapLayer(id) {
    return updateMapLayer(id, { is_active: true });
  }

  return {
    mapLayers,
    loaded,
    loading,
    error,
    activeMapLayers,
    fetchMapLayers,
    createMapLayer,
    updateMapLayer,
    deactivateMapLayer,
    reactivateMapLayer,
  };
});
