# Phase 1 Data Model: MFA for Login

## New table: `mfa_recovery_codes`

| Field | Type | Notes |
|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `user_id` | `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | Owning account |
| `code_hash` | `TEXT NOT NULL` | Hash of the one-time code; plaintext is never stored, only ever
  shown once to the user at generation time (spec FR-005) |
| `used_at` | `TIMESTAMPTZ NULL` | `NULL` = unused; set once, permanently, on first successful use
  (spec FR-006) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

10 rows are inserted per enrollment (research.md §3's count decision), replacing any prior unused
set for that user when a fresh factor is enrolled (old unused codes for a since-removed factor are
deleted, since they'd otherwise still work against a different, newer factor's enrollment).

**RLS**: owning user may `SELECT` their own rows (to know how many remain unused, without ever
exposing `code_hash` meaningfully since it's a hash) — no `UPDATE`/`DELETE` policy for regular
users; only the `verify-recovery-code` Edge Function (service role) may mark a row used or delete
a superseded set, mirroring spec 004's `audit_log` append-only pattern (no mutation via normal
application code paths, per Constitution Principle V).

## New table: `mfa_role_policy`

| Field | Type | Notes |
|---|---|---|
| `role` | `TEXT PRIMARY KEY CHECK (role IN ('super_admin','country_admin','org_admin','viewer'))` | |
| `required` | `BOOLEAN NOT NULL DEFAULT false` | Per-deployment, per-role policy (spec FR-008) |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

Seeded with all 4 roles at `required = false` (default-optional, per this feature's
clarification). **RLS**: any authenticated user may `SELECT` (needed client-side to know whether
to force-route into enrollment); only `super_admin` may `UPDATE` (mirrors the existing
`super_admin_update_profiles` pattern from spec 004/001).

## No changes to existing tables

`profiles` (spec 001/002/004) is unchanged — role/country/org/suspension state already lives
there and this feature reads (not writes) `profiles.role` to look up the caller's `mfa_role_policy`
row. Supabase Auth's own internal `auth.mfa_factors`/`auth.mfa_challenges` tables (not owned by
this application's schema) hold the actual TOTP factor state — this feature only reads/writes them
through the `auth.mfa.*` client API and `admin.mfa.deleteFactor()`, never directly via SQL.

## New transient shape: AAL check result

Not persisted — the return value of `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`, consumed
immediately by `auth.js`/`router/index.js`:

```ts
interface AuthenticatorAssuranceLevels {
  currentLevel: 'aal1' | 'aal2' | null
  nextLevel: 'aal1' | 'aal2' | null
}
```

`nextLevel > currentLevel` (i.e., `aal1` → `aal2` available) means an active factor exists and a
challenge is pending; `nextLevel === currentLevel === 'aal1'` means no active factor (or fully
challenged already at `aal2 === aal2`).

## Relationships

```
auth.users (Supabase-managed) ──< mfa_recovery_codes (user_id FK)
auth.users (Supabase-managed) ──< auth.mfa_factors (Supabase-internal, not this app's schema)
profiles.role ──> mfa_role_policy.role (lookup, not a DB-level FK — role is a CHECK-constrained
                                         enum-like string on both sides, per existing convention)

verify-recovery-code Edge Function ──> UPDATE mfa_recovery_codes (marks used, service role)
                                    ──> admin.auth.mfa.deleteFactor() (Supabase Auth Admin API)
```
