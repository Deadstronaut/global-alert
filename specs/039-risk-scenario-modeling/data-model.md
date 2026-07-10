# Data Model: Risk & Scenario Modeling

## 1. `risk_indicators` (new)

Metadata layer over an existing `exposure_datasets` row, adding what a generic exposure dataset doesn't
carry: risk category, weight, and normalization range. One row per uploaded indicator.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| exposure_dataset_id | UUID FK → exposure_datasets(id) ON DELETE CASCADE | The actual indicator values live here (spec 008's existing generic upload path) |
| category | TEXT CHECK IN ('vulnerability', 'coping_capacity', 'exposure') | **Implementation-time refinement**: `exposure` was added to this same tag-and-weight mechanism rather than inventing a second, differently-shaped "primary exposure dataset" selector — one generic mechanism configures which datasets feed all three non-Hazard factors, consistent with FR-003's genericity requirement |
| weight | DOUBLE PRECISION CHECK (weight > 0 AND weight <= 1) | Relative weight within its category; category's weights must sum to 1.0 (app-layer validation, FR-002) |
| normalize_min | DOUBLE PRECISION | Raw value mapped to 0 on the 0-10 scale |
| normalize_max | DOUBLE PRECISION | Raw value mapped to 10 on the 0-10 scale |
| country_code | VARCHAR(2) NOT NULL | Denormalized from exposure_datasets for RLS simplicity, matching spec 034's pattern |
| created_by | UUID FK → auth.users(id) ON DELETE SET NULL | |
| created_at | TIMESTAMPTZ | |

RLS: identical three-tier pattern as `exposure_datasets` (super_admin all; country_admin/org_admin own
country only). No `anon` read policy — per this project's data-privacy guardrail (spec 001 Assumptions),
Vulnerability/Coping Capacity data is exactly the sensitive category (poverty, food insecurity) that
must never default to public-readable.

## 2. `risk_area_scores` (new)

A computed snapshot, not a live view — so a score remains attributable to the exact indicator
configuration that produced it even after weights later change (Edge Cases: config-change handling).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| country_code | VARCHAR(2) NOT NULL | |
| admin_boundary_code | TEXT NOT NULL | Matches spec 034's `exposure_features.admin_boundary_code` convention |
| hazard_type | TEXT NOT NULL | **Implementation-time refinement**: risk is computed per hazard type, not blended across all types — matches how INFORM/scenario analysis is actually used ("this area's earthquake risk"), and reuses `compute_hazard_area_score`'s existing per-type signature rather than inventing a cross-type blending rule nothing in the spec defines |
| hazard_score | DOUBLE PRECISION | 0-10, NULL if not computable (FR-007) |
| exposure_score | DOUBLE PRECISION | 0-10, NULL if not computable |
| vulnerability_score | DOUBLE PRECISION | 0-10, NULL if no indicators configured |
| coping_capacity_score | DOUBLE PRECISION | 0-10, NULL if no indicators configured |
| composite_score | DOUBLE PRECISION | NULL if any of the four factors is NULL (FR-007 — never silently substitute zero) |
| indicator_config_snapshot | JSONB | The `risk_indicators` rows (id, weight, category) used, for audit/reproducibility |
| computed_at | TIMESTAMPTZ | |

Indexed on `(country_code, admin_boundary_code, computed_at DESC)` — callers read the latest row per
area; history is retained (not overwritten) for audit trail, consistent with Principle V.

RLS: same three-tier pattern, country-scoped, no anon read.

## 3. `hazard_scenarios` (new)

Modeled directly on spec 008's `impact_scenarios` (saved-scenario pattern, FR-011), for hypothetical
(not real) hazard events.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT NOT NULL | |
| hazard_type | TEXT NOT NULL | |
| parameters | JSONB NOT NULL | e.g. `{ "magnitude": 7.0, "epicenter_lat": ..., "epicenter_lng": ... }` — shape is hazard-type-specific |
| footprint_geojson | JSONB | The simulated footprint polygon, or NULL if formula unavailable for this hazard_type (FR-010) |
| estimated_impact | JSONB | `{ exposure_dataset_id, total_value, feature_count }` per overlaid exposure dataset |
| formula_range_warning | BOOLEAN NOT NULL DEFAULT false | Set when parameters fall outside the formula's validated range (Edge Cases) |
| country_code | VARCHAR(2) | |
| org_id | UUID FK → organizations(id) ON DELETE SET NULL | |
| created_by | UUID FK → auth.users(id) ON DELETE SET NULL | |
| created_at | TIMESTAMPTZ | |

RLS: identical to `impact_scenarios` (super_admin all; country_admin/org_admin own scope).

## 4. `hazard_event_history_view` (new view, additive)

```sql
CREATE VIEW hazard_event_history_view AS
  SELECT 'earthquake' AS hazard_type, lat, lng, severity, magnitude, time, country_code FROM earthquake
  UNION ALL
  SELECT 'wildfire', lat, lng, severity, magnitude, time, country_code FROM wildfire
  UNION ALL
  SELECT 'flood', lat, lng, severity, magnitude, time, country_code FROM flood
  UNION ALL
  SELECT 'drought', lat, lng, severity, magnitude, time, country_code FROM drought
  UNION ALL
  SELECT 'tsunami', lat, lng, severity, magnitude, time, country_code FROM tsunami
  UNION ALL
  SELECT 'cyclone', lat, lng, severity, magnitude, time, country_code FROM cyclone
  UNION ALL
  SELECT 'volcano', lat, lng, severity, magnitude, time, country_code FROM volcano
  UNION ALL
  SELECT 'epidemic', lat, lng, severity, magnitude, time, country_code FROM epidemic
  UNION ALL
  SELECT 'disaster', lat, lng, severity, magnitude, time, country_code FROM disaster;
```

No RLS needed directly (a view over already-RLS'd base tables inherits their policies); read access
mirrors whatever the 9 underlying hazard tables already grant.

## 5. `compute_hazard_area_score` (new RPC)

Given `(country_code, admin_boundary_code, hazard_type, lookback_years)`: looks up the area's polygon
from `country_boundaries.geojson` (matching `name_property` to `admin_boundary_code`), counts
`hazard_event_history_view` rows of that type within it via `ST_Within`, and returns a normalized 0-10
score derived from event frequency/severity (exact normalization curve documented at implementation
time — the RPC signature and its "NULL when zero qualifying events" contract are the Phase 1 commitment
here, not the precise scaling constants).

## 6. `compute_risk_exceedance_curve` (new Edge Function, not SQL — see research.md §4/§6)

Given `(country_code, admin_boundary_code, hazard_type, seed?)`: reads matching
`hazard_event_history_view` rows, applies the minimum-record threshold (FR-013), and if met, returns a
bootstrap-resampled exceedance curve plus the historical record count used. Deterministic per seed.

## Relationships

```
exposure_datasets (existing, spec 008)
  └─ exposure_features (existing, spec 008/034: admin_boundary_code)
  └─ risk_indicators (new: category, weight, normalize_min/max)
       └─ feeds → risk_area_scores.vulnerability_score / coping_capacity_score

hazard_event_history_view (new, additive UNION over 9 existing tables)
  └─ feeds → risk_area_scores.hazard_score
  └─ feeds → compute_risk_exceedance_curve

exposure_features (Exposure role, e.g. population from spec 038)
  └─ feeds → risk_area_scores.exposure_score

risk_area_scores.{hazard,exposure,vulnerability,coping_capacity}_score
  └─ combine → risk_area_scores.composite_score

hazard_scenarios (new, standalone: user-defined hypothetical event → footprint → overlay result)
```
