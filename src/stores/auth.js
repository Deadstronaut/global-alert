import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabase } from '@/services/api/config.js';

export const useAuthStore = defineStore('auth', () => {
  // session: { id, email, role, countryCode } | null
  const session = ref(null);
  const initialized = ref(false);
  const authError = ref(null);

  const isLoggedIn = computed(() => session.value !== null);
  const isSuperAdmin = computed(() => session.value?.role === 'super_admin');
  const countryCode = computed(() => session.value?.countryCode ?? null);
  const regionCode = computed(() => session.value?.regionCode ?? null);

  async function loadProfile(user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, country_code, region_code')
      .eq('id', user.id)
      .maybeSingle();

    session.value = {
      id: user.id,
      email: user.email,
      role: profile?.role ?? 'viewer',
      countryCode: profile?.country_code ?? null,
      regionCode: profile?.region_code ?? null,
    };
  }

  // Restores an existing browser session (page refresh) and subscribes to future
  // auth changes. Safe to call multiple times — only runs its setup once.
  async function init() {
    if (initialized.value) return;
    initialized.value = true;

    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      await loadProfile(data.session.user);
    }

    supabase.auth.onAuthStateChange((_event, sbSession) => {
      if (sbSession?.user) {
        loadProfile(sbSession.user);
      } else {
        session.value = null;
      }
    });
  }

  async function login(email, password) {
    authError.value = null;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      authError.value = error.message;
      throw error;
    }
    await loadProfile(data.user);
    return session.value;
  }

  // Admin-provisioned accounts only (no public self-registration) — calls the
  // create-user Edge Function, which enforces the super_admin/country_admin
  // hierarchy server-side and sends the new user a secure invite email to set
  // their own password (spec 004 gap 4 — no password is chosen by the admin).
  async function createUser({ email, role, countryCode, orgId, regionCode, fullName }) {
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { email, role, country_code: countryCode, org_id: orgId, region_code: regionCode, full_name: fullName },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  // Real access suspension, distinct from a role downgrade (spec 004 gap 3) —
  // calls the suspend-user Edge Function, which enforces the same
  // super_admin/country_admin/org_admin hierarchy as createUser server-side.
  async function suspendUser(targetUserId) {
    const { data, error } = await supabase.functions.invoke('suspend-user', {
      body: { target_user_id: targetUserId, action: 'suspend' },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function reactivateUser(targetUserId) {
    const { data, error } = await supabase.functions.invoke('suspend-user', {
      body: { target_user_id: targetUserId, action: 'reactivate' },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function logout() {
    await supabase.auth.signOut();
    session.value = null;
  }

  return {
    session,
    isLoggedIn,
    isSuperAdmin,
    countryCode,
    regionCode,
    authError,
    init,
    login,
    createUser,
    suspendUser,
    reactivateUser,
    logout,
  };
});
