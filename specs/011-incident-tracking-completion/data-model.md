# Phase 1 Data Model: Incident Tracking Completion

## Entity: `incidents` (existing, extended with enforcement only — no column changes)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | unchanged |
| `title` | TEXT NOT NULL | unchanged |
| `description` | TEXT | unchanged |
| `hazard_type` | TEXT NOT NULL | unchanged; used to match `sop_documents.hazard_type_code` |
| `severity` | TEXT CHECK | unchanged |
| `status` | TEXT CHECK (`open`\|`in_progress`\|`monitoring`\|`closed`\|`archived`) | unchanged column/constraint; **now additionally enforced by `guard_incident_transition()` trigger** |
| `post_event_notes` | TEXT | unchanged column; **now required (non-null, non-blank) when transitioning `monitoring`→`closed`** |
| `linked_cap_id` | UUID FK → `cap_drafts(id)` | unchanged column; **now populated by the new "create incident from alert" action** |
| `sop_refs` | JSONB | unchanged, remains unused/deliberately bypassed (see research.md) |
| *(all other existing columns)* | — | unchanged |

### State Transitions (enforced by new trigger, mirrored by `incidentStateMachine.js`)

| From | Allowed To | Extra condition |
|---|---|---|
| `open` | `in_progress` | none |
| `in_progress` | `monitoring`, `closed` | none |
| `monitoring` | `closed` | `post_event_notes` must be non-null and non-blank (AAR requirement, FR-002) |
| `closed` | `archived` | none |
| `archived` | *(none)* | terminal state; any transition attempt rejected |

Any transition not listed above (including same-state no-ops, e.g. `open`→`open`) MUST be rejected
by both the DB trigger and the pure JS mirror function.

## Entity: `sop_documents` (new)

| Field | Type | Constraints |
|---|---|---|
| `id` | UUID PK | `DEFAULT gen_random_uuid()` |
| `title` | TEXT NOT NULL | |
| `hazard_type_code` | TEXT NOT NULL | FK → `hazard_types(code)` |
| `body_content` | TEXT | procedure text; nullable if only a reference link is provided |
| `reference_url` | TEXT | nullable; external document link |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | inactive SOPs excluded from non-super-admin `SELECT` and from incident-matching display |
| `created_by` | UUID FK → `auth.users(id)` ON DELETE SET NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | `updated_at` maintained by existing `set_updated_at()` trigger function |

**Validation rule**: at least one of `body_content` or `reference_url` must be present (checked at
the application/form layer per FR-004's "text and/or a reference link" wording; not a hard DB
CHECK, to keep the schema simple per Principle VIII).

**Relationships**:
- `sop_documents.hazard_type_code` → `hazard_types.code` (spec 010 registry; enables Principle I
  compliance — new hazard types automatically become available as SOP tags with no code change).
- Matched to `incidents` at read-time by `sop_documents.hazard_type_code = incidents.hazard_type`
  (no FK between `incidents` and `sop_documents` — this is a query-time join, not a stored
  relationship, consistent with `sop_refs` being deliberately bypassed).

**RLS**:
- `super_admin`: `FOR ALL`
- all other authenticated roles: `FOR SELECT USING (is_active = true)`

**Audit**: covered by the existing generic `log_table_change()` trigger (`AFTER INSERT OR UPDATE
OR DELETE`), same as every other admin-managed registry table in this project.

## Entity: `cap_drafts` (existing, referenced only — no changes)

Read-only reference for Story 4: `hazard_type`, `severity`, `area_desc` (or equivalent existing
fields) are read from a `cap_drafts` row with `status = 'broadcast'` to pre-fill a new `incidents`
row, and that row's `id` is stored into the new incident's `linked_cap_id`.
