# Research: Generic Integration Credentials Management

## Decision 1: Registry table shape mirrors `hazard_types`

**Decision**: `integration_types(code PK, display_name, field_template JSONB, is_active)`,
super_admin-only write RLS, everyone-authenticated read RLS — structurally identical to spec 010's
`hazard_types` registry pattern.

**Rationale**: This project already has a proven, reviewed pattern for "a global registry only
super_admin can define, with structured JSONB metadata read by every consumer" — reusing it avoids
inventing a new authorization/data shape for what is conceptually the same kind of problem
(pluggable types with structured config).

**Alternatives considered**:
- *A flat enum/CHECK constraint of known integration codes*: Rejected — defeats the entire point
  of this spec (adding a new integration type would require a schema migration again, exactly what
  FR-001/SC-004 are meant to avoid).

## Decision 2: Credential values stay in Vault; only field *names* are tracked in Postgres

**Decision**: `integration_settings` stores `configured_field_keys` (a JSONB array of strings —
which field names were set) and `is_configured`, never values. The actual values live only in
Supabase Vault, exactly as spec 019 (compliance reports, unrelated secrets) and spec 022 (WhatsApp)
already do.

**Rationale**: Matches this project's established secret-handling boundary — Postgres rows (readable
via RLS by admins) never contain credential material; only Vault (accessed exclusively through a
single SECURITY DEFINER function) does. Continuing this exact boundary for a generalized system is
what makes the security review of spec 022 still apply here — extending a reviewed pattern rather
than inventing a new credential-storage mechanism.

**Alternatives considered**:
- *Store field values directly in the `integration_settings` row (even encrypted-at-rest)*:
  Rejected — bypasses the existing Vault boundary and would need its own new security review;
  Vault already exists and does this job.

## Decision 3: Vault secret naming — `integration_creds_<country_code>_<integration_type_code>`

**Decision**: One Vault secret per (country, integration type) pair, named predictably so
`save_integration_credentials()` can look it up the same way `save_whatsapp_credentials()` did
(`SELECT id FROM vault.secrets WHERE name = ...` → `update_secret` if found, else `create_secret`).

**Rationale**: Direct generalization of spec 022's exact lookup-then-upsert pattern (which itself
generalized spec 019's), avoiding the `secrets_name_idx` unique-constraint failure this project
already hit once before spec 019 existed.

**Alternatives considered**:
- *One Vault secret per country covering all integration types (nested JSON)*: Rejected — makes a
  single integration type's update require read-modify-write of a shared blob, and one integration
  type's credential leak/rotation would need touching a bigger shared secret. Per-(country, type)
  secrets are simpler and match the granularity of what's actually being configured.

## Decision 4: Hard cutover, no data migration

**Decision**: `DROP TABLE whatsapp_integration_settings` and `DROP FUNCTION
save_whatsapp_credentials` in the same migration that creates the new tables/function. No
migration of existing rows.

**Rationale**: Confirmed via code search that `dispatch-alert`'s WhatsApp adapter is still a mock
(a TODO comment only) — nothing in production reads these credentials today, so there is no
real-world "in-use" WhatsApp configuration to preserve. This was an explicit, deliberate choice
(not an oversight) confirmed with the project owner before writing this spec.

**Alternatives considered**:
- *Migrate existing `whatsapp_integration_settings` rows into `integration_settings` with
  `integration_type_code = 'whatsapp'`*: Considered but rejected as unnecessary complexity for data
  that (per the above) has no real consumer yet; if any row exists from manual testing, it simply
  needs to be re-entered once through the new panel — an acceptable, explicitly accepted cost.

## Decision 5: Custom fields are simple key-value pairs, not schema-validated

**Decision**: The admin form allows appending free-form `{name, value}` pairs beyond an integration
type's template; the RPC's only validation is "every value (predefined or custom) must be
non-blank" and "no zero-field submission" — no per-field type/format validation.

**Rationale**: Matches FR-004/FR-005 and the spec's explicit YAGNI stance — this project's own
constitution favors simplicity, and schema-based per-integration-type field validation (e.g.
"phone_number_id must be numeric") is speculative for integrations that don't exist yet.

**Alternatives considered**:
- *Per-field regex/type validation defined in `field_template`*: Rejected as speculative,
  YAGNI — can be added later if a real integration type actually needs it.
