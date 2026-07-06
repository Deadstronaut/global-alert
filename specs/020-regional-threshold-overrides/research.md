# Research: Regional Hazard Threshold Overrides

## Decision 1: Additive override table, not a modification of `hazard_thresholds`

**Decision**: A new `hazard_threshold_overrides` table, keyed `(hazard_type_code, country_code)`,
entirely separate from `hazard_thresholds`. The global table is untouched.

**Rationale**: `hazard_thresholds` is deliberately a single global row per hazard type (spec 010's
own design note: "this data is genuinely global, not tenant-scoped"). Adding a `country_code`
column to it directly (making it nullable/multi-row) would require a broader migration of
existing consumers and RLS policies, and would blur the "this is the global default" semantics.
A separate table keeps the global table's meaning exactly as-is and lets the override concept be
purely additive — zero risk to the already-working global path (FR-002, SC-001).

**Alternatives considered**: Adding `country_code` to `hazard_thresholds` with `NULL` meaning
"global": rejected — would change `hazard_thresholds`'s primary key shape (currently
`hazard_type_code` alone) and require every existing reader of that table to add a
country-filtering clause, increasing the blast radius for no added benefit over a separate table.

## Decision 2: Reuse `current_profile_country_code()` and `current_profile_has_capability()` for RLS, not a new access model

**Decision**: RLS on `hazard_threshold_overrides`: `super_admin_hazard_overrides_all`
(`current_profile_role() = 'super_admin'`, any country) plus
`country_scoped_hazard_overrides_manage` (`current_profile_has_capability('hazard_taxonomy') AND
country_code = current_profile_country_code()`), with `WITH CHECK` mirroring the `USING` clause so
a write cannot target a different country even via a crafted request (FR-008). Access is purely
capability-gated, not role-gated: a Country Admin without the `hazard_taxonomy` capability grant
(spec 018) has no access here, matching the existing gate on the rest of the Hazard Taxonomy admin
area (the tab itself is only visible to Super Admin or capability holders — see spec 018's
`AdminView.vue` `hasCapability()` check). An earlier draft of this policy included a
`current_profile_role() = 'country_admin'` OR-branch granting every Country Admin automatic
access regardless of capability grant; this was corrected during analysis because it contradicted
both spec 018's tab-visibility gate and spec 010's own global-registry RLS (which is also
capability/super-admin-gated, not base-role-gated).

**Rationale**: Both helper functions already exist and are already the established choke points
for "is this admin allowed to touch this country's data" (`current_profile_country_code()`, spec
004/010) and "does this admin have the Hazard Taxonomy capability without being a full Super
Admin" (`current_profile_has_capability()`, spec 018) — reusing them means zero new access-control
concepts to reason about, and this feature automatically benefits from both functions' existing
suspension short-circuit (`current_profile_role()` returns `NULL` for suspended users, which
already fails both conditions).

**Alternatives considered**: A bespoke `can_manage_hazard_override(country_code)` function:
rejected as an unnecessary indirection — the two-helper `AND` condition is already simple and
readable inline, and introducing a third helper function purely to wrap an `AND` of two existing
ones would add a layer with no behavioral benefit (YAGNI).

## Decision 3: `resolveThresholds()` as a new, tiny pure function — not folded into `computeSeverity()` directly

**Decision**: Extract `resolveThresholds(hazardType, countryCode, globalThresholds, overrides)` as
its own pure function in `hazardTypes.js`, returning the breakpoints array to use (override's, if
present for that exact hazard-type/country pair; otherwise the global one, unchanged). This is
tested in isolation; `computeSeverity()` becomes a thin wrapper that calls
`resolveThresholds()` then `evaluateBreakpoints()`, exactly as it already calls
`evaluateBreakpoints()` today.

**Rationale**: Matches the project's established pattern of extracting exactly the part of the
logic that has non-obvious edge cases (spec 016's `applyFetchResult`, spec 017's
`computeResponseTimeSeconds`, spec 019's `summarizeAuditRows`) into a pure, directly-testable
function, while leaving the DB-touching/store-state parts as thin orchestration. The "which
breakpoints array applies" decision is exactly this kind of logic — worth testing in isolation
without needing to mock the whole store or Supabase.

**Alternatives considered**: Inlining the override-lookup as a couple of lines directly inside
`computeSeverity()`: considered and rejected only because it would then require mocking the whole
Pinia store (or exercising it through a component) to test the lookup/fallback edge cases, whereas
extracting it keeps the same test-without-mocking property `evaluateBreakpoints()` already has.

## Decision 4: Backend ingestion runtimes are explicitly out of scope for this iteration

**Decision**: `supabase/functions/shared/normalize.ts` and `server/src/processors/normalizer.js`
are not touched by this spec.

**Rationale**: This mirrors the exact, already-successful precedent this project set for the
global registry itself: spec 010 wired the frontend (`hazardTypes.js`/`severity.js`) to a
DB-driven registry; spec 016, a separate and later spec, wired the two backend ingestion runtimes
to that same registry. Following the identical sequencing for the country-override layer keeps
each iteration small, reviewable, and independently valuable (Country Admins get working overrides
for manually-entered/imported events immediately, without waiting for the larger backend-runtime
work), consistent with Constitution Principle VIII (Simplicity/YAGNI: smallest change that
satisfies the acceptance criteria).

**Alternatives considered**: Doing both frontend and backend wiring in one spec: rejected as
unnecessarily large for one iteration, given the already-proven, low-risk value of splitting this
exact kind of "registry-consumer" work the way spec 010→016 already did — no new information
suggests combining them would reduce total risk or effort here.
