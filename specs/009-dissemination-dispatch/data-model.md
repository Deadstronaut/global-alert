# Data Model: Dissemination & Contact Directory

## contacts

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `gen_random_uuid()` |
| full_name | TEXT NOT NULL | |
| email | TEXT | nullable — a contact may be WhatsApp-only |
| whatsapp_number | TEXT | E.164 format, validated at insert/update (`CHECK` + app-level regex) |
| preferred_language | TEXT NOT NULL DEFAULT 'en' | matches existing `lang` convention on `cap_drafts` |
| country_code | VARCHAR(2) NOT NULL | server-enforced on write, same pattern as `profiles.country_code` |
| region_code | TEXT | optional, mirrors `profiles.region_code` (spec 002); not used for matching yet (research.md §4) |
| hazard_type_filter | TEXT | nullable; `NULL` = matches all hazard types |
| email_opt_in | BOOLEAN NOT NULL DEFAULT true | |
| whatsapp_opt_in | BOOLEAN NOT NULL DEFAULT true | |
| org_id | UUID REFERENCES organizations(id) ON DELETE SET NULL | for org_admin scoping, same as `profiles.org_id` |
| is_active | BOOLEAN NOT NULL DEFAULT true | deactivation, not hard delete (FR-004) |
| created_by | UUID REFERENCES auth.users(id) ON DELETE SET NULL | |
| created_at / updated_at | TIMESTAMPTZ | standard `set_updated_at()` trigger |

**Constraints**: `CHECK (email IS NOT NULL OR whatsapp_number IS NOT NULL)` — a contact must have at least one reachable channel. `CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^\+[1-9]\d{6,14}$')` for E.164 (FR-016). Unique index on `(lower(email), country_code)` where `email IS NOT NULL`, to reject exact duplicates (edge case, FR-003).

**RLS**: `super_admin_contacts_all` (FOR ALL, any country — includes DELETE). `country_admin_contacts_own`/`org_admin_contacts_own` are **FOR SELECT, INSERT, UPDATE only** (`country_code`/`org_id` match) — deliberately NOT `FOR ALL`, since FR-004 forbids hard-delete for these roles (contracts/contacts-crud.md); only `super_admin` may delete a contact, mirroring `super_admin_delete_boundary` from spec 002. No public/anon read (contacts are never public data).

**Audit**: `log_table_change()` trigger, same as every other admin-managed table.

## dispatch_jobs

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| cap_draft_id | UUID NOT NULL REFERENCES cap_drafts(id) ON DELETE CASCADE | one job per broadcasting draft |
| status | TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')) | |
| matched_contact_count | INTEGER NOT NULL DEFAULT 0 | recipients identified at dispatch time |
| started_at / completed_at | TIMESTAMPTZ | nullable until reached |
| failure_reason | TEXT | set when status = 'failed' (e.g., provider entirely unreachable) |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**State machine** (mirrors `data_sources.health_state` / source-health pattern in shape, not meaning):
`queued → running → completed`
`queued → running → failed`
Invalid transitions (e.g., `completed → running`) are rejected by a `BEFORE UPDATE` trigger, same style as `guard_cap_draft_transition()`.

**Index**: `(cap_draft_id)`, `(status, created_at DESC)`.

**RLS**: readable by super_admin (all rows) and country_admin/org_admin (via join to `cap_drafts.country_code`/`org_id`, own scope only). No separate "Auditor" role/policy — `profiles.role` only ever contains `super_admin`/`country_admin`/`org_admin`/`viewer` (spec 007 hit this same SRS-persona-vs-real-role gap and resolved it the same way: cross-tenant compliance visibility is a `super_admin` capability, not a fourth role). No public/anon access, no `viewer` access. Writes only via the `dispatch-alert` Edge Function (service role) — no direct client INSERT/UPDATE policy.

**Audit**: `log_table_change()` trigger.

## dispatch_receipts

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| dispatch_job_id | UUID NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE | |
| contact_id | UUID REFERENCES contacts(id) ON DELETE SET NULL | kept nullable so a receipt survives if the contact is later removed |
| channel | TEXT NOT NULL CHECK (channel IN ('email','whatsapp')) | |
| status | TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','failed','bounced')) | |
| provider_message_id | TEXT | e.g. Resend's message id, for correlation |
| failure_reason | TEXT | populated on `failed`/`bounced` |
| retry_count | INTEGER NOT NULL DEFAULT 0 | incremented on each retry attempt |
| is_mock | BOOLEAN NOT NULL DEFAULT false | true for the WhatsApp mock adapter path (research.md §3) |
| sent_at / delivered_at | TIMESTAMPTZ | nullable until reached |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**State machine**: `queued → sent → delivered`, `queued → sent → failed`, `queued → sent → bounced`, `queued → failed` (send attempt itself errors before reaching the provider). One `dispatch_receipts` row per `(dispatch_job_id, contact_id, channel)` — a contact opted into both channels gets two rows.

**Index**: `(dispatch_job_id, status)`, `(contact_id)`.

**RLS**: same visibility tier as `dispatch_jobs` (joined through it). No direct client writes — only the `dispatch-alert` Edge Function (service role) creates/updates receipts.

**Audit**: `log_table_change()` trigger. (Note: `log_table_change()` currently assumes an `id` PK column, per the fix in `20260706190000_fix_log_table_change_missing_id.sql` it now reads via `to_jsonb(...)->>'id'` — all three new tables have a real `id` column, so no further fix is needed there.)

## Relationships

```
cap_drafts (1) ──< dispatch_jobs (1) ──< dispatch_receipts (N) >── contacts (1)
                                                                        ^
                                                          organizations (1) [org_id]
```
