# Contract: Drill Exercise Isolation

No REST API layer exists for this project. This contract documents the enforced DB-trigger
behavior.

## Trigger: `set_cap_exercise_flag()` — `BEFORE INSERT ON cap_drafts`

**Behavior**: `NEW.is_exercise := EXISTS (SELECT 1 FROM drill_sessions ds WHERE ds.status =
'active' AND ds.country_code = NEW.country_code)`.

**Client contract**: `CapView.vue`'s `submitDraft()` does not need to (and should not) set
`is_exercise` explicitly — it is always computed server-side at insert time. No client code path
can override this to `false` for an alert that should be exercise-flagged, nor to `true` for one
that shouldn't; the trigger is unconditional.

## Trigger: `notify_dispatch_on_broadcast()` — modified `WHEN` clause

**Before (spec 009)**: `WHEN (NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status)`

**After (this spec)**: `WHEN (NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status
AND NOT NEW.is_exercise)`

**Behavior table**:

| `is_exercise` | Transition | Dispatch initiated? |
|---|---|---|
| `false` | any → `broadcast` | Yes (unchanged from spec 009) |
| `true` | any → `broadcast` | No — trigger does not fire at all |

**Client contract**: no client code needs to check `is_exercise` before broadcasting an alert —
the suppression is unconditional and DB-enforced, exactly mirroring how the original dispatch
trigger itself was made unconditional in spec 009 ("a DB trigger is the only place that can
guarantee dispatch isn't silently skippable" — the same logic now applies to guaranteeing it
*is* skipped for exercise alerts).

## Application behavior: `endDrill()` in `AdminView.vue`

**Before**: `summary = { duration_min, ended_at }`

**After**: `summary = { duration_min, ended_at, alerts_issued }`, where `alerts_issued` is computed
via `SELECT COUNT(*) FROM cap_drafts WHERE is_exercise = true AND country_code = <drill's
country_code> AND created_at >= <drill's started_at>` immediately before the existing `UPDATE
drill_sessions SET status = 'completed', ...` call.

## UI: "EXERCISE ONLY" watermark in `CapView.vue`

Rendered whenever `draft.is_exercise === true`, on every draft card in both the Active and History
tabs, regardless of `draft.status` — a persistent, high-contrast badge/label using the new
`cap.exerciseOnly` i18n key.
