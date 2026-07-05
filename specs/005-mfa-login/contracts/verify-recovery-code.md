# Contract: `supabase/functions/verify-recovery-code/index.ts` (new Edge Function)

Follows the same caller-resolution structure as `create-user`/`suspend-user` (spec 004) — but the
"caller" here is the person attempting login, identified by an aal1-only access token from the
in-progress login attempt, not an already-fully-authenticated admin.

## Request

```
POST /functions/v1/verify-recovery-code
Authorization: Bearer <aal1 access token from the in-progress login>
Content-Type: application/json

{ "code": "string" }
```

## Server-side steps

1. Resolve caller via `admin.auth.getUser(bearerToken)` (401 if invalid).
2. Reject (403) if the caller's `profiles.is_active` is `false` (spec 004 suspension — a suspended
   account must not be able to use a recovery code to get in, per spec 005 FR-010).
3. Hash the submitted `code`; look up an unused (`used_at IS NULL`) row in `mfa_recovery_codes` for
   this `user_id` matching that hash.
4. If none found: 400 `{ "error": "Invalid or already-used recovery code" }`.
5. If found: mark it used (`used_at = now()`), then call
   `admin.auth.mfa.deleteFactor({ userId, factorId })` for the user's active TOTP factor (looked up
   via `admin.auth.mfa.listFactors({ userId })`) — removing the now-inaccessible factor so the
   session naturally settles at `aal1` (research.md §3).
6. Return `{ ok: true }`.

## Response

- `200`: `{ "ok": true }`
- `400`: `{ "error": "Invalid or already-used recovery code" }`
- `401`: `{ "error": "Invalid session" }`
- `403`: `{ "error": "Account suspended" }`
- `500`: `{ "error": "..." }`

## Called by

`src/stores/auth.js`'s new `verifyRecoveryCode(code)`, invoked from `LoginView.vue`'s challenge
step when the user chooses "use a recovery code instead." On success, the frontend proceeds with
the normal post-login flow (`loadProfile()`) since the session is now at a settled `aal1` with no
pending challenge, and separately triggers the "re-enrollment recommended" prompt on next arrival
at any protected route (spec US3 acceptance scenario 4, enforced by the same
`isMfaRequiredForRoleButUnenrolled`-style check described in contracts/login-mfa-flow.md, generalized
to "just used a recovery code" as well as "role requires MFA").
