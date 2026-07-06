# Phase 1 Data Model: Drill Mode — CAP Exercise Isolation

## Entity: `cap_drafts` (existing, extended)

| Field | Type | Notes |
|---|---|---|
| *(all existing columns)* | — | unchanged |
| `is_exercise` | BOOLEAN NOT NULL DEFAULT false | **new**. Set once, at insert time, by `set_cap_exercise_flag()` (BEFORE INSERT trigger) based on whether an active `drill_sessions` row exists for `NEW.country_code` at that moment. Never modified afterward (FR-002) — no UPDATE path touches this column. |

**New trigger**: `set_cap_exercise_flag()` — `BEFORE INSERT ON cap_drafts`, computes
`NEW.is_exercise` from `EXISTS (SELECT 1 FROM drill_sessions WHERE status = 'active' AND
country_code = NEW.country_code)`.

**Modified trigger**: `notify_dispatch_on_broadcast()`'s `WHEN` clause gains `AND NOT
NEW.is_exercise` (see research.md) — the function body itself is unchanged.

## Entity: `drill_sessions` (existing, extended — summary shape only)

| Field | Type | Notes |
|---|---|---|
| *(all existing columns)* | — | unchanged, including `summary JSONB` |
| `summary.alerts_issued` | integer (JSONB field) | **new key within the existing `summary` JSONB**, populated by `endDrill()` at drill-end time via a `COUNT(*)` over `cap_drafts` (`is_exercise = true`, matching `country_code`, `created_at >= started_at`). `summary.duration_min` (existing) is unchanged. |

No new table, no schema migration needed for `drill_sessions` itself — `summary` is already an
untyped JSONB column, so adding a new key is a pure application-layer change (in `endDrill()`),
not a DB migration.
