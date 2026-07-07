/**
 * Contacts Store - dissemination contact directory (spec 009)
 * Backs the admin "İletişim Rehberi" tab.
 *
 * Same direct-Supabase-client pattern as sources.js — RLS
 * (20260707120000_contacts.sql) is the authoritative scoping; this store
 * does not add its own client-side country/org filter.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/services/api/config.js';

export const useContactsStore = defineStore('contacts', () => {
  const contacts = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function fetchContacts() {
    loading.value = true;
    error.value = null;
    const { data, error: err } = await supabase
      .from('contacts')
      .select('*')
      .order('full_name');
    if (err) error.value = err.message;
    else contacts.value = data ?? [];
    loading.value = false;
  }

  // createContact/updateContact forward `payload` as-is (including
  // country_code) — a country_admin/org_admin payload targeting a country
  // outside their own is rejected by RLS, not by this store, same as
  // sources.js's createSource/updateSource.
  async function createContact(payload) {
    const { data, error: err } = await supabase
      .from('contacts')
      .insert(payload)
      .select()
      .single();
    if (err) { error.value = err.message; throw err; }
    contacts.value.push(data);
    return data;
  }

  async function updateContact(id, payload) {
    const { data, error: err } = await supabase
      .from('contacts')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (err) { error.value = err.message; throw err; }
    const idx = contacts.value.findIndex((c) => c.id === id);
    if (idx !== -1) contacts.value[idx] = data;
    return data;
  }

  // Deactivation, never hard delete, for country_admin/org_admin (FR-004) —
  // enforced by RLS (no DELETE policy granted to those roles), this is just
  // the one write path this store's UI ever calls for non-super_admin use.
  async function deactivateContact(id) {
    return updateContact(id, { is_active: false });
  }

  async function reactivateContact(id) {
    return updateContact(id, { is_active: true });
  }

  // GDPR anonymization (spec 031, MHEWS-SD-CONTACT-06) — irreversible, unlike
  // deactivate/reactivate above. Only touches contacts; dispatch_receipts and
  // audit_log are never modified, so past dispatch/audit history stays
  // intact. Once is_active=false, matchesContact() (dispatchMatching.ts)
  // already excludes this contact from all future dispatches — no separate
  // enforcement needed here.
  async function anonymizeContact(id) {
    return updateContact(id, {
      email: null,
      whatsapp_number: null,
      full_name: '[anonymized]',
      is_active: false,
    });
  }

  return {
    contacts,
    loading,
    error,
    fetchContacts,
    createContact,
    updateContact,
    deactivateContact,
    reactivateContact,
    anonymizeContact,
  };
});
