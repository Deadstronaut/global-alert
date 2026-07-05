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
      .select('role, country_code, region_code, org_id')
      .eq('id', user.id)
      .maybeSingle();

    session.value = {
      id: user.id,
      email: user.email,
      role: profile?.role ?? 'viewer',
      countryCode: profile?.country_code ?? null,
      regionCode: profile?.region_code ?? null,
      orgId: profile?.org_id ?? null,
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
    // Password alone is not enough once a second factor is enrolled (spec 005
    // FR-003) — signInWithPassword already succeeds and issues a valid aal1
    // session either way; withholding profile load/session completion here is
    // what actually gates access until the challenge step succeeds.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
      return { mfaPending: true };
    }
    await loadProfile(data.user);
    return session.value;
  }

  // Completes a pending login challenge with a current TOTP code (spec 005 US2).
  async function verifyMfaChallenge(factorId, code) {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) throw challengeError;
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) throw verifyError;
    const { data: userData } = await supabase.auth.getUser();
    await loadProfile(userData.user);
    return session.value;
  }

  // Alternative to verifyMfaChallenge for a user who lost their authenticator
  // device (spec 005 US3) — server-side validates the code and removes the
  // now-inaccessible factor, so the session settles at aal1 (research.md §3).
  async function verifyRecoveryCode(code) {
    const { data, error } = await supabase.functions.invoke('verify-recovery-code', {
      body: { code },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const { data: userData } = await supabase.auth.getUser();
    await loadProfile(userData.user);
    return session.value;
  }

  // ── MFA enrollment (spec 005 US1) ───────────────────────────────────────────
  async function mfaEnroll() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error) throw error;
    return data; // { id: factorId, totp: { qr_code, secret, uri } }
  }

  async function mfaConfirmEnroll(factorId, code) {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) throw challengeError;
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) throw verifyError;
    await supabase.rpc('log_mfa_event', { action: 'enroll' });
  }

  async function mfaListFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return data.totp ?? [];
  }

  async function mfaUnenroll(factorId) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    await supabase.rpc('log_mfa_event', { action: 'unenroll' });
  }

  async function sha256Hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function randomRecoveryCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex.match(/.{1,4}/g).join('-');
  }

  // Generates 10 one-time recovery codes, stores only their hashes, and
  // returns the plaintext codes for one-time display (spec FR-005) — never
  // stored or logged in plaintext anywhere.
  async function generateAndStoreRecoveryCodes(userId) {
    await supabase.from('mfa_recovery_codes').delete().eq('user_id', userId).is('used_at', null);
    const codes = Array.from({ length: 10 }, () => randomRecoveryCode());
    const rows = await Promise.all(
      codes.map(async (code) => ({ user_id: userId, code_hash: await sha256Hex(code) })),
    );
    const { error } = await supabase.from('mfa_recovery_codes').insert(rows);
    if (error) throw error;
    return codes;
  }

  // Per-role, per-deployment MFA policy (spec 005 US4/FR-008-009) — the raw
  // policy flag for the current session's role, independent of enrollment
  // status. Used both by isMfaRequiredForRoleButUnenrolled() below and by
  // AccountSecurityView.vue to block dropping the only active factor to zero.
  async function isMfaRequiredForRole() {
    if (!session.value) return false;
    const { data: policy } = await supabase
      .from('mfa_role_policy')
      .select('required')
      .eq('role', session.value.role)
      .maybeSingle();
    return policy?.required ?? false;
  }

  // Has this user ever used a recovery code (regardless of current enrollment
  // state)? Used to prompt re-enrollment even for roles where MFA isn't
  // mandatory (spec US3 acceptance scenario 4 applies to any user, not just
  // required roles).
  async function hasUsedRecoveryCodeHistory() {
    if (!session.value) return false;
    const { count } = await supabase
      .from('mfa_recovery_codes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.value.id)
      .not('used_at', 'is', null);
    return (count ?? 0) > 0;
  }

  async function isMfaRequiredForRoleButUnenrolled() {
    if (!(await isMfaRequiredForRole())) return false;
    const factors = await mfaListFactors();
    return factors.length === 0;
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
    verifyMfaChallenge,
    verifyRecoveryCode,
    mfaEnroll,
    mfaConfirmEnroll,
    mfaListFactors,
    mfaUnenroll,
    generateAndStoreRecoveryCodes,
    hasUsedRecoveryCodeHistory,
    isMfaRequiredForRole,
    isMfaRequiredForRoleButUnenrolled,
    createUser,
    suspendUser,
    reactivateUser,
    logout,
  };
});
