/**
 * SOP (Standard Operating Procedure) Documents Store (spec 011).
 * Hazard-tagged reference documents, managed by super_admin, surfaced on
 * incidents whose hazard_type matches an active SOP's hazard_type_code.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabase } from '@/services/api/config.js';

export const useSopDocumentsStore = defineStore('sopDocuments', () => {
  const sopDocuments = ref([]);
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref(null);

  async function fetchSopDocuments() {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('sop_documents')
        .select('*')
        .order('title');
      if (err) throw err;
      sopDocuments.value = data ?? [];
      loaded.value = true;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  // Non-super-admin users only ever receive is_active=true rows from the
  // DB (RLS), so this is simply "everything currently loaded" — but we
  // still filter defensively in case a super_admin's session has fetched
  // inactive rows too.
  const activeSopDocuments = computed(() => sopDocuments.value.filter((s) => s.is_active));

  function sopsForHazardType(hazardTypeCode) {
    return activeSopDocuments.value.filter((s) => s.hazard_type_code === hazardTypeCode);
  }

  async function createSopDocument(payload) {
    const { data, error: err } = await supabase.from('sop_documents').insert(payload).select().single();
    if (err) throw err;
    sopDocuments.value.push(data);
    return data;
  }

  async function updateSopDocument(id, payload) {
    const { data, error: err } = await supabase.from('sop_documents').update(payload).eq('id', id).select().single();
    if (err) throw err;
    const idx = sopDocuments.value.findIndex((s) => s.id === id);
    if (idx !== -1) sopDocuments.value[idx] = data;
    return data;
  }

  async function deactivateSopDocument(id) {
    return updateSopDocument(id, { is_active: false });
  }

  async function reactivateSopDocument(id) {
    return updateSopDocument(id, { is_active: true });
  }

  // spec 033 (MHEWS-FR-0275): read-only lookup of a SOP's archived versions —
  // writes only ever happen via the archive_sop_document_version() trigger,
  // never through this store.
  async function fetchSopDocumentVersions(sopDocumentId) {
    const { data, error: err } = await supabase
      .from('sop_document_versions')
      .select('*')
      .eq('sop_document_id', sopDocumentId)
      .order('archived_at', { ascending: false });
    if (err) throw err;
    return data ?? [];
  }

  return {
    sopDocuments,
    loaded,
    loading,
    error,
    activeSopDocuments,
    sopsForHazardType,
    fetchSopDocuments,
    createSopDocument,
    updateSopDocument,
    deactivateSopDocument,
    reactivateSopDocument,
    fetchSopDocumentVersions,
  };
});
