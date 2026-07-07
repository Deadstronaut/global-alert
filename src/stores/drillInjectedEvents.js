/**
 * Drill Injected Events Store - simulated hazard injection for active drills
 * (spec 037, MHEWS-FR-0149).
 *
 * These rows are NEVER written to the real earthquake/wildfire/flood/etc.
 * tables or the fetch-* / normalize pipeline (Principle IV) — kept entirely
 * separate. The existing generate-drill-report Edge Function (spec 032),
 * downloadDrillSummary() (spec 032), disaster-event CSV/JSON/GeoJSON export
 * functions, and false-alarm-rate/incident-report queries (spec 026) do not
 * and must never reference this table — confirmed by code review (spec 037
 * US4/T017), not by any code change.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/services/api/config.js';
import { useAuthStore } from '@/stores/auth.js';

export const useDrillInjectedEventsStore = defineStore('drillInjectedEvents', () => {
  const events = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function injectEvent(payload) {
    error.value = null;
    const auth = useAuthStore();
    const { data, error: err } = await supabase
      .from('drill_injected_events')
      .insert({ ...payload, created_by: auth.session?.id ?? null })
      .select()
      .single();
    if (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    }
    events.value = [...events.value, data];
    return { success: true, data };
  }

  async function fetchForActiveDrill(drillSessionId) {
    loading.value = true;
    error.value = null;
    const { data, error: err } = await supabase
      .from('drill_injected_events')
      .select('*')
      .eq('drill_session_id', drillSessionId);
    if (err) error.value = err.message;
    else events.value = data || [];
    loading.value = false;
    return events.value;
  }

  async function removeEvent(id) {
    const { error: err } = await supabase.from('drill_injected_events').delete().eq('id', id);
    if (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    }
    events.value = events.value.filter((e) => e.id !== id);
    return { success: true };
  }

  // Pure — maps a DrillInjectedEvent row to the {id,type,severity,title,lat,lng}
  // shape CapView.vue's existing startFromEvent()/detectedEvents already
  // expect (research.md Decision 5). No new event-picker code path is added;
  // this only adapts the shape.
  function normalizeForEventPicker(injectedEvent) {
    return {
      id: injectedEvent.id,
      type: injectedEvent.hazard_type,
      severity: injectedEvent.severity,
      title: injectedEvent.description,
      lat: injectedEvent.lat,
      lng: injectedEvent.lng,
    };
  }

  return {
    events,
    loading,
    error,
    injectEvent,
    fetchForActiveDrill,
    removeEvent,
    normalizeForEventPicker,
  };
});
