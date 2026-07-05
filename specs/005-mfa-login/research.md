# Phase 0 Research: MFA for Login

## §1. TOTP enrollment/challenge/verify mechanism

**Decision**: Use Supabase Auth's native client-side MFA API directly —
`supabase.auth.mfa.enroll({ factorType: 'totp' })` (returns a QR/secret), `supabase.auth.mfa.challenge({ factorId })`
+ `supabase.auth.mfa.verify({ factorId, challengeId, code })` to confirm enrollment or satisfy a
login challenge, and `supabase.auth.mfa.unenroll({ factorId })` to remove a factor. All of these
run against the currently authenticated session using the existing anon-key client already used
everywhere in this codebase (`src/services/api/config.js`) — no service-role Edge Function needed
for enrollment/challenge/verify/unenroll themselves, since they act on "my own" factors.

**Rationale**: This is Supabase's documented, first-class MFA primitive — already available in
the `@supabase/supabase-js@2.97.0` version this project has installed (MFA landed in the SDK well
before that version). Building a custom TOTP implementation (secret generation, QR rendering, code
verification) would duplicate a well-tested primitive already provided, violating Principle VIII.

**Alternatives considered**: A third-party MFA-as-a-service provider (e.g., Twilio Authy API) —
rejected: introduces an external dependency and, for TOTP specifically, no capability Supabase
doesn't already provide; would also risk brushing against Principle II's "no external identity
federation" framing if not carefully scoped.

## §2. Enforcing the challenge before "full" access (spec FR-003)

**Decision**: After `supabase.auth.signInWithPassword()` succeeds, call
`supabase.auth.mfa.getAuthenticatorAssuranceLevel()`, which returns `{ currentLevel, nextLevel }`.
If `nextLevel` is `'aal2'` and `currentLevel` is `'aal1'`, the user has an active factor and must
complete a challenge — `auth.js`'s `login()` returns a distinct "MFA pending" result instead of a
normal session, and `LoginView.vue` renders a code-entry step instead of navigating away. Router's
`authGuard` (extended, not replaced — see `src/router/index.js`'s existing `authGuard` from spec
004) performs the same AAL check on every navigation: if a session is at `aal1` while its
`nextLevel` is `aal2`, every route redirects to the challenge screen except the challenge screen
itself and `/login` — this is what makes FR-003's "MUST NOT grant access to any protected area"
hold even if the user refreshes mid-challenge or navigates directly to a URL.

**Rationale**: This is Supabase's own documented AAL model — the JWT itself carries the current
assurance level, and the SDK exposes it directly, so no custom session-state tracking is needed.
Reusing the existing `authGuard` (rather than adding a second, parallel guard mechanism) keeps a
single place responsible for "can this navigation proceed."

**Alternatives considered**: Enforcing the AAL check only via Postgres RLS (checking
`auth.jwt()->>'aal'` inside policies) instead of the router — rejected as the *sole* mechanism
because it wouldn't stop the SPA's shell/UI from rendering (only data fetches would fail, which is
exactly the same category of gap spec 004 fixed for `/admin`'s role check). The router guard is
the primary gate; RLS-level AAL checks are noted as a *possible* defense-in-depth addition but not
required to satisfy this feature's functional requirements, per Principle VIII (smallest change
that satisfies acceptance criteria).

## §3. Recovery codes (no Supabase-native equivalent)

**Decision**: Supabase Auth has no built-in recovery-code concept — only the TOTP factor itself.
This feature adds a small custom mechanism:
1. A new `mfa_recovery_codes` table: one row per code, storing a hash (never the plaintext) of the
   code, the owning `user_id`, and a nullable `used_at`. Ten codes are generated at the moment a
   factor's enrollment is confirmed (a reasonable, industry-typical count — spec does not mandate
   an exact number).
2. At the login challenge step, if the user enters what looks like a recovery code instead of a 6-
   digit TOTP code, the frontend calls a new `verify-recovery-code` Edge Function (service role)
   instead of `supabase.auth.mfa.verify()`.
