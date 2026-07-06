# Phase 0 Research: Drill Mode — CAP Exercise Isolation

No `[NEEDS CLARIFICATION]` markers remained in the spec. This phase confirms the technical
approach against the existing `cap_drafts`/`drill_sessions` schema and the existing dispatch
trigger (spec 009).

## Decision: `is_exercise` set via a `BEFORE INSERT` trigger, not application code

- **Decision**: Add `set_cap_exercise_flag()` as a `BEFORE INSERT ON cap_drafts` trigger that sets
  `NEW.is_exercise := EXISTS (SELECT 1 FROM drill_sessions WHERE status = 'active' AND
  country_code = NEW.country_code)` whenever the client doesn't already explicitly set it (i.e.
  `NEW.is_exercise` defaults to this computed value).
- **Rationale**: `CapView.vue`'s `submitDraft()` is the only place that inserts into `cap_drafts`
  today, but a DB trigger guarantees the flag is set correctly regardless of which code path
  performs the insert (mirrors the exact reasoning already used for spec 009's dispatch trigger —
  "a DB trigger is the only place that can guarantee X isn't silently skippable"). This also
  means no client-side logic has to duplicate the "is there an active drill for my country"
  check.
- **Alternatives considered**: Computing the flag in `CapView.vue`'s `submitDraft()` before
  insert — rejected: exactly the kind of client-side-only guarantee this project has already
  learned (spec 009) is unreliable, since any other insert path (a future admin bulk-import, a
  script) would silently bypass it.

## Decision: dispatch suppression via one added `AND` clause in the existing trigger's `WHEN`

- **Decision**: Change `notify_dispatch_on_broadcast()`'s trigger definition from
  `WHEN (NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status)` to
  `WHEN (NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status AND NOT NEW.is_exercise)`.
- **Rationale**: This is the single, additive change that satisfies FR-003 exactly — the trigger
  simply never fires for exercise drafts, so `dispatch-alert` is never invoked and no
  `dispatch_jobs`/`dispatch_receipts` rows are ever created for them (satisfying spec.md's
  Assumption that no changes to those tables are needed). Confirmed via code reading
  (`supabase/migrations/20260707120200_cap_broadcast_dispatch_trigger.sql`) that this is the only
  trigger/code path that calls the `dispatch-alert` Edge Function.
- **Alternatives considered**: Checking `is_exercise` inside `dispatch-alert`'s own Edge Function
  code instead — rejected: strictly weaker, since it would still create a `dispatch_jobs` row (and
  invoke a network call) before deciding not to act, and duplicates a check that's cheaper and
  more absolute to make once in the trigger's `WHEN` clause (which prevents the function from
  being invoked at all, not just from acting once invoked).

## Decision: watermark is a plain computed UI element, not a stored display string

- **Decision**: `CapView.vue` renders `t('cap.exerciseOnly')` inline whenever `draft.is_exercise`
  is true, styled distinctly (e.g. a bright, high-contrast badge), on every draft card regardless
  of status.
- **Rationale**: Simplest possible implementation satisfying FR-005 — no new component, no new
  store, just a conditional render keyed off the new column already being fetched by the existing
  `loadDrafts()` (`select('*')`).
- **Alternatives considered**: A separate "exercise alerts" filtered view/tab — rejected as
  unnecessary; the existing drafts list already shows all statuses via the Active/History tabs,
  and FR-005 only requires visibility, not separation.

## Decision: alert count computed at drill-end time via a `COUNT` query, not a running counter

- **Decision**: `endDrill()` in `AdminView.vue` runs
  `SELECT COUNT(*) FROM cap_drafts WHERE is_exercise = true AND country_code = drill.country_code
  AND created_at >= drill.started_at` immediately before building the summary object, and adds
  the result as `alerts_issued`.
- **Rationale**: Simplest correct approach — no incrementing counter to keep in sync, no risk of
  drift; a one-time count at drill-end is sufficient since FR-006 only requires the final summary
  to be accurate, not a live-updating count during the drill.
- **Alternatives considered**: Incrementing a counter on `drill_sessions` every time a matching
  `cap_drafts` row is inserted — rejected as unnecessary complexity (Principle VIII) for a value
  only ever read once, at drill-end.

All decisions above resolve directly from spec.md requirements and the existing, already-merged
`cap_drafts`/`drill_sessions`/dispatch-trigger code — no outstanding unknowns remain for Phase 1.
