# Data Model: Regional Hazard Threshold Overrides

## Entity: `hazard_threshold_overrides` (NEW table)

Represents one country-specific replacement of a hazard type's global severity classification.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `hazard_type_code` | `TEXT` | `NOT NULL REFERENCES hazard_types(code) ON DELETE CASCADE`, part of composite PK | Which hazard type is overridden |
| `country_code` | `VARCHAR(2)` | `NOT NULL`, part of composite PK | Which country the override applies to |
| `metric_name` | `TEXT` | nullable | Same shape as `hazard_thresholds.metric_name`, e.g. `"magnitude"` |
| `unit` | `TEXT` | nullable | Same shape as `hazard_thresholds.unit` |
| `breakpoints` | `JSONB` | `NOT NULL DEFAULT '[]'` | Same shape as `hazard_thresholds.breakpoints` (ordered `{min_value, severity}` array) |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | |

**Primary key**: `(hazard_type_code, country_code)` — at most one override per hazard
type/country combination (FR-001), matching `hazard_thresholds`'s own single-row-per-hazard-type
shape.

**Relationships**: Many-to-one with `hazard_types` via `hazard_type_code` (cascades on delete,
matching `hazard_thresholds`'s existing FK behavior).

**Validation rules** (from spec Functional Requirements):
- A row's `breakpoints` MUST be ascending by `min_value` — reuses the exact same
  `validate_hazard_breakpoints()` trigger function `hazard_thresholds` already has (spec 010),
  attached to this table too, rather than duplicating the validation logic.
- No override existing for a hazard-type/country pair means the global classification applies
  unchanged (FR-002) — this is the *absence* of a row, not a null/empty-breakpoints row (an
  admin who wants "no override" simply doesn't create a row, or deletes an existing one — FR-009).

## RLS Policy Additions

| Policy | Effect |
|---|---|
| `super_admin_hazard_overrides_all` | `current_profile_role() = 'super_admin'` may INSERT/UPDATE/DELETE/SELECT any row (FR-007) |
| `country_scoped_hazard_overrides_manage` | `current_profile_has_capability('hazard_taxonomy') AND country_code = current_profile_country_code()` may INSERT/UPDATE/DELETE/SELECT — purely capability-gated (a Country/Org Admin without the capability grant has no access, matching spec 018's tab-visibility gate); `WITH CHECK` mirrors `USING` so a write cannot target a different country even via a crafted request (FR-006/FR-008) |
| `read_hazard_overrides` | `TO authenticated USING (true)` — any signed-in user may read overrides, matching `hazard_thresholds`'s own "read is open, write is gated" shape, since severity resolution happens client-side and every authenticated user needs to be able to compute severity for events in any country they can see |

## New pure function: `resolveThresholds()`

```
resolveThresholds(
  hazardType: string,
  countryCode: string | null | undefined,
  globalThresholds: Breakpoint[] | undefined,
  overrides: Record<string, Record<string, Breakpoint[]>>  // { [countryCode]: { [hazardType]: breakpoints } }
): Breakpoint[] | undefined
```

Returns, in order: the override for `(countryCode, hazardType)` if `countryCode` is provided and
one exists; otherwise `globalThresholds` unchanged (FR-002/FR-003/FR-004/FR-005). No `countryCode`
provided (existing two-argument `computeSeverity()` call sites) → behaves exactly as before, since
`resolveThresholds()` is only invoked when a `countryCode` argument is present at all.

## `computeSeverity()` signature change

```
// Before (spec 010):
computeSeverity(hazardType: string, value: number): Severity

// After (spec 020, backward compatible):
computeSeverity(hazardType: string, value: number, countryCode?: string | null): Severity
```

`countryCode` is optional and appended, not inserted — every existing call site continues to
compile and behave identically without modification (only `severity.js`'s `buildEventRow()` is
updated to pass it, per spec.md's User Story 1/2 acceptance scenarios).
