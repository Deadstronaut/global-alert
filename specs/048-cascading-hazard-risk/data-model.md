# Data Model: Cascading Hazard Risk

## 1. `cascade_rules` (new)

Admin-configured, country-scoped. Each row is one "if trigger conditions hold, elevate this secondary
risk" rule. All non-NULL condition columns on a row must hold simultaneously (AND-only, research.md §5)
for the rule to fire.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| country_code | VARCHAR(2) NOT NULL | |
| trigger_hazard_type | TEXT NOT NULL | Matches `hazard_event_history_view.hazard_type` values (`earthquake`, `flood`, `drought`, ...), or the literal `'any'` to match every hazard type (US1 acceptance scenario for the vulnerability-only example rule, which is not earthquake-specific) |
| min_magnitude | DOUBLE PRECISION | Nullable. Satisfied when the triggering event's `magnitude` >= this value. NULL = no magnitude condition on this rule |
| proximity_exposure_source_name | TEXT | Nullable. Matches `exposure_datasets.source_name` (e.g. `'hydrorivers'`, `'hydrobasins'`) to check proximity against. Must be paired with `proximity_distance_km` |
| proximity_distance_km | DOUBLE PRECISION | Nullable, CHECK required when `proximity_exposure_source_name` is set (and vice versa) |
| min_vulnerability_score | DOUBLE PRECISION | Nullable. Satisfied when `compute_risk_category_score(country_code, admin_boundary_code, 'vulnerability')` >= this value (research.md §2) |
| secondary_risk_category | TEXT NOT NULL | Admin-defined label, e.g. `"secondary_flood_risk"`, `"building_collapse_risk"`, `"famine_risk"` — free text, not an enum (Principle I) |
| recommendation_template | TEXT NOT NULL | Plain placeholder template, e.g. `"[[area]]: elevated flood risk from a magnitude [[magnitude]] event [[distance_km]]km from the river. Estimated [[affected_population]] people in the area."` — substitution only, no conditional/scripting logic (research.md §5) |
| is_active | BOOLEAN NOT NULL DEFAULT true | Deactivating a rule stops it firing for new evaluations without deleting it (and without touching past assessments, FR-010) |
| created_by | UUID FK → auth.users(id) ON DELETE SET NULL | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

CHECK constraint: at least one of `min_magnitude`, `proximity_exposure_source_name`,
`min_vulnerability_score` MUST be non-NULL — a rule with zero conditions would trivially fire on every
event, which is never a useful or intended configuration.

RLS: identical three-tier pattern to `risk_indicators` (super_admin all; country_admin/org_admin own
country only; no anon read — cascade rules describe the same sensitivity class of information, since a
rule's existence/threshold can itself reveal something about a country's assessed vulnerabilities).

## 2. `cascading_risk_assessments` (new)

