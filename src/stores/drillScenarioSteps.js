/**
 * Scheduled multi-step drill scenario sequences (spec 037 remaining item) —
 * an ordered list of hazard-injection "steps" attached to a drill_session,
 * each firing automatically (via the `process_drill_scenario_steps()`
 * pg_cron job) a fixed number of minutes after the drill's `started_at`.
 * This store only manages the plan (drill_scenario_steps rows); the actual
 * injected event that appears on the map still lives in
 * drill_injected_events, exactly as a manual injection would
 * (useDrillInjectedEventsStore, spec 037 US1) — this store never writes
 * there directly.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/services/api/config.js';
import { useAuthStore } from '@/stores/auth.js';

// Pure — next step_order is one past the highest existing order (0 if none
// yet), so steps stay append-only and in drag-free sequential order.
export function nextStepOrder(existingSteps) {
  if (!existingSteps || existingSteps.length === 0) return 0;
  return Math.max(...existingSteps.map((s) => s.step_order)) + 1;
}

export const useDrillScenarioStepsStore = defineStore('drillScenarioSteps', () => {
  const stepsByDrill = ref({});
  const loading = ref(false);
  const error = ref(null);

  async function fetchSteps(drillSessionId) {
    loading.value = true;
    error.value = null;
    const { data, error: err } = await supabase
      .from('drill_scenario_steps')
      .select('*')
      .eq('drill_session_id', drillSessionId)
      .order('step_order', { ascending: true });
    if (err) error.value = err.message;
    else stepsByDrill.value = { ...stepsByDrill.value, [drillSessionId]: data || [] };
    loading.value = false;
    return stepsByDrill.value[drillSessionId] ?? [];
  }

  async function addStep(drillSessionId, step) {
    error.value = null;
    const auth = useAuthStore();
    const existing = stepsByDrill.value[drillSessionId] ?? [];
    const { data, error: err } = await supabase
      .from('drill_scenario_steps')
      .insert({
        drill_session_id: drillSessionId,
        step_order: nextStepOrder(existing),
        created_by: auth.session?.id ?? null,
        ...step,
      })
      .select()
      .single();
    if (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    }
    stepsByDrill.value = { ...stepsByDrill.value, [drillSessionId]: [...existing, data] };
    return { success: true, data };
  }

  async function removeStep(drillSessionId, stepId) {
    const { error: err } = await supabase.from('drill_scenario_steps').delete().eq('id', stepId);
    if (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    }
    const existing = stepsByDrill.value[drillSessionId] ?? [];
    stepsByDrill.value = { ...stepsByDrill.value, [drillSessionId]: existing.filter((s) => s.id !== stepId) };
    return { success: true };
  }

  return { stepsByDrill, loading, error, fetchSteps, addStep, removeStep };
});
