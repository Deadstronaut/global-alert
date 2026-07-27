# Data Model: Cascade Map Integration & Opt-In Auto-Evaluation

## 1. `country_cascade_settings` (new)

One row per country that has ever had this setting touched (rows are created on first save, not
pre-seeded — a country with no row is treated as disabled, matching the spec's "defaults OFF" requirement
without needing to pre-populate every country).

| Column | Type | Notes |
|---|---|---|
| country_code | VARCHAR(2) PRIMARY KEY | |
| auto_evaluate_enabled | BOOLEAN NOT NULL DEFAULT false | |
| updated_by | UUID FK → auth.users(id) ON DELETE SET NULL | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

RLS (deliberate 2-tier exception to this project's usual 3-tier pattern, per spec FR-004): super_admin
all; country_admin own-country only. **No org_admin, no viewer, no anon** — this is the one place in the
whole cascade feature set where org_admin does not get the same access as country_admin, because the
spec requires the setting to be invisible to org_admin/viewer, not merely read-only.

## 2. `cascading_risk_assessments` (existing, spec 048 — additive columns only)

| New Column | Type | Notes |
|---|---|---|
| triggered_automatically | BOOLEAN NOT NULL DEFAULT false | `true` only for rows inserted by `auto_evaluate_cascade()`; manual/on-demand evaluations (map or admin dashboard) leave this `false`, matching existing behavior exactly |
| acknowledged_at | TIMESTAMPTZ | Nullable. Set once by `acknowledge_cascade_assessment`; never cleared. Does not affect `rule_config_snapshot`/`recommendation_text`/any other existing field (spec 048 FR-010 immutability still holds — acknowledgement is metadata about *viewing* it, not a change to what it says) |

No RLS change — existing three-tier policy already covers read/update scoping for these two new columns.

## 3. `_evaluate_cascade_rules_core` (new, internal — refactor of spec 048's `evaluate_cascade_rules` body)

Identical signature and logic to spec 048's `evaluate_cascade_rules`, plus one new parameter:
`p_triggered_automatically BOOLEAN DEFAULT false`, stamped onto each inserted
`cascading_risk_assessments` row's new column. `SECURITY DEFINER`, same as before. **No authorization
check** — callers are responsible for their own authorization (the public wrapper checks for interactive
callers; the trigger's authorization is structural, see §4).

## 4. `evaluate_cascade_rules` (existing, spec 048 — refactored to a thin wrapper)

Same public signature, same behavior for every existing caller (map/admin dashboard/scenario builder):
performs the existing interactive-user authorization check (super_admin, or country_admin/org_admin for
their own country), then calls `_evaluate_cascade_rules_core(..., p_triggered_automatically := false)`.

## 5. `auto_evaluate_cascade()` (new trigger function) + 9 triggers

`AFTER INSERT` trigger function attached to each of the 9 hazard tables (`earthquake`, `wildfire`,
`flood`, `drought`, `tsunami`, `cyclone`, `volcano`, `epidemic`, `disaster`). For each new row:

1. Look up `country_cascade_settings` for `NEW.country_code`; if no row or `auto_evaluate_enabled = false`,
   return immediately (near-zero cost for the default/disabled case).
2. If enabled, resolve `admin_boundary_code` from `NEW.lat`/`NEW.lng` using the same
   `country_boundaries.geojson` polygon-match technique spec 039's `compute_hazard_area_score` already
   uses (`ST_Within` against the country's boundary features) — reused, not reinvented.
3. If a boundary resolves, call `_evaluate_cascade_rules_core(NEW.country_code, <table's hazard type>,
   <resolved boundary>, NEW.lat, NEW.lng, NEW.magnitude, 'real_event', jsonb_build_object('table',
   TG_TABLE_NAME, 'id', NEW.id), p_triggered_automatically := true)`.
4. The entire body after the country-code lookup is wrapped in `EXCEPTION WHEN OTHERS THEN` (mirrors spec
   029's `audit_log` dead-letter resilience pattern) — any failure here is swallowed (not re-raised) so it
   can never block or roll back the hazard-event insert that fired it. No dead-letter table is added for
   this (unlike spec 029's audit case) since a missed automatic evaluation is recoverable at any time via
   the existing manual "Evaluate Cascades" action — it is a convenience path, not a compliance-critical
   log.

## 6. `save_country_cascade_setting(country_code, enabled)` (new RPC)

Upserts `country_cascade_settings`. RLS on the table itself is the enforcement boundary (no separate
authorization check needed inside the function beyond what RLS already provides, matching
`save_risk_indicator`'s pattern of relying on table RLS rather than duplicating the check in the RPC).

## 7. `acknowledge_cascade_assessment(assessment_id)` (new RPC)

Sets `acknowledged_at = NOW()` on one `cascading_risk_assessments` row if not already set (idempotent — a
second call on an already-acknowledged row is a no-op, not an error). Existing table RLS scopes which
rows a caller may update.

## Relationships

```
country_cascade_settings (new: per-country opt-in, country_admin/super_admin only)
  └─ read by → auto_evaluate_cascade() trigger (gates whether it does any work at all)

earthquake/wildfire/flood/.../disaster (existing, 9 tables)
  └─ AFTER INSERT → auto_evaluate_cascade() → _evaluate_cascade_rules_core() (new internal function)
                                                 └─ inserts → cascading_risk_assessments
                                                              (triggered_automatically = true)

evaluate_cascade_rules (existing public RPC, spec 048)
  └─ (refactored) authorization check → _evaluate_cascade_rules_core(triggered_automatically := false)

cascading_risk_assessments.acknowledged_at (new column)
  └─ set by → acknowledge_cascade_assessment (new RPC)
  └─ counted by → the map/admin UI's unacknowledged-count indicator
                  (SELECT COUNT(*) WHERE triggered_automatically AND acknowledged_at IS NULL)
```
