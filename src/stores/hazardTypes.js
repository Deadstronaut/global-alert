/**
 * Hazard Types Store - global hazard taxonomy registry + severity thresholds
 * (spec 010, fixes Constitution Principle I violation: hazard types/thresholds
 * were previously hardcoded and duplicated across 6+ files).
 *
 * Fetched once at app boot (src/App.vue's onMounted) and cached — every
 * consumer (6 migrated call sites, Phase 5) reads from this shared store
 * instead of independently fetching or hardcoding its own list.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabase } from '@/services/api/config.js';

// Bundled fallback (FR-011/SC-005): used when the registry hasn't loaded yet
// or the fetch failed, so no consumer ever renders an empty selector. These
// are the exact 9 hazard-type codes/names already in production use, and
// FALLBACK_THRESHOLDS reproduces src/utils/severity.js's original SEVERITY_FN
// map exactly (kept here, not deleted, per research.md §3).
const FALLBACK_HAZARD_TYPES = [
  { code: 'earthquake', display_name: 'Earthquake' },
  { code: 'wildfire', display_name: 'Wildfire' },
  { code: 'flood', display_name: 'Flood' },
  { code: 'drought', display_name: 'Drought' },
  { code: 'food_security', display_name: 'Food Security' },
  { code: 'tsunami', display_name: 'Tsunami' },
  { code: 'cyclone', display_name: 'Cyclone' },
  { code: 'volcano', display_name: 'Volcano' },
  { code: 'epidemic', display_name: 'Epidemic' },
];

const FALLBACK_THRESHOLDS = {
  earthquake: [
    { min_value: 0, severity: 'minimal' },
    { min_value: 2.5, severity: 'low' },
    { min_value: 4.0, severity: 'moderate' },
    { min_value: 5.5, severity: 'high' },
    { min_value: 7.0, severity: 'critical' },
  ],
  wildfire: [
    { min_value: 0, severity: 'minimal' },
    { min_value: 10, severity: 'low' },
    { min_value: 50, severity: 'moderate' },
    { min_value: 200, severity: 'high' },
    { min_value: 500, severity: 'critical' },
  ],
  flood: [
    { min_value: 0, severity: 'minimal' },
    { min_value: 1, severity: 'low' },
    { min_value: 2, severity: 'moderate' },
    { min_value: 3, severity: 'high' },
    { min_value: 4, severity: 'critical' },
  ],
  drought: [
    { min_value: 0, severity: 'low' },
    { min_value: 2, severity: 'moderate' },
    { min_value: 3, severity: 'high' },
    { min_value: 4, severity: 'critical' },
  ],
  food_security: [
    { min_value: 0, severity: 'minimal' },
    { min_value: 2, severity: 'low' },
    { min_value: 3, severity: 'moderate' },
    { min_value: 4, severity: 'high' },
    { min_value: 5, severity: 'critical' },
  ],
};

// Pure evaluation function (research.md §5, tested independently in
// tests/unit/hazardThresholdEvaluation.test.js): given an ordered
// (ascending min_value) breakpoints array and a numeric value, find the
// highest breakpoint whose min_value <= value. FR-008: no breakpoints at
// all (unknown hazard type or empty array) falls back to 'low'.
export function evaluateBreakpoints(breakpoints, value) {
  if (!Array.isArray(breakpoints) || breakpoints.length === 0) return 'low';
  let result = 'low';
  for (const bp of breakpoints) {
    if (value >= bp.min_value) result = bp.severity;
    else break;
  }
  return result;
}

// Pure resolution function (spec 020, data-model.md): returns the
// country-specific override's breakpoints if one exists for the exact
// (countryCode, hazardType) pair; otherwise globalThresholds unchanged
// (FR-002/FR-003/FR-004/FR-005). No countryCode → no override lookup at
// all, so existing two-argument computeSeverity() call sites are unaffected.
export function resolveThresholds(hazardType, countryCode, globalThresholds, overrides) {
  if (countryCode) {
    const override = overrides?.[countryCode]?.[hazardType];
    if (override) return override.breakpoints;
  }
  return globalThresholds;
}

// Pure derivation function (spec 024, data-model.md): returns every hazard
// type whose parent_code matches the given code — used by both the admin
// table and the encyclopedia page, never stored.
export function getChildren(hazardTypes, code) {
  return (hazardTypes ?? []).filter((h) => h.parent_code === code);
}

// Pure validation function (spec 024, mirrors the DB's
// prevent_hazard_type_cycle() trigger client-side so the admin form can show
// an inline error before even attempting to save): walks the candidate
// parent's chain and returns true if `code` would appear in it (a cycle), or
// if candidateParentCode === code (self-reference). Same depth cap as the
// DB trigger — defense-in-depth, not the sole enforcement.
export function wouldCreateCycle(hazardTypes, code, candidateParentCode) {
  if (!candidateParentCode) return false;
  if (candidateParentCode === code) return true;
  const byCode = Object.fromEntries((hazardTypes ?? []).map((h) => [h.code, h]));
  let cur = candidateParentCode;
  let depth = 0;
  while (cur && depth < 10) {
    if (cur === code) return true;
    cur = byCode[cur]?.parent_code ?? null;
    depth += 1;
  }
  return false;
}

export const useHazardTypesStore = defineStore('hazardTypes', () => {
  const hazardTypes = ref([]);
  const thresholds = ref({}); // { [code]: { metric_name, unit, breakpoints } }
  // { [countryCode]: { [hazardTypeCode]: { metric_name, unit, breakpoints } } } (spec 020)
  const overrides = ref({});
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref(null);

  async function fetchHazardTypes() {
    loading.value = true;
    error.value = null;
    try {
      const [{ data: types, error: typesErr }, { data: thr, error: thrErr }, { data: ovr, error: ovrErr }] = await Promise.all([
        supabase.from('hazard_types').select('*').order('display_name'),
        supabase.from('hazard_thresholds').select('*'),
        supabase.from('hazard_threshold_overrides').select('*'),
      ]);
      if (typesErr) throw typesErr;
      if (thrErr) throw thrErr;
      if (ovrErr) throw ovrErr;
      hazardTypes.value = types ?? [];
      thresholds.value = Object.fromEntries((thr ?? []).map((t) => [t.hazard_type_code, t]));
      const overridesByCountry = {};
      for (const o of ovr ?? []) {
        (overridesByCountry[o.country_code] ??= {})[o.hazard_type_code] = o;
      }
      overrides.value = overridesByCountry;
      loaded.value = true;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  // FR-011/SC-005: bundled fallback until the registry has actually loaded
  // (or if it errored) — never an empty list.
  const activeHazardTypes = computed(() => {
    if (loaded.value) {
      return hazardTypes.value.filter((h) => h.is_active).map((h) => ({ code: h.code, display_name: h.display_name }));
    }
    return FALLBACK_HAZARD_TYPES;
  });

  // spec 038 T030: 'population' (category='exposure') is not an alertable
  // hazard — it exists in this registry only so Impact Analysis's source
  // health/admin CRUD can reuse the same hazard_types infrastructure
  // (spec 038 research.md). Alert-authoring pickers (CapView.vue) must use
  // this instead of activeHazardTypes so a non-alertable exposure type can
  // never be selected as a CAP alert's hazard type — the hazard_types row
  // itself is never filtered out of the registry, only out of this specific
  // display context.
  const alertableHazardTypes = computed(() => {
    if (loaded.value) {
      return hazardTypes.value
        .filter((h) => h.is_active && h.category !== 'exposure')
        .map((h) => ({ code: h.code, display_name: h.display_name }));
    }
    return FALLBACK_HAZARD_TYPES;
  });

  // FR-007/FR-008: synchronous, evaluated against cached (or fallback)
  // breakpoints — no per-call DB round trip.
  function computeSeverity(hazardType, value, countryCode) {
    const numericValue = Number(value) || 0;
    const config = loaded.value ? thresholds.value[hazardType] : undefined;
    const globalBreakpoints = config ? config.breakpoints : FALLBACK_THRESHOLDS[hazardType];
    const breakpoints = resolveThresholds(hazardType, countryCode, globalBreakpoints, overrides.value);
    return evaluateBreakpoints(breakpoints, numericValue);
  }

  async function createHazardType(payload) {
    const { data, error: err } = await supabase.from('hazard_types').insert(payload).select().single();
    if (err) throw err;
    hazardTypes.value.push(data);
    return data;
  }

  async function updateHazardType(code, payload) {
    const { data, error: err } = await supabase.from('hazard_types').update(payload).eq('code', code).select().single();
    if (err) throw err;
    const idx = hazardTypes.value.findIndex((h) => h.code === code);
    if (idx !== -1) hazardTypes.value[idx] = data;
    return data;
  }

  async function deactivateHazardType(code) {
    return updateHazardType(code, { is_active: false });
  }

  async function reactivateHazardType(code) {
    return updateHazardType(code, { is_active: true });
  }

  async function upsertThresholds(hazardTypeCode, payload) {
    const { data, error: err } = await supabase
      .from('hazard_thresholds')
      .upsert({ hazard_type_code: hazardTypeCode, ...payload }, { onConflict: 'hazard_type_code' })
      .select()
      .single();
    if (err) throw err;
    thresholds.value[hazardTypeCode] = data;
    return data;
  }

  // spec 020: upsert/remove a country-scoped override — RLS enforces that
  // non-super-admins can only target their own country (FR-006/FR-008).
  async function upsertThresholdOverride(hazardTypeCode, countryCode, payload) {
    const { data, error: err } = await supabase
      .from('hazard_threshold_overrides')
      .upsert({ hazard_type_code: hazardTypeCode, country_code: countryCode, ...payload }, { onConflict: 'hazard_type_code,country_code' })
      .select()
      .single();
    if (err) throw err;
    (overrides.value[countryCode] ??= {})[hazardTypeCode] = data;
    return data;
  }

  async function removeThresholdOverride(hazardTypeCode, countryCode) {
    const { error: err } = await supabase
      .from('hazard_threshold_overrides')
      .delete()
      .eq('hazard_type_code', hazardTypeCode)
      .eq('country_code', countryCode);
    if (err) throw err;
    if (overrides.value[countryCode]) delete overrides.value[countryCode][hazardTypeCode];
  }

  return {
    hazardTypes,
    thresholds,
    overrides,
    loaded,
    loading,
    error,
    activeHazardTypes,
    alertableHazardTypes,
    fetchHazardTypes,
    computeSeverity,
    createHazardType,
    updateHazardType,
    deactivateHazardType,
    reactivateHazardType,
    upsertThresholds,
    upsertThresholdOverride,
    removeThresholdOverride,
  };
});
