# Phase 1 Data Model: CAP v1.2 Envelope & Export

## Entity: `cap_drafts` (existing, extended)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | unchanged; **now doubles as the exported CAP `<identifier>`** |
| `sender` | TEXT | **new column**, `NOT NULL DEFAULT ''` at the schema level but always populated with a real value by `set_cap_sender()` (`BEFORE INSERT` trigger) before any row is ever visible; format `{org_name-or-'GEWS'}@{country_code-or-'global'}.gews.local` |
| `is_exercise` | BOOLEAN | existing (spec 013); **now also drives the exported CAP `<status>` (`Exercise` vs `Actual`)** |
| `supersedes_id` | UUID FK → `cap_drafts(id)` | existing; **now also drives export `msgType`/`<references>`** |
| `broadcast_at` | TIMESTAMPTZ, nullable | **new column**. Set once, the first time `status` transitions to `'broadcast'`; never changed afterward, even if the alert later moves to `cancelled`/`false_alarm`/`all_clear`/`expired`. This is the authoritative "was this alert ever actually broadcast?" signal — `status` alone cannot answer that, since the state machine allows `cancelled` to be reached directly from `draft`/`pending_approval`/`approved` without ever passing through `broadcast`. |
| *(all other existing columns)* | — | unchanged, read (not modified) by export generation |

**New trigger**: `set_cap_sender()` — `BEFORE INSERT ON cap_drafts`, computes `NEW.sender` as
described above by looking up `organizations.name` via `NEW.org_id` when present.

**Modified trigger function**: `guard_cap_draft_transition()` gains two changes:
1. The existing completeness check (step 5, "before entering `pending_approval`") gains one more
   required-non-blank condition: `sender`.
2. A new step sets `NEW.broadcast_at := NOW()` whenever `OLD.status IS DISTINCT FROM NEW.status
   AND NEW.status = 'broadcast' AND OLD.broadcast_at IS NULL` — guarding with `OLD.broadcast_at IS
   NULL` makes this idempotent/set-once even though `broadcast` cannot currently be re-entered per
   the existing transition graph (defense-in-depth against a future transition-graph change).

## Computed export shape (not stored — generated fresh per request)

| CAP field | Source |
|---|---|
| `identifier` | `draft.id` |
| `sender` | `draft.sender` |
| `sent` | `draft.created_at` (CAP date-time format) |
| `status` | `"Exercise"` if `draft.is_exercise` else `"Actual"` |
| `msgType` | `capMsgType(draft)` — `Cancel` / `Update` / `Alert` (see research.md) |
| `scope` | always `"Public"` (spec.md Assumptions) |
| `references` | `{superseded.sender},{superseded.id},{superseded.effective_at}` when `draft.supersedes_id` resolves to a found row; omitted otherwise |
| `info.category` | derived from `draft.hazard_type` (CAP category enum, e.g. `Geo` for earthquake, `Fire` for wildfire, `Met` for flood/drought, `Safety` for food_security, etc.) |
| `info.event` | `draft.hazard_type` (human-readable, e.g. via existing hazard taxonomy `display_name` when available) |
| `info.urgency` / `info.severity` / `info.certainty` | `draft.urgency` / `draft.severity` / `draft.certainty` — already CAP-aligned string values per existing CHECK constraints |
| `info.effective` / `info.expires` | `draft.effective_at` / `draft.expires_at` |
| `info.headline` / `info.description` | `draft.title` / `draft.description` |
| `info.instruction` | `draft.instructions` |
| `info.area.areaDesc` | `draft.area_desc` |

## Relationships

- `cap_drafts.supersedes_id → cap_drafts.id` (existing FK, unchanged) — the export's `<references>`
  element is built by fetching this row, not by adding a new relationship.
