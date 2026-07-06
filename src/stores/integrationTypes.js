/**
 * Integration Types Store - global registry of known integration types and
 * their field templates (spec 025). Mirrors src/stores/hazardTypes.js's
 * registry pattern: fetched once, cached, only super_admin can write.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabase } from '@/services/api/config.js';

export const useIntegrationTypesStore = defineStore('integrationTypes', () => {
  const integrationTypes = ref([]);
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref(null);

  async function fetchIntegrationTypes() {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase.from('integration_types').select('*').order('display_name');
      if (err) throw err;
      integrationTypes.value = data ?? [];
      loaded.value = true;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  const activeIntegrationTypes = computed(() => integrationTypes.value.filter((t) => t.is_active));

  // super_admin-only per RLS; no UI in this spec calls this (YAGNI, per
  // spec.md Assumptions — a future iteration can add an "add type" form).
  async function createIntegrationType(payload) {
    const { data, error: err } = await supabase.from('integration_types').insert(payload).select().single();
    if (err) throw err;
    integrationTypes.value.push(data);
    return data;
  }

  return {
    integrationTypes,
    loaded,
    loading,
    error,
    activeIntegrationTypes,
    fetchIntegrationTypes,
    createIntegrationType,
  };
});
