# Data Model: Region-Scoped Dissemination Targeting

## Entities

### CAP Alert Draft (`cap_drafts`) — modified

New column:

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `region_code` | `TEXT` | YES | `NULL` | Free-text sub-national region the alert affects. `NULL` means "applies country-wide," identical to today's behavior. Not validated against any registry — mirrors `contacts.region_code`'s existing convention. |

No changes to any existing column, constraint, or trigger's *signature* (the existing `log_table_change()` audit
trigger and `set_updated_at()` trigger fire on any row change automatically, no redefinition needed). The
`guard_cap_draft_transition()` completeness gate (from specs 006/014) is **not** extended to require `region_code` —
it stays optional at every lifecycle stage, per FR-002.

### Contact (`contacts`) — unchanged

`region_code TEXT` already exists (spec 009, `20260707120000_contacts.sql`). No migration needed. This feature is
the first consumer of this column in dispatch logic.

## Matching Logic (pure function, `dispatchMatching.ts`)

### `DispatchableContact` (interface, modified)

Adds `region_code: string | null` — the interface previously omitted a field the real `contacts` table already has,
which is why it silently couldn't be used; this was a genuine interface/schema gap, not a new capability being
bolted onto the contact side.

### `DispatchableCapDraft` (interface, modified)

Adds `region_code: string | null`.

### `matchesContact()` region rule (new predicate, ANDed with all existing checks)

```
regionMatches(contact.region_code, draft.region_code) :=
  contact.region_code is null/empty
  OR draft.region_code is null/empty
  OR normalize(contact.region_code) == normalize(draft.region_code)

normalize(s) := trim(s).toLowerCase()
```

This is evaluated as an *additional* condition alongside the existing `country_code` equality and
`hazard_type_filter` checks — never a replacement. If `regionMatches` is false, the contact is excluded from that
alert's dispatch (for both email and WhatsApp checks, which already call `matchesContact()` independently per
channel).

## State / Lifecycle

No new states. `region_code` is a plain attribute settable at any point in the existing `cap_drafts` lifecycle
(draft → pending_approval → approved → broadcast → ...), like `area_desc` — it is not part of the state machine and
is not part of the broadcast completeness gate.
