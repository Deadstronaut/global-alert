/**
 * Community Reports Store - vatandaş kaynaklı afet bildirimleri (spec 036).
 * Anonim gönderim tek yazma yolu olarak submit-community-report Edge
 * Function'ı üzerinden yapılır (RLS'e doğrudan INSERT yolu yoktur — research.md
 * Decision 2); moderasyon/atama/bağlama işlemleri doğrudan RLS-korumalı
 * `community_reports` tablosu üzerinden (contacts.js/shelters.js ile aynı
 * "RLS tek yetkilendirme otoritesi" deseni).
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/services/api/config.js';
import { useAuthStore } from '@/stores/auth.js';

export const useCommunityReportsStore = defineStore('communityReports', () => {
  const reports = ref([]);
  const moderationQueue = ref([]);
  const assignedToMyOrg = ref([]);
  const loading = ref(false);
  const error = ref(null);

  // ─────────────────────────────────────────
  // User Story 1 — anonim gönderim
  // ─────────────────────────────────────────
  async function submitReport(payload) {
    error.value = null;
    const { data, error: err } = await supabase.functions.invoke('submit-community-report', {
      body: payload,
    });
    if (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    }
    return { success: true, data };
  }

  // ─────────────────────────────────────────
  // User Story 2 — moderasyon kuyruğu
  // ─────────────────────────────────────────
  async function fetchModerationQueue() {
    loading.value = true;
    error.value = null;
    const { data, error: err } = await supabase
      .from('community_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at');
    if (err) error.value = err.message;
    else moderationQueue.value = data || [];
    loading.value = false;
    return moderationQueue.value;
  }

  async function approveReport(id, { assignedOrgId = null } = {}) {
    const auth = useAuthStore();
    const { data, error: err } = await supabase
      .from('community_reports')
      .update({
        status: 'approved',
        assigned_org_id: assignedOrgId,
        moderated_by: auth.session?.id ?? null,
        moderated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    }
    moderationQueue.value = moderationQueue.value.filter((r) => r.id !== id);
    return { success: true, data };
  }

  async function rejectReport(id, rejectionReason) {
    const auth = useAuthStore();
    const { data, error: err } = await supabase
      .from('community_reports')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason,
        moderated_by: auth.session?.id ?? null,
        moderated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    }
    moderationQueue.value = moderationQueue.value.filter((r) => r.id !== id);
    return { success: true, data };
  }

  async function fetchAssignableOrganizations(countryCode) {
    const { data, error: err } = await supabase
      .from('organizations')
      .select('*')
      .eq('country_code', countryCode)
      .order('name');
    if (err) {
      error.value = err.message;
      return [];
    }
    return data || [];
  }

  // ─────────────────────────────────────────
  // User Story 3 — harita katmanı
  // ─────────────────────────────────────────
  async function fetchApproved() {
    const { data, error: err } = await supabase
      .from('community_reports')
      .select('*')
      .eq('status', 'approved');
    if (err) {
      error.value = err.message;
      return [];
    }
    reports.value = data || [];
    return reports.value;
  }

  // ─────────────────────────────────────────
  // User Story 4 — incident bağlama
  // ─────────────────────────────────────────
  async function linkToIncident(reportId, incidentId) {
    const { data, error: err } = await supabase
      .from('community_reports')
      .update({ linked_incident_id: incidentId })
      .eq('id', reportId)
      .select()
      .single();
    if (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    }
    return { success: true, data };
  }

  async function fetchLinkedToIncident(incidentId) {
    const { data, error: err } = await supabase
      .from('community_reports')
      .select('*')
      .eq('linked_incident_id', incidentId);
    if (err) {
      error.value = err.message;
      return [];
    }
    return data || [];
  }

  // ─────────────────────────────────────────
  // User Story 5 — org_admin'e atanmış bildirimler (salt-okunur)
  // ─────────────────────────────────────────
  async function fetchAssignedToMyOrg() {
    loading.value = true;
    error.value = null;
    const { data, error: err } = await supabase
      .from('community_reports')
      .select('*')
      .eq('status', 'approved')
      .order('moderated_at', { ascending: false });
    if (err) error.value = err.message;
    else assignedToMyOrg.value = data || [];
    loading.value = false;
    return assignedToMyOrg.value;
  }

  return {
    reports,
    moderationQueue,
    assignedToMyOrg,
    loading,
    error,
    submitReport,
    fetchModerationQueue,
    approveReport,
    rejectReport,
    fetchAssignableOrganizations,
    fetchApproved,
    linkToIncident,
    fetchLinkedToIncident,
    fetchAssignedToMyOrg,
  };
});
