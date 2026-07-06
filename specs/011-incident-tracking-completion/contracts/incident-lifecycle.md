# Contract: Incident Lifecycle Guard

This project has no REST API layer for these operations (direct Supabase client `update`/`insert`
calls guarded by RLS + triggers). This contract documents the enforced data-layer behavior that
any client (UI, script, or future integration) must comply with.

## Operation: Update `incidents.status`

**Trigger**: `guard_incident_transition()` — `BEFORE UPDATE OF status ON incidents`

**Input**: `NEW.status`, evaluated against `OLD.status` and `NEW.post_event_notes`.

**Behavior**:

| OLD.status | NEW.status | Result |
|---|---|---|
| `open` | `in_progress` | Allowed |
| `open` | anything else (`monitoring`, `closed`, `archived`, `open`) | Rejected — `RAISE EXCEPTION 'invalid_incident_transition: ...'` |
| `in_progress` | `monitoring` or `closed` | Allowed |
| `in_progress` | anything else | Rejected |
| `monitoring` | `closed`, with non-blank `NEW.post_event_notes` | Allowed |
| `monitoring` | `closed`, with null/blank `NEW.post_event_notes` | Rejected — `RAISE EXCEPTION 'aar_required: after-action notes are required to close a monitored incident'` |
| `monitoring` | anything else | Rejected |
| `closed` | `archived` | Allowed |
| `closed` | anything else | Rejected |
| `archived` | anything | Rejected (terminal state) |

**Client contract**: The frontend (`incidentStateMachine.js`) MUST pre-validate using
`isValidIncidentTransition(from, to)` and `requiresAAR(from, to)` before submitting an update, so
the user sees a specific, immediate error (FR-010) rather than waiting for a round-trip Postgres
exception. The DB trigger remains the source of truth and MUST reject non-compliant writes even if
the client is bypassed.

## Operation: Insert into `sop_documents`

**RLS**: only `super_admin` may `INSERT`/`UPDATE`/`DELETE`. All authenticated users may `SELECT`
rows where `is_active = true`; `super_admin` may `SELECT` all rows (active and inactive).

**Required fields**: `title`, `hazard_type_code` (must reference an existing `hazard_types.code`).
At least one of `body_content` / `reference_url` should be populated (enforced at the form layer).

## Operation: Insert into `incidents` from a CAP alert (Story 4)

**Precondition**: the referenced `cap_drafts` row MUST have `status = 'broadcast'`. The client
MUST NOT offer or attempt this action for drafts in any other status (`draft`,
`pending_approval`, `approved`, `cancelled`, etc.).

**Behavior**: a normal `incidents` insert, pre-filled with:
- `hazard_type` ← `cap_drafts.hazard_type`
- `severity` ← `cap_drafts.severity`
- `area_desc` ← `cap_drafts.area_desc`
- `linked_cap_id` ← `cap_drafts.id`
- `status` ← `'open'` (default, unchanged from existing incident-creation behavior)

Existing `incidents` RLS insert policies (unchanged by this spec) continue to scope who may
perform this insert (super_admin: any; country_admin/org_admin: their own
country/organization).
