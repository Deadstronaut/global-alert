# Research: Hazard Taxonomy Admin

## 1. Storage shape for threshold breakpoints

**Decision**: One `hazard_thresholds` row per hazard type, with a `JSONB` column holding an ordered array of `{ min_value, severity }` objects, plus separate `metric_name`/`unit` text columns.

**Rationale**: The existing hardcoded functions in `src/utils/severity.js` are simple monotonic step functions (e.g. earthquake: mag>=7.0→critical, >=5.5→high, >=4.0→moderate, >=2.5→low, else minimal). A JSONB array of breakpoints reproduces this exactly and is trivially evaluated client-side (iterate descending, return first match), without needing a separate breakpoints table with its own foreign key/ordering column — one row per hazard type is simpler and this data has no independent identity outside its owning hazard type.

**Alternatives considered**: A normalized `hazard_threshold_breakpoints` table (one row per breakpoint, FK to hazard type, an `order` column) — rejected as unnecessary relational overhead (Principle VIII) for data that's always read/written as a single unit and never queried breakpoint-by-breakpoint.

## 2. Reproducing today's exact behavior during seeding

**Decision**: Seed migration inserts the 5 hazard types that currently have real thresholds (earthquake, wildfire, flood, drought, food_security) with breakpoints matching `SEVERITY_FN` exactly. The other 4 production hazard types (tsunami, cyclone, volcano, epidemic) are seeded with an **empty breakpoints array** — matching their current behavior today, which is to fall through `severity.js`'s existing `?? (() => 'low')` fallback (they were never in `SEVERITY_FN` to begin with).

**Rationale**: FR-007/FR-008/SC-003 require zero behavioral regression. Confirmed by reading `src/utils/severity.js` directly: only 5 of the 9 hazard types have an entry in `SEVERITY_FN`; the other 4 already silently fall back to `'low'`. Seeding them with an empty breakpoint array reproduces this exactly via the same fallback path (FR-008), rather than inventing thresholds for hazards that never had explicit ones.

**Alternatives considered**: Inventing reasonable-looking thresholds for tsunami/cyclone/volcano/epidemic during seeding — rejected; that would be a silent behavior change (those events currently always classify as 'low', a change here is a product decision for a super_admin to make later via Story 2, not something to bake into a migration).

Note also: `drought`'s current function has only 4 branches (critical/high/moderate/low — no 'minimal' case, defaulting to 'low' below the moderate threshold). The breakpoints array format must support a hazard type using fewer than all 5 severity levels; the evaluation function must not assume all 5 are always present.

## 3. Where `computeSeverity()` gets its data from (sync hardcoded function vs. async DB read)

**Decision**: `computeSeverity(hazardType, magnitude)` remains a synchronous function, but the caller (`buildEventRow()` and any UI computing severity) must now pass in an already-loaded thresholds map rather than the function doing its own DB read. A new `useHazardTypesStore` (Pinia) loads `hazard_types` + `hazard_thresholds` once (cached, like `sources.js`) and exposes a synchronous `computeSeverity(hazardType, value)` method built from that cached data, falling back to the original hardcoded `SEVERITY_FN` values (kept in the store as its bundled fallback, satisfying FR-011/SC-005) if the registry hasn't loaded yet or is unreachable.

**Rationale**: `buildEventRow()` is called synchronously in several existing code paths (`ManualEntryForm.vue`, `FileImportForm.vue`) where threading an `await` through would be a larger, riskier refactor than necessary. Loading the registry once into a store (already an established pattern — `sources.js`, `contacts.js`) and computing severity synchronously against that cached snapshot keeps every existing call site's calling convention unchanged.

**Alternatives considered**: Making `computeSeverity()` itself async (`await supabase.from('hazard_thresholds')...` on every call) — rejected: forces `async`/`await` into every existing synchronous call site for no benefit, and re-queries the DB on every single event processed instead of once per session.

## 4. Migrating the 6 hardcoded `HAZARD_TYPES` call sites

**Decision**: Each of the 6 files replaces its local `const HAZARD_TYPES = [...]` with `useHazardTypesStore().activeHazardTypes` (a computed array of active hazard type codes), loaded once at app/store-init time (mirroring `sources.js`'s `fetchSources()` pattern) and cached — not re-fetched per component mount.

**Rationale**: Directly satisfies FR-010. Using one shared store (rather than each of the 6 components independently querying Supabase) avoids 6x redundant network calls and guarantees they all see the same list at the same time.

**Alternatives considered**: A shared plain JS module-level cache (like `src/configs/countries.json`'s static import) — rejected because this data is admin-editable at runtime (unlike the static countries list), so it needs the reactive fetch/cache/invalidate lifecycle a Pinia store already provides, not a static import.

## 5. Testing approach

**Decision**: Vitest unit tests for the pure `computeSeverity()`-equivalent evaluation function (given a breakpoints array and a value, return the correct severity), covering: descending-match logic, an empty-breakpoints fallback to `'low'`, and a hazard type using fewer than 5 levels (the `drought`-shape case). Table-driven, mirroring the existing `src/utils/*.test.js` convention in this repo (frontend logic → Vitest, not Deno).

**Rationale**: Per constitution Development Workflow & Quality Gates, severity mapping is one of the four explicitly non-negotiable test-first zones.