3. That function: hashes the submitted code, looks up an unused matching row for that user, marks
   it used (`used_at = now()`) if found, and — since Supabase has no API to force a session's AAL
   to `aal2` without a real factor challenge — instead calls
   `admin.auth.mfa.deleteFactor({ userId, factorId })` to remove the user's now-inaccessible TOTP
   factor entirely. With no active factor left, the user's `nextLevel` naturally becomes `aal1`
   again on their next assurance-level check, so the router guard lets them through at `aal1`
   (matching spec US3 acceptance scenario 2: "they are signed in successfully").
4. The frontend then detects "no active factor, but I just used a recovery code" (or simply: no
   active factor at all) and — per US3 acceptance scenario 4 — routes the user straight to the
   Account Security page with a prompt to re-enroll, rather than silently leaving them
   unprotected indefinitely.

**Rationale**: This is the only way to reconcile "accept a non-TOTP credential as a login factor"
with a system (Supabase Auth) that only knows how to verify TOTP factors — removing the
inaccessible factor is equivalent in effect to "the user is temporarily back to single-factor
until they re-enroll," which is exactly what the spec's acceptance scenario describes, without
requiring any unsupported "force AAL2" API that doesn't exist.

**Alternatives considered**: Storing recovery codes as additional TOTP-compatible secrets
registered as extra Supabase factors — rejected: Supabase's MFA factors are TOTP-specific (require
a real 30-second rolling code), not usable as arbitrary one-time tokens; would not actually work
for "print this code and use it once, whenever."

## §4. Per-role, per-deployment MFA policy (spec FR-008/FR-009)

**Decision**: A new small table, `mfa_role_policy(role TEXT PRIMARY KEY, required BOOLEAN NOT NULL
DEFAULT false)`, seeded with all 4 roles defaulting to `required = false` (per this feature's
clarification: optional by default). `auth.js`'s post-login flow checks this table for the
logged-in user's role; if `required = true` and the user has no active factor, they are routed
into enrollment (not the normal app) instead of merely being offered it.

**Rationale**: A dedicated tiny policy table (not a hardcoded per-role constant in application
code) is what actually satisfies spec SC-004 ("a deployment operator can change a role's policy
without any code change or new deployment") — editable directly via SQL by a deployment's own
super_admin, consistent with this platform's existing pattern of admin-editable Postgres tables
rather than environment variables or code constants for anything an operator might reasonably need
to change post-deployment.

**Alternatives considered**: A full dedicated admin UI page for editing this table — deferred as
a nice-to-have, not required by the spec's actual functional requirements (FR-008 only requires
the setting to be configurable per deployment, not that this feature ships a UI for it in v1);
direct SQL (`UPDATE mfa_role_policy SET required = true WHERE role = 'country_admin'`) already
satisfies "without any code change or new deployment," matching Principle VIII's smallest-change
guidance. A future feature can add an admin UI once there's a demonstrated need.

## §5. Audit trail (FR-011, Constitution Principle V)

**Decision**: Reuse the existing generic `log_table_change()` trigger (spec 004's established
pattern) by attaching it to the new `mfa_recovery_codes` table (captures recovery-code
generation/use) and by having `verify-recovery-code`'s `admin.mfa.deleteFactor()` call recorded
implicitly via whatever row changes it causes; enrollment/removal of a TOTP factor itself happens
through Supabase Auth's own internal `auth.mfa_factors` table (not one this app owns), so this
feature also inserts one explicit audit event via the existing audit-log insert pattern at the
point `auth.js` confirms enrollment/removal succeeded, since there is no local table row to
trigger off of for that half.

**Rationale**: Consistent with spec 004's decision to reuse `audit_log` rather than invent a
per-feature logging mechanism (Principle VIII), while still capturing the one piece of enrollment
state that lives entirely inside Supabase's own internal schema.

**Alternatives considered**: Polling Supabase's internal `auth.mfa_factors` table on a schedule to
reconstruct an audit trail after the fact — rejected as needless complexity; recording the event
at the moment `auth.js` observes a successful enroll/unenroll call is simpler and immediate.
