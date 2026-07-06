# Implementation Plan: Drill Mode — CAP Exercise Isolation

**Branch**: `013-drill-mode-cap` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-drill-mode-cap/spec.md`

## Summary

`drill_sessions` and its admin CRUD (start/end a drill) already exist
(`supabase/migrations/20260605120200_drill_mode.sql`, `AdminView.vue`'s Tatbikat tab) — but nothing
connects a drill to the CAP alerts authored during it, and nothing prevents those alerts from
triggering real dispatch on broadcast. This plan adds: a `cap_drafts.is_exercise` column,
auto-set at insert time via a trigger that checks for an active `drill_sessions` row matching the
new draft's `country_code`; a one-line addition to the existing `notify_dispatch_on_broadcast()`
trigger's `WHEN` clause to unconditionally skip dispatch for exercise drafts; a UI watermark in
`CapView.vue`; and an alert-count field added to `endDrill()`'s existing summary object in
`AdminView.vue`.

## Technical Context

**Language/Version**: SQL (PostgreSQL/Supabase), JavaScript (Vue 3 Composition API)

**Primary Dependencies**: existing `cap_drafts`/`drill_sessions` tables, existing
`notify_dispatch_on_broadcast()` pg_net trigger (spec 009), Vue 3, vue-i18n

**Storage**: PostgreSQL via Supabase — one new column (`cap_drafts.is_exercise`), one new trigger
function, one modified existing trigger's `WHEN` clause. No new tables.

**Testing**: No pure-JS unit test is applicable here — the determination is a single DB query
inside a trigger, verified via `quickstart.md` live-instance scenarios, consistent with how this
project tests DB-trigger logic that has no accompanying Edge Function (unlike specs 009/011's
dispatch/incident state machines, which mirror DB logic in a testable pure JS function because an
Edge Function or UI also needs to pre-validate the same rule client-side; this spec's rule is
evaluated once, server-side, at insert time, with nothing for the client to pre-validate).

**Target Platform**: Web (existing Vue SPA), `CapView.vue` and `AdminView.vue`'s existing Tatbikat
tab.

**Performance Goals**: N/A — one extra `EXISTS` subquery on `cap_drafts` insert, negligible cost.

**Constraints**: Must not regress existing non-exercise dispatch behavior (FR-004) — the change to
`notify_dispatch_on_broadcast()`'s trigger is additive (one extra `AND` condition in the `WHEN`
clause), not a rewrite.

**Scale/Scope**: 4 user stories, 1 new column, 1 new trigger function + 1 modified trigger,
additive UI changes to 2 existing views (`CapView.vue`, `AdminView.vue`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic, Model-Driven Design)**: N/A — exercise flagging is
  hazard-type-independent (applies uniformly to any `cap_drafts` row regardless of `hazard_type`).
- **Principle II (Scope Discipline)**: PASS — no new dissemination channel, no CAP-hub ingestion,
  no identity federation touched. This spec narrows an existing channel's behavior (suppressing
  it for exercise alerts), which is squarely within the existing Dissemination/CAP boundaries.
- **Principle III (CAP v1.2 Compliance)**: PASS — `is_exercise` is an internal flag, not part of
  the CAP XML schema itself; this spec does not touch CAP export/validation logic (out of scope,
  no export function exists yet per spec 006's remaining gap, unrelated to this spec).
- **Principle IV (Data Quality & Normalization)**: N/A — no ingestion pipeline touched.
- **Principle V (Access Control & Auditability)**: PASS — the existing `log_table_change()` audit
  trigger on `cap_drafts` already covers the new `is_exercise` column automatically (it audits the
  whole row), no new audit wiring needed. Blocking dispatch for exercise alerts is itself a
  security-relevant behavior change, directly satisfying a named PRD safety requirement.
- **Principle VI (Accessibility & i18n)**: PASS — the new "EXERCISE ONLY" watermark text is added
  via vue-i18n keys across all 7 locales, following the established pattern.
- **Principle VII (Performance & Resilience)**: PASS — no new polling, one lightweight `EXISTS`
  check at insert time.
- **Principle VIII (Simplicity & YAGNI)**: PASS — no new table, no new Edge Function, no new
  service. The single existing dispatch trigger is the one and only dispatch-initiating code path
  (confirmed in spec.md's Assumptions), so blocking it there is the minimal sufficient change —
  deliberately not touching `dispatch_jobs`/`dispatch_receipts` at all.

**Initial gate result**: PASS. No Complexity Tracking entries required.

**Post-Phase-1 re-check**: PASS, unchanged. `data-model.md` and `contracts/drill-exercise.md`
confirm the additive-only nature of both trigger changes.

## Project Structure

### Documentation (this feature)

```text
specs/013-drill-mode-cap/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20260707160000_drill_cap_exercise_isolation.sql   # NEW: cap_drafts.is_exercise column +
                                                        # set_cap_exercise_flag() BEFORE INSERT
                                                        # trigger + WHEN-clause update on the
                                                        # existing notify_dispatch_on_broadcast
                                                        # trigger

src/views/
├── CapView.vue           # MODIFIED: "EXERCISE ONLY" watermark on is_exercise drafts
└── AdminView.vue          # MODIFIED: endDrill() summary gains alerts_issued count
```

**Structure Decision**: Minimal-footprint extension of two existing tables/views — no new
directories, no new store, no new admin panel (unlike specs 010-012, this spec has nothing new to
register/manage; it purely constrains existing behavior).

## Complexity Tracking

*No violations — table intentionally omitted.*
