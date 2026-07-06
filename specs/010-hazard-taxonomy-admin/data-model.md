# Data Model: Hazard Taxonomy Admin

## hazard_types

| Column | Type | Notes |
|---|---|---|
| code | TEXT PRIMARY KEY | e.g. `'earthquake'` — matches the string already stored in every `hazard_type`/`type` column across disaster tables, cap_drafts, contacts, data_sources |
| display_name | TEXT NOT NULL | |
| category | TEXT NOT NULL CHECK (category IN ('meteo','hydro','geo','bio','tech')) | |
| description | TEXT | |
| is_active | BOOLEAN NOT NULL DEFAULT true | deactivation, not delete (FR-003) |
| created_at / updated_at | TIMESTAMPTZ | standard `set_updated_at()` trigger |

**RLS**: `super_admin_hazard_types_all` (FOR ALL, super_admin only). A `read_active_hazard_types` policy (`FOR SELECT USING (is_active OR current_profile_role() = 'super_admin')`, `TO authenticated`) lets every other role read active types for their own selectors (FR-002's "read-only access via existing selectors") without granting write.

**Audit**: `log_table_change()` trigger (FR-012).

**Seed data** (FR-009, research.md §2) — the 9 hazard types already in production use, with category inferred per spec.md Assumptions:

| code | display_name | category |
|---|---|---|
| earthquake | Earthquake | geo |
| wildfire | Wildfire | meteo |
| flood | Flood | hydro |
| drought | Drought | hydro |
| food_security | Food Security | bio |
| tsunami | Tsunami | geo |
| cyclone | Cyclone | meteo |
| volcano | Volcano | geo |
| epidemic | Epidemic | bio |

## hazard_thresholds

| Column | Type | Notes |
|---|---|---|
| hazard_type_code | TEXT PRIMARY KEY REFERENCES hazard_types(code) ON DELETE CASCADE | one threshold config per hazard type (research.md §1) |
| metric_name | TEXT NOT NULL | e.g. `'magnitude'`, `'frp'`, `'level'`, `'phase'` |
| unit | TEXT | e.g. `'Mw'`, `'MW'`, nullable for unitless scales |
| breakpoints | JSONB NOT NULL DEFAULT '[]' | ordered array of `{ "min_value": number, "severity": "minimal"\|"low"\|"moderate"\|"high"\|"critical" }`, ascending by `min_value` (FR-006) |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**Constraint**: application-level validation (FR-006) checks strictly-ascending `min_value` across the array before saving — enforced in the admin form and, defensively, in a `CHECK`-adjacent trigger function `validate_hazard_breakpoints()` that re-validates ordering server-side (the DB is the source of truth for correctness, not just the form).

**RLS**: same tier as `hazard_types` — `super_admin_hazard_thresholds_all` (FOR ALL), `read_active_hazard_thresholds` (`FOR SELECT USING (EXISTS (SELECT 1 FROM hazard_types h WHERE h.code = hazard_thresholds.hazard_type_code AND h.is_active) OR current_profile_role() = 'super_admin')`, `TO authenticated`).

**Audit**: `log_table_change()` trigger.

**Seed data** (research.md §2) — breakpoints reproducing `src/utils/severity.js`'s `SEVERITY_FN` exactly for the 5 hazard types that have one today; empty `[]` for the other 4 (tsunami, cyclone, volcano, epidemic), matching their current fallback-to-'low' behavior:

```json
// earthquake (metric_name: magnitude, unit: Mw)
[
  { "min_value": 0,   "severity": "minimal" },
  { "min_value": 2.5, "severity": "low" },
  { "min_value": 4.0, "severity": "moderate" },
  { "min_value": 5.5, "severity": "high" },
  { "min_value": 7.0, "severity": "critical" }
]
// wildfire (metric_name: frp, unit: MW)
[
  { "min_value": 0,   "severity": "minimal" },
  { "min_value": 10,  "severity": "low" },
  { "min_value": 50,  "severity": "moderate" },
  { "min_value": 200, "severity": "high" },
  { "min_value": 500, "severity": "critical" }
]
// flood (metric_name: level, unit: null)
[
  { "min_value": 0, "severity": "minimal" },
  { "min_value": 1, "severity": "low" },
  { "min_value": 2, "severity": "moderate" },
  { "min_value": 3, "severity": "high" },
  { "min_value": 4, "severity": "critical" }
]
// drought (metric_name: level, unit: null) — no 'minimal' level, matches today's 4-branch function
[
  { "min_value": 0, "severity": "low" },
  { "min_value": 2, "severity": "moderate" },
  { "min_value": 3, "severity": "high" },
  { "min_value": 4, "severity": "critical" }
]
// food_security (metric_name: phase, unit: IPC)
[
  { "min_value": 0, "severity": "minimal" },
  { "min_value": 2, "severity": "low" },
  { "min_value": 3, "severity": "moderate" },
  { "min_value": 4, "severity": "high" },
  { "min_value": 5, "severity": "critical" }
]
```

## Relationships

```
hazard_types (1) ──< hazard_thresholds (1)   [1:1, hazard_thresholds.hazard_type_code is its PK]
hazard_types.code  ── referenced by (string match, not FK) ──>  earthquake/wildfire/flood/.../hazard_type columns,
                                                                  cap_drafts.hazard_type, contacts.hazard_type_filter,
                                                                  data_sources.hazard_type
```
No foreign key is added from the 9+ existing disaster/config tables to `hazard_types.code` in this phase — those columns' `hazard_type` values are free-text today (e.g. `data_sources.hazard_type` has its own `CHECK` constraint, not a FK), and retrofitting a hard FK across that many existing tables is out of scope; the registry is additive validation/metadata, not a hard relational constraint (yet).
