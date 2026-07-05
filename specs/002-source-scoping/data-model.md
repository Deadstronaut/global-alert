# Phase 1 Data Model: Data Source Country Scoping

## Entity: `data_sources` (extended)

Adds one column to the existing table from 001-data-ingestion-monitoring. All other columns
(`id`, `name`, `hazard_type`, `endpoint_url`, `endpoint_config`, `poll_interval_seconds`,
`staleness_threshold_seconds`, `down_after_consecutive_failures`, `is_active`, `health_state`,
`consecutive_failures`, `last_success_at`, `last_attempt_at`, `created_at`, `updated_at`) are
unchanged — see `specs/001-data-ingestion-monitoring/data-model.md` for their definitions.

| Field | Type | Notes |
|---|---|---|
| `country_code` | TEXT, NULL | **NEW.** `NULL` = global scope (visible/manageable by every admin). A concrete value (e.g. `'TR'`) = country-scoped (visible to that country's admins + super_admin only, manageable only by that country's `country_admin` + super_admin). Same value domain/convention as `profiles.country_code` — no new taxonomy introduced (spec Assumptions). |

**Validation rules** (from spec FR-001, FR-008, FR-009):
- No `CHECK` constraint restricting `country_code` to a fixed enum — country codes are an open,
  admin-managed set already (per `profiles.country_code`'s existing convention, which has no such
  constraint either).
- `country_code` may be changed by `super_admin` to any value or `NULL` at any time (FR-009).
- `country_admin` may only set `country_code` equal to their own `profiles.country_code` on
  INSERT/UPDATE — enforced via RLS `WITH CHECK`/`USING`, not application code alone (FR-008,
  research.md §3).

**No new state machine.** `country_code` is an orthogonal attribute to `health_state` — a source's
health-state transitions (from 001) are entirely unaffected by its scope.

## Read visibility (derived, not stored)

For a given authenticated profile with `role` and `country_code`:

```
visible_sources =
  IF role = 'super_admin'  THEN all data_sources rows
  ELSE                          data_sources rows WHERE country_code IS NULL
                                                      OR country_code = profile.country_code
```

Enforced at the database layer via RLS (see contracts/rls-policies.md), not computed in the
frontend — `sourcesStore.fetchSources()`'s existing unfiltered `select('*')` (from 001) continues
to work unmodified because Postgres already returns only the rows the policy permits.

## Frontend-only derived grouping (not persisted)

`groupSourcesByScope(sources, viewerCountryCode)`:

```
global := sources where country_code IS NULL
local  := sources where country_code == viewerCountryCode
result := { global, local }
```

For a `super_admin` viewing multiple countries' sources at once, `local` additionally carries each
row's own `country_code` (already present on the row) so the UI can label each local source by its
country — no new field required, this is a rendering concern only (spec US2 acceptance scenario 3).

## Relationships

```
data_sources.country_code  (loosely references, no FK)  profiles.country_code
```

No formal foreign key is added — `profiles.country_code` is a free-text scoping value, not a
`countries` table with referential integrity (consistent with how `profiles.country_code` itself
has no FK today). Adding a `countries` reference table is out of scope for this feature (would be
a separate, larger change to introduce country-taxonomy referential integrity across the whole
schema, not just `data_sources`).

No changes to `source_state_transitions` or `rejected_payloads` (001) — both remain scoped only by
their existing `source_id` FK; audit visibility rules from 001 (super_admin-only read) are
untouched by this feature.
