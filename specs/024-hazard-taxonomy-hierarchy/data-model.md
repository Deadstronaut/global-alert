# Data Model: Hazard Taxonomy Hierarchy & Encyclopedia

## Entity: `hazard_types` (existing table, extended)

| Column | Type | Notes |
|---|---|---|
| `code` | TEXT PRIMARY KEY | existing |
| `display_name` | TEXT NOT NULL | existing |
| `category` | TEXT NOT NULL CHECK | existing |
| `description` | TEXT | existing |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | existing |
| `parent_code` | TEXT REFERENCES hazard_types(code) ON DELETE SET NULL | **NEW**, nullable |
| `created_at`/`updated_at` | TIMESTAMPTZ | existing |

**Constraints**:
- `parent_code` MUST NOT equal `code` (self-reference rejected).
- The parent chain starting from `parent_code` MUST NOT contain `code` at any depth (cycle
  rejected).
- No new uniqueness/NOT NULL constraint — `parent_code` is optional; absence means "top-level"
  hazard type (this is the default and remains valid for every existing row after migration).
- If a parent row is later deleted (not currently possible — no hard-delete UI exists for hazard
  types, only deactivation) `ON DELETE SET NULL` prevents an orphaned reference; deactivation
  (`is_active = false`) does NOT clear `parent_code` on either the parent or its children (FR
  edge case: relationship is informational, unaffected by activation state).

**Relationships**:
- One `hazard_types` row MAY have one parent (`parent_code`).
- One `hazard_types` row MAY be the parent of zero or more other rows (derived, not stored — via
  `getChildren()`).

## Entity: `hazard_thresholds` (existing table, unchanged)

No schema change. Surfaced read-only on the new encyclopedia page via the existing
`hazardTypesStore.thresholds[code]` cache (`metric_name`, `unit`, `breakpoints` JSONB array of
`{min_value, severity}`).

## New trigger function: `prevent_hazard_type_cycle()`

- Fires `BEFORE INSERT OR UPDATE OF parent_code ON hazard_types`.
- Given `NEW.parent_code IS NULL`: passes immediately (no chain to walk).
- Given `NEW.parent_code = NEW.code`: raises `invalid_hazard_parent: a hazard type cannot be its
  own parent`.
- Otherwise walks the parent chain via a recursive CTE starting at `NEW.parent_code`, following
  each row's `parent_code` upward; if `NEW.code` appears in that walk, raises
  `invalid_hazard_parent: assigning % as parent of % would create a cycle`. A depth cap (10) guards
  against any unexpected non-terminating walk (defense-in-depth; the tree is expected to be 2-3
  levels deep at most).

## New pure functions: `src/stores/hazardTypes.js`

- `getChildren(hazardTypes, code)` → `hazardTypes.filter(h => h.parent_code === code)`.
- `wouldCreateCycle(hazardTypes, code, candidateParentCode)` → boolean; mirrors the DB trigger's
  walk client-side (same depth cap) so the admin form can show an inline error before submitting.

## UI-facing shape (encyclopedia card, derived not stored)

```text
{
  code, display_name, category, description,
  parent: { code, display_name } | null,
  children: [{ code, display_name }],
  thresholds: { metric_name, unit, breakpoints: [{min_value, severity}] } | null
}
```
