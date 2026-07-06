/**
 * Integration Settings Store - per-country, per-integration-type credential
 * status (spec 025, replaces src/stores/whatsappIntegration.js). Credential
 * values themselves are NEVER read or held by this store — only their
 * configured/not-configured status and which field names were set. Writes go
 * exclusively through the save_integration_credentials() RPC (SECURITY
 * DEFINER), which performs its own authorization check and never returns the
 * payload.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/services/api/config.js';

// Pure function (ported from whatsappIntegration.js's formatIntegrationStatus,
// extended with configuredFieldKeys): normalizes a raw integration_settings
// row (or its absence) into a simple status shape.
export function formatIntegrationStatus(setting) {
  if (!setting?.is_configured) return { configured: false, updatedAt: null, configuredFieldKeys: [] };
  return {
    configured: true,
    updatedAt: setting.updated_at,
    configuredFieldKeys: setting.configured_field_keys ?? [],
  };
}

// Pure function (spec 025 US2): merges required template field values with
// admin-added custom {name, value} rows into a single flat fields object
// ready for the save_integration_credentials() RPC. A custom row where BOTH
// name and value are still empty is silently dropped (an untouched trailing
// row, not an error); a row with only one of the two filled is flagged as
// invalid via the returned errors array rather than silently dropped or
// silently accepted.
export function mergeTemplateAndCustomFields(templateValues, customFields) {
  const fields = { ...templateValues };
  const errors = [];

  for (const custom of customFields ?? []) {
    const name = (custom.name ?? '').trim();
    const value = (custom.value ?? '').trim();
    if (!name && !value) continue;
    if (!name || !value) {
      errors.push('incomplete_custom_field');
      continue;
    }
    fields[name] = value;
  }

  return { fields, errors };
}

export const useIntegrationSettingsStore = defineStore('integrationSettings', () => {
  const settings = ref({}); // { [countryCode]: { [integrationTypeCode]: row } }
  const loading = ref(false);
  const error = ref(null);

  async function fetchSettings(countryCode) {
    loading.value = true;
    error.value = null;
    const { data, error: err } = await supabase
      .from('integration_settings')
      .select('*')
      .eq('country_code', countryCode);
    if (err) {
      error.value = err.message;
    } else {
      const byType = Object.fromEntries((data ?? []).map((row) => [row.integration_type_code, row]));
      settings.value = { ...settings.value, [countryCode]: byType };
    }
    loading.value = false;
  }

  async function saveCredentials(countryCode, integrationTypeCode, fieldsObject) {
    const { error: err } = await supabase.rpc('save_integration_credentials', {
      p_country_code: countryCode,
      p_integration_type_code: integrationTypeCode,
      p_fields: fieldsObject,
    });
    if (err) { error.value = err.message; throw err; }
    await fetchSettings(countryCode);
  }

  return {
    settings,
    loading,
    error,
    fetchSettings,
    saveCredentials,
  };
});
