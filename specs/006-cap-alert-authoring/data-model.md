# Data Model: CAP Alert Authoring (Hardening)

## `cap_drafts` (existing table — additive changes only)

Existing columns (unchanged, from `20260605120100_cap_drafts.sql`): `id`, `hazard_type`,
`severity`, `certainty`, `urgency`, `title`, `description`, `instructions`, `area_desc`,
`area_polygon`, `lat`, `lng`, `radius_km`, `effective_at`, `expires_at`, `lang`, `translations`,
`status`, `supersedes_id`, `dedup_hash`, `created_by`, `approved_by`, `country_code`, `org_id`,
`created_at`, `updated_at`.

### New columns

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `source_event_id` | TEXT | Yes | Best-effort identifier of the detected hazard event this draft was created from (denormalized snapshot reference, no FK — research.md §4). NULL for blank-started drafts. |
| `last_edited_by` | UUID REFERENCES auth.users(id) | Yes | Tracks who most recently edited draft content, for the four-eyes check (distinct from `created_by`, since a draft can be edited by its author after creation but before submission). Set on every UPDATE via trigger. |
| `rejection_reason` | TEXT | Yes | Required when a reviewer transitions a draft to `rejected`. Visible to the original author. |
| `cancellation_reason` | TEXT | Yes | Required when any authorized user transitions a draft to `cancelled`. |

### Status values (unchanged, existing CHECK constraint)

`draft`, `pending_approval`, `approved`, `broadcast`, `rejected`, `cancelled`, `expired`,
`false_alarm`, `all_clear`.

### Transition table (existing + one addition)

| From | Allowed To (existing) | New |
|---|---|---|
| `draft` | `pending_approval`, `cancelled` | — |
| `pending_approval` | `approved`, `rejected`, `cancelled` | — |
| `approved` | `broadcast`, `cancelled` | — |
| `broadcast` | `false_alarm`, `all_clear`, `expired` | — |
| `rejected` | *(none — terminal today)* | `draft` (allows author to revise and resubmit, per US2) |
| `cancelled` / `expired` / `false_alarm` / `all_clear` | *(none — terminal)* | — |

Enforced server-side by a new `guard_cap_draft_transition()` `BEFORE UPDATE` trigger (research.md
§2), mirroring the client-side `TRANSITIONS` map already in `CapView.vue` (which must be updated
to add `rejected: ['draft']` to stay in sync).

### New invariants (enforced by `guard_cap_draft_transition()`)

1. **Four-eyes**: on a transition out of `pending_approval` (to `approved` or `rejected`), the
   acting user (`auth.uid()`) MUST NOT equal `created_by` or `last_edited_by` of the row being
   updated.
2. **Broadcast immutability**: if `OLD.status = 'broadcast'`, any change to a CAP content column
   (see research.md §3 list) is rejected regardless of the requested new `status`.
3. **Transition validity**: `NEW.status` must be in the allowed-to set for `OLD.status` per the
   table above (when `status` is changing at all).
4. **Reason required**: a transition to `rejected` requires non-null/non-empty
   `NEW.rejection_reason`; a transition to `cancelled` requires non-null/non-empty
   `NEW.cancellation_reason`.
5. **Completeness gate**: a transition to `pending_approval` requires `title`, `description`,
   `instructions`, `area_desc`, `severity`, `certainty`, `urgency`, `hazard_type` to all be
   non-empty on the resulting row.

## Relationships

- `cap_drafts.created_by` / `last_edited_by` / `approved_by` → `auth.users(id)` (existing +
  new, `ON DELETE SET NULL`).
- `cap_drafts.source_event_id` — informational only, no FK (research.md §4).
- `cap_drafts.org_id` → `organizations(id)` (existing, unchanged).
- Audit trail: every INSERT/UPDATE/DELETE on `cap_drafts` continues to flow through the existing
  `audit_cap_drafts` trigger → `log_table_change()` → `audit_log` (unchanged).
