# Data Model: Admin Panel Capability Grants

## Entity: `profile_capability_grants` (NEW table)

Represents one admin-panel capability granted to one specific user.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `profile_id` | `UUID` | `NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`, part of composite PK | The grantee |
| `capability` | `TEXT` | `NOT NULL CHECK (capability IN ('hazard_taxonomy','sop_repository','map_layers','audit'))`, part of composite PK | Which of the 4 admin areas |
| `granted_by` | `UUID` | `NOT NULL REFERENCES profiles(id)` | Who granted it (FR-011) |
| `granted_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | When granted (FR-011) |

**Primary key**: `(profile_id, capability)` — one row per active grant; a grant either exists or
doesn't (no status/state column — deleting the row is the revoke action, per FR-002).

**Trigger**: `BEFORE INSERT` — rejects the insert (raises exception) unless the target
`profiles.id = NEW.profile_id` currently has `role IN ('country_admin', 'org_admin')` (FR-003).
Mirrors the existing `prevent_self_role_escalation()` trigger's enforcement style.

**Relationships**:
- Many-to-one with `profiles` (grantee) via `profile_id`.
- Many-to-one with `profiles` (granter) via `granted_by`.

**Validation rules** (from spec Functional Requirements):
- A row may only exist for a profile whose role is `country_admin` or `org_admin` at insert time
  (FR-003) — enforced by trigger, not just application code.
- `capability` MUST be one of exactly 4 known values (FR-001) — enforced by `CHECK` constraint.
- No two rows may exist for the same `(profile_id, capability)` pair — enforced by composite PK
  (granting an already-granted capability is a no-op, not an error — see contracts).

## New SQL helper function: `current_profile_has_capability(cap TEXT)`

```
current_profile_has_capability(cap TEXT) RETURNS BOOLEAN
  SECURITY DEFINER STABLE
  -- Returns false if the caller is not active (mirrors current_profile_role()'s suspension
  -- short-circuit) or has no grant row for `cap`; true otherwise.
```

This function does not replace or modify `current_profile_role()` — it is a new, independent
choke point used only by the 5 new additive policies described below.

## RLS Policy Additions (all additive — no existing policy modified or removed)

| Table | New Policy | Effect |
|---|---|---|
| `profile_capability_grants` | `super_admin_capability_grants_all` | `current_profile_role() = 'super_admin'` may INSERT/SELECT/DELETE any row |
| `profile_capability_grants` | `self_read_own_capability_grants` | `profile_id = auth.uid()` may SELECT own rows |
| `hazard_types` | `capability_granted_hazard_taxonomy_all` | `current_profile_has_capability('hazard_taxonomy')` gets same CRUD as existing `super_admin_hazard_types_all` |
| `hazard_thresholds` | `capability_granted_hazard_thresholds_all` | Same, for `hazard_thresholds` |
| `sop_documents` | `capability_granted_sop_repository_all` | `current_profile_has_capability('sop_repository')` gets same CRUD as existing `super_admin_sop_documents_all` |
| `map_layers` | `capability_granted_map_layers_all` | `current_profile_has_capability('map_layers')` gets same CRUD as existing `super_admin_map_layers_all` |
| `audit_log` | `capability_granted_audit_read` | `current_profile_has_capability('audit')` gets same SELECT as existing `super_admin_read_audit` (audit_log has no write path via RLS today — INSERT is trigger-only — so this is read-only, matching existing Super Admin access exactly) |

No policy above alters the `USING`/`WITH CHECK` clause of any existing policy — each is a brand
new `CREATE POLICY` statement, additive per Constitution Principle VIII and the project's own
migration convention (verified: every prior spec in this repo adds policies this way, e.g. spec
015's `region_code` matching layer).

## Frontend session shape addition

`src/stores/auth.js`'s `session` gains one new optional field:

```
session.capabilities: string[]   // e.g. ['hazard_taxonomy', 'audit'], [] if none or suspended
```

Populated during the existing profile-load step by a `SELECT capability FROM
profile_capability_grants WHERE profile_id = auth.uid()` query, run alongside the existing
`profiles` select. Super Admin's `session.capabilities` is irrelevant (already has full access via
`auth.isSuperAdmin`) and is not specially populated — the four tab guards check
`auth.isSuperAdmin || session.capabilities.includes(x)` so Super Admin never depends on this field.
