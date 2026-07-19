/**
 * Exposure dataset registry store (spec 042) — fetches exposure_datasets for
 * toggleable map-layer rendering. Read-only, RLS-scoped exactly like
 * ImpactPanel.vue's existing fetch (no new access-control logic — research.md §5).
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabase } from '@/services/api/config.js';

export const useExposureLayersStore = defineStore('exposureLayers', () => {
  const datasets = ref([]);
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref(null);

  async function fetchExposureLayers() {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('exposure_datasets')
        .select('*')
        .order('name');
      if (err) throw err;
      datasets.value = data ?? [];
      loaded.value = true;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  const hasLayers = computed(() => datasets.value.length > 0);

  return {
    datasets,
    loaded,
    loading,
    error,
    hasLayers,
    fetchExposureLayers,
  };
});