One row per rule that actually fired against one real event or hypothetical scenario. Immutable once
created — never updated (FR-010).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| country_code | VARCHAR(2) NOT NULL | |
| cascade_rule_id | UUID FK → cascade_rules(id) ON DELETE SET NULL | Kept for convenient joins when the rule still exists; NOT the source of truth for what the rule said (see next column) — allows the rule to be later edited/deleted without corrupting this historical record |
| rule_config_snapshot | JSONB NOT NULL | The full `cascade_rules` row (all condition columns + template + category) exactly as it was at evaluation time — mirrors `risk_area_scores.indicator_config_snapshot`'s precedent (spec 039) for the same auditability reason (FR-010) |
| source_type | TEXT NOT NULL CHECK IN ('real_event', 'hypothetical_scenario') | |
| source_hazard_type | TEXT NOT NULL | The triggering event's hazard type |
| source_event_ref | JSONB NOT NULL | For `real_event`: `{ "table": "earthquake", "id": "..." }` (hazard tables are per-type, so no single FK target exists — matches this project's existing pattern of per-type tables without a unifying id space). For `hypothetical_scenario`: `{ "hazard_scenario_id": "..." }` (real FK-able, since `hazard_scenarios` is one table) |
| admin_boundary_code | TEXT NOT NULL | The area the assessment applies to |
| input_values | JSONB NOT NULL | Whatever values were actually evaluated against the rule's conditions — e.g. `{ "magnitude": 6.2, "distance_km": 8.1, "vulnerability_score": 7.4 }` — always includes every condition the rule actually checked, for full traceability (FR-003 acceptance scenario 4) |
| affected_population | DOUBLE PRECISION | Nullable. Reuses the same population-overlay aggregation this project already computes elsewhere (spec 008's `compute_zonal_stats`-equivalent pattern) against the area's population exposure dataset; NULL (not 0) if no population dataset is available for the area, consistent with FR-006 |
| recommendation_text | TEXT NOT NULL | `rule_config_snapshot.recommendation_template` with placeholders substituted from `input_values`/`affected_population`/`admin_boundary_code` |
| computed_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

Indexed on `(country_code, admin_boundary_code, computed_at DESC)`, matching `risk_area_scores`'
indexing convention (callers typically want the latest assessments for an area).

RLS: identical three-tier pattern to `risk_area_scores`.

## 3. `evaluate_cascade_rules` (new RPC)

Given `(country_code, hazard_type, admin_boundary_code, event_lat, event_lng, magnitude, source_type,
source_event_ref)`: loads every `is_active` rule for that country where `trigger_hazard_type = hazard_type
OR trigger_hazard_type = 'any'`, and for each rule evaluates its non-NULL condition columns:

- `min_magnitude`: satisfied iff `magnitude IS NOT NULL AND magnitude >= min_magnitude`; if the event
  carries no magnitude at all and the rule requires one, the rule is **not evaluable** (not simply
  "condition unmet") — a hazard type that structurally has no magnitude (e.g. this project's `food_security`
  rows from WFP HungerMap, research.md §6) can never satisfy a magnitude condition, which must be visible
  to the admin as a data-availability gap, not a false "no risk" result.
- `proximity_exposure_source_name` + `proximity_distance_km`: satisfied iff an `exposure_features` row
  exists for that country/`source_name` within `ST_DWithin` of the event point; **not evaluable** if the
  country has no `exposure_datasets` row for that `source_name` at all (layer never imported, FR-006) —
  distinct from "evaluable but nothing within range" (condition legitimately unmet).
- `min_vulnerability_score`: satisfied iff `compute_risk_category_score(..., 'vulnerability')` is
  non-NULL and >= the threshold; **not evaluable** if that call returns NULL (no Vulnerability
  `risk_indicators` configured for the area, research.md §2).

Returns a structured result distinguishing three outcomes per rule (never conflated, per FR-006/FR-007):
1. **Triggered** — every condition satisfied; a `cascading_risk_assessments` row is inserted and returned.
2. **Not evaluable** — at least one condition's required data is unavailable; returned with the specific
   missing prerequisite named (e.g. `"missing exposure layer: hydrorivers"`, `"no vulnerability indicators
   configured"`), no assessment row inserted.
3. **Not triggered** — every condition was evaluable but at least one was not satisfied; no assessment
   row inserted, no missing-data flag either (this is the ordinary "rule didn't fire" case).

If a country has zero active rules for the given `hazard_type`/`'any'`, the result is the explicit
"no rules configured" state, distinct from "rules exist but none triggered" (both ultimately surface as
"no secondary risk" to the end user per FR-007, but are distinguishable in the RPC's raw result for
admin-facing diagnostics).

## 4. `save_cascade_rule` (new RPC)

Given the full set of `cascade_rules` columns: validates the "at least one condition column set" CHECK
(surfaced as a clear error, not a raw constraint-violation message) and the "proximity fields both-or-
neither" pairing, then inserts or updates (matching `save_risk_indicator`'s upsert-by-identity pattern,
keyed here by `id` when editing, plain INSERT when creating new).

## Relationships

```
cascade_rules (new: per-country admin-configured trigger/condition/template)
  ├─ references exposure_datasets.source_name (existing, spec 038/041 — e.g. 'hydrorivers') for proximity
  ├─ references risk_indicators via compute_risk_category_score (existing, spec 039) for vulnerability
  └─ feeds → evaluate_cascade_rules → cascading_risk_assessments (new, one row per firing rule)

hazard_event_history_view (existing, spec 039)  ─┐
hazard_scenarios (existing, spec 039)            ─┴─> source of the "trigger" event/scenario passed
                                                       into evaluate_cascade_rules

exposure_features (existing, spec 008/034 — population dataset)
  └─ feeds → cascading_risk_assessments.affected_population (zonal-overlay reuse)
```
