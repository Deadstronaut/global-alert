# Contract: Login flow with MFA challenge

## `src/stores/auth.js` — `login(email, password)` (modified)

Existing behavior (password verification, `loadProfile()`) is unchanged up to the point of
success. New behavior after `signInWithPassword` succeeds:

```js
const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
if (data.currentLevel === 'aal1' && data.nextLevel === 'aal2') {
  // Active factor exists — do NOT load the profile / consider login complete yet.
  return { mfaPending: true }
}
await loadProfile(data.user)
return session.value
```

`LoginView.vue` checks the returned shape: if `mfaPending`, render a code-entry step instead of
navigating away. That step calls a new `auth.js` function:

```js
async function verifyMfaChallenge(factorId, code) {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeError) throw challengeError
  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId, challengeId: challenge.id, code,
  })
  if (verifyError) throw verifyError
  const { data: userData } = await supabase.auth.getUser()
  await loadProfile(userData.user)
  return session.value
}
```

For a recovery code instead of a TOTP code, `LoginView.vue` instead calls
`auth.verifyRecoveryCode(code)`, which invokes the `verify-recovery-code` Edge Function
(contracts/verify-recovery-code.md) and then re-runs the normal post-login `loadProfile()` flow,
since a successful recovery-code use leaves the session at `aal1` (research.md §3).

## `src/router/index.js` — `authGuard` (extended again, on top of spec 004's role check)

```js
export async function authGuard(to) {
  const auth = useAuthStore()
  await auth.init()
  if (to.meta.public) return true
  if (!auth.isLoggedIn) return { name: 'login' }
  if (to.meta.roles && !to.meta.roles.includes(auth.session?.role)) return { name: 'home' }

  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const mfaPending = data.currentLevel === 'aal1' && data.nextLevel === 'aal2'
  if (mfaPending && to.name !== 'mfa-challenge') return { name: 'mfa-challenge' }

  const mfaRequiredButUnenrolled = await auth.isMfaRequiredForRoleButUnenrolled()
  if (mfaRequiredButUnenrolled && to.name !== 'account-security') return { name: 'account-security' }

  return true
}
```

New routes: `/mfa-challenge` (public: false, no role meta — reachable by any authenticated-but-
not-yet-aal2 session) and `/account-security` (public: false, no role meta — reachable by every
role, per this feature's clarification that enrollment must not live inside `/admin`).

## Internal helper: `auth.isMfaRequiredForRoleButUnenrolled()`

Looks up `mfa_role_policy` for the session's role; returns `true` only if `required = true` for
that role AND `supabase.auth.mfa.listFactors()` shows no verified TOTP factor. Used both by the
router guard (to force enrollment) and by `AccountSecurityView.vue` (to show a "your role requires
this" banner rather than presenting enrollment as merely optional).
