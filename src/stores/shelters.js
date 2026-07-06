/**
 * Shelters Store - shelter registration, capacity/occupancy/status (spec 021)
 * Backs the admin "Sığınaklar" tab.
 *
 * Same direct-Supabase-client pattern as contacts.js — RLS
 * (20260707230000_shelters.sql) is the authoritative scoping; this store
 * does not add its own client-side country filter. fetchShelters() does NOT
 * filter by is_active — admins need inactive rows visible to reactivate
 * them; the UI filters to active-only for read-only (viewer) accounts.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/services/api/config.js';

// Pure function (research.md Decision 4, tested in
// tests/unit/shelterOccupancy.test.js): percentage of total capacity
// currently occupied, defensively guarded against a falsy/zero
// capacity_total (the DB's chk_shelter_capacity_positive constraint already
// guarantees this can't happen for a persisted row).
export function occupancyPercentage(shelter) {
  const total = Number(shelter?.capacity_total) || 0;
  if (!total) return 0;
  const occupied = Number(shelter?.capacity_occupied) || 0;
  return Math.round((occupied / total) * 100);
}

export const useSheltersStore = defineStore('shelters', () => {
  const shelters = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function fetchShelters() {
    loading.value = true;
    error.value = null;
    const { data, error: err } = await supabase
      .from('shelters')
      .select('*')
      .order('name');
    if (err) error.value = err.message;
    else shelters.value = data ?? [];
    loading.value = false;
  }

  async function createShelter(payload) {
    const { data, error: err } = await supabase
      .from('shelters')
      .insert(payload)
      .select()
      .single();
    if (err) { error.value = err.message; throw err; }
    shelters.value.push(data);
    return data;
  }

  async function updateShelter(id, payload) {
    const { data, error: err } = await supabase
      .from('shelters')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (err) { error.value = err.message; throw err; }
    const idx = shelters.value.findIndex((s) => s.id === id);
    if (idx !== -1) shelters.value[idx] = data;
    return data;
  }

  // Deactivation, never hard delete, for country_admin/org_admin (FR-005) —
  // enforced by RLS (no DELETE policy granted to those roles).
  async function deactivateShelter(id) {
    return updateShelter(id, { is_active: false });
  }

  async function reactivateShelter(id) {
    return updateShelter(id, { is_active: true });
  }

  // FR-009/FR-010: optional incident association — a thin wrapper, since
  // the ON DELETE SET NULL foreign key (not application code) is what
  // clears this automatically if the linked incident is later deleted.
  async function linkIncident(shelterId, incidentId) {
    return updateShelter(shelterId, { linked_incident_id: incidentId });
  }

  async function unlinkIncident(shelterId) {
    return updateShelter(shelterId, { linked_incident_id: null });
  }

  return {
    shelters,
    loading,
    error,
    fetchShelters,
    createShelter,
    updateShelter,
    deactivateShelter,
    reactivateShelter,
    linkIncident,
    unlinkIncident,
  };
});
