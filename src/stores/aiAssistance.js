/**
 * Sandboxed AI Assistance Store (spec 051).
 *
 * Per-country capability toggles (translate/summarize/classify_photo/
 * anomaly_flag) plus request/resolve actions for `ai_suggestions`. Every
 * request goes through an Edge Function (ai-translate/ai-summarize) that
 * performs its own permission + capability-enabled check before calling the
 * AI provider — this store never assumes a request will succeed, and every
 * suggestion requires an explicit resolveSuggestion() call (approve/reject)
 * before it has any effect (FR-004). resolveSuggestion() only ever writes to
 * `ai_suggestions`; it never mutates a source entity (cap_drafts,
 * sop_documents, incidents, community_reports) directly — callers apply the
 * approved final_output to the source entity themselves, through that
 * entity's own existing store/RLS path.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/services/api/config.js';
import { useAuthStore } from '@/stores/auth.js';

export const useAiAssistanceStore = defineStore('aiAssistance', () => {
  const capabilities = ref({}); // { [capability]: boolean } for the current country
  const loading = ref(false);
  const error = ref(null);

  // ─────────────────────────────────────────
  // Capability config (FR-001)
  // ─────────────────────────────────────────
  async function fetchCapabilities(countryCode) {
    loading.value = true;
    error.value = null;
    const { data, error: err } = await supabase
      .from('ai_capability_config')
      .select('capability, enabled')
      .eq('country_code', countryCode);
    loading.value = false;
    if (err) {
      error.value = err.message;
      capabilities.value = {};
      return capabilities.value;
    }
    capabilities.value = Object.fromEntries((data || []).map((row) => [row.capability, row.enabled]));
    return capabilities.value;
  }

  function isEnabled(capability) {
    return capabilities.value[capability] === true;
  }

  async function setCapabilityEnabled(countryCode, capability, enabled) {
    const auth = useAuthStore();
    const { data, error: err } = await supabase
      .from('ai_capability_config')
      .upsert(
        { country_code: countryCode, capability, enabled, updated_by: auth.session?.id ?? null },
        { onConflict: 'country_code,capability' },
      )
      .select()
      .single();
    if (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    }
    capabilities.value = { ...capabilities.value, [capability]: enabled };
    return { success: true, data };
  }

  // ─────────────────────────────────────────
  // User Story 1 — çeviri önerisi
  // ─────────────────────────────────────────
  async function requestTranslation(sourceTable, sourceId, sourceText, sourceLocale, targetLocale, countryCode) {
    error.value = null;
    const { data, error: err } = await supabase.functions.invoke('ai-translate', {
      body: {
        source_table: sourceTable,
        source_id: sourceId,
        source_text: sourceText,
        source_locale: sourceLocale,
        target_locale: targetLocale,
        country_code: countryCode,
      },
    });
    if (err || data?.ok === false) {
      error.value = err?.message ?? data?.reason ?? 'provider_unavailable';
      return { success: false, unavailable: true, reason: error.value };
    }
    return { success: true, suggestionId: data.suggestion_id, aiOutput: data.ai_output };
  }

  // ─────────────────────────────────────────
  // User Story 2a — özetleme önerisi
  // ─────────────────────────────────────────
  async function requestSummary(sourceTable, sourceId, sourceText, countryCode) {
    error.value = null;
    const { data, error: err } = await supabase.functions.invoke('ai-summarize', {
      body: { source_table: sourceTable, source_id: sourceId, source_text: sourceText, country_code: countryCode },
    });
    if (err || data?.ok === false) {
      error.value = err?.message ?? data?.reason ?? 'provider_unavailable';
      return { success: false, unavailable: true, reason: error.value };
    }
    return { success: true, suggestionId: data.suggestion_id, aiOutput: data.ai_output };
  }

  // ─────────────────────────────────────────
  // Serbest sohbet (spec 051 eki) — herhangi bir kayda bağlı değil, hiçbir
  // şeyi değiştirmiyor, bu yüzden ai_suggestions'a hiç yazılmıyor ve
  // onay/red gerekmiyor (FR-004 zaten "kalıcı etkisi olan" önerilere
  // uygulanıyor, sohbetin kalıcı etkisi yok).
  // ─────────────────────────────────────────
  async function sendChatMessage(history, countryCode, uiLocale) {
    error.value = null;
    const { data, error: err } = await supabase.functions.invoke('ai-chat', {
      body: { messages: history, country_code: countryCode, ui_locale: uiLocale },
    });
    if (err || data?.ok === false) {
      error.value = err?.message ?? data?.reason ?? 'provider_unavailable';
      return { success: false, unavailable: true, reason: error.value };
    }
    return { success: true, reply: data.reply };
  }

  // ─────────────────────────────────────────
  // Ortak: bir öneriyi onayla/düzenleyerek onayla/reddet (FR-004/FR-005)
  // ─────────────────────────────────────────
  async function resolveSuggestion(suggestionId, { status, finalOutput = null } = {}) {
    const auth = useAuthStore();
    const { data, error: err } = await supabase
      .from('ai_suggestions')
      .update({
        status,
        final_output: finalOutput,
        resolved_by: auth.session?.id ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', suggestionId)
      .select()
      .single();
    if (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    }
    return { success: true, data };
  }

  return {
    capabilities,
    loading,
    error,
    fetchCapabilities,
    isEnabled,
    setCapabilityEnabled,
    requestTranslation,
    requestSummary,
    sendChatMessage,
    resolveSuggestion,
  };
});
