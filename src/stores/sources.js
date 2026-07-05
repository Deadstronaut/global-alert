/**
 * Sources Store - data source registration, health status, and audit history
 * Backs the admin Data Sources health dashboard (feature 001-data-ingestion-monitoring)
 *
 * Follows the same direct-Supabase-client pattern as AdminView.vue's users/orgs/drills
 * tabs (RLS-gated table access) rather than a bespoke Edge Function — consistent with
 * how the rest of the admin panel works in this codebase.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/services/api/config.js';

export const useSourcesStore = defineStore('sources', () => {
  const sources = ref([]);
  const loading = ref(false);
  const error = ref(null);

  // Country-scoped visibility (feature 002-source-scoping) is enforced entirely by RLS
  // (country_scoped_read_data_sources, supabase/migrations/20260706_data_sources_country_scope.sql)
  // — a super_admin gets every row, everyone else gets global (country_code IS NULL) rows plus
  // their own country's rows. Do NOT add a client-side filter here; it would be redundant with,
  // and non-authoritative compared to, the database-level policy.
  async function fetchSources() {
    loading.value = true;
    error.value = null;
    const { data, error: err } = await supabase
      .from('data_sources')
      .select('*')
      .order('hazard_type')
      .order('name');
    if (err) error.value = err.message;
    else sources.value = data ?? [];
    loading.value = false;
  }

  // createSource/updateSource forward `payload` as-is (including an optional `country_code`,
  // feature 002-source-scoping) — no allowlist to update here. If a caller's payload sets
  // `country_code` outside what their role permits (e.g. a country_admin trying to save a
  // global/other-country source), the write is rejected by RLS, not by this store; the
  // resulting Postgres error surfaces via `error.value`/the re-thrown error below, same as any
  // other RLS rejection already handled by this store's existing error-propagation pattern.
  async function createSource(payload) {
    const { data, error: err } = await supabase
      .from('data_sources')
      .insert(payload)
      .select()
      .single();
    if (err) { error.value = err.message; throw err; }
    sources.value.push(data);
    return data;
  }

  async function updateSource(id, payload) {
    const { data, error: err } = await supabase
      .from('data_sources')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (err) { error.value = err.message; throw err; }
    const idx = sources.value.findIndex((s) => s.id === id);
    if (idx !== -1) sources.value[idx] = data;
    return data;
  }

  async function setActive(id, isActive) {
    // health_state must flip to/from 'disabled' alongside is_active (chk_disabled_matches_active).
    return updateSource(id, {
      is_active: isActive,
      health_state: isActive ? 'healthy' : 'disabled',
      consecutive_failures: 0,
    });
  }

  async function deleteSource(id) {
    const { error: err } = await supabase.from('data_sources').delete().eq('id', id);
    if (err) { error.value = err.message; throw err; }
    sources.value = sources.value.filter((s) => s.id !== id);
  }

  async function fetchAudit(sourceId, range = {}) {
    let transitionsQuery = supabase
      .from('source_state_transitions')
      .select('*')
      .eq('source_id', sourceId)
      .order('created_at', { ascending: false });
    let rejectedQuery = supabase
      .from('rejected_payloads')
      .select('*')
      .eq('source_id', sourceId)
      .order('occurred_at', { ascending: false });

    if (range.from) {
      transitionsQuery = transitionsQuery.gte('created_at', range.from);
      rejectedQuery = rejectedQuery.gte('occurred_at', range.from);
    }
    if (range.to) {
      transitionsQuery = transitionsQuery.lte('created_at', range.to);
      rejectedQuery = rejectedQuery.lte('occurred_at', range.to);
    }

    const [{ data: transitions, error: tErr }, { data: rejected, error: rErr }] = await Promise.all([
      transitionsQuery,
      rejectedQuery,
    ]);
    if (tErr) throw tErr;
    if (rErr) throw rErr;
    return { transitions: transitions ?? [], rejected_payloads: rejected ?? [] };
  }

  return {
    sources,
    loading,
    error,
    fetchSources,
    createSource,
    updateSource,
    setActive,
    deleteSource,
    fetchAudit,
  };
});
