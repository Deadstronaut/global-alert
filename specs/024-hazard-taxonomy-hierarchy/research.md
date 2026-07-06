# Research: Hazard Taxonomy Hierarchy & Encyclopedia

## Decision 1: Cycle detection mechanism

**Decision**: Enforce single-parent-tree integrity with a `BEFORE INSERT OR UPDATE` trigger on
`hazard_types` that walks the parent chain starting from `NEW.parent_code` using a recursive CTE,
and raises an exception if `NEW.code` is encountered anywhere in that chain (covers both direct
self-reference and any transitive cycle) or if the chain exceeds a small fixed depth (defense
against a pathological chain length, since this taxonomy is expected to be shallow — 2-3 levels
at most).

**Rationale**: DB-level enforcement (not just client-side) is required because this table already
has a defense-in-depth precedent (`validate_hazard_breakpoints()` trigger on `hazard_thresholds`,
spec 010) — the constitution and this project's established pattern both favor rejecting invalid
data at the source of truth, not only in the UI.

**Alternatives considered**:
- *Client-side-only check*: Rejected — bypassable via direct API/RPC calls, and inconsistent with
  the existing `validate_hazard_breakpoints()` precedent on the sibling table.
- *Application-level (Edge Function) check*: Rejected — no Edge Function exists in this write path
  today (writes go directly through Supabase's PostgREST via RLS); adding one purely for this
  validation would be a heavier, less consistent solution than a trigger.
- *Materialized closure table*: Rejected — massive overkill for ~9-20 rows with a shallow tree;
  YAGNI.

## Decision 2: Parent/children derivation on the client

**Decision**: Add two pure functions to `src/stores/hazardTypes.js`: `getChildren(hazardTypes,
code)` (filters the flat array for rows whose `parent_code === code`) and `wouldCreateCycle(
hazardTypes, code, candidateParentCode)` (walks the candidate parent's chain client-side, mirroring
the DB trigger's logic, so the UI can show an inline validation error before even attempting a
save — the DB trigger remains the authoritative enforcement).

**Rationale**: Matches this project's established "pure function extraction" convention
(`resolveThresholds`, `occupancyPercentage`, `formatIntegrationStatus`, `detectParserType`) —
directly unit-testable without mocks, and reusable by both the admin form (validation) and the
encyclopedia page (rendering children).

**Alternatives considered**:
- *Re-fetch parent chain from the server on every keystroke*: Rejected — unnecessary round trips;
  the full hazard type list is already cached client-side.

## Decision 3: Route placement for the encyclopedia page

**Decision**: New `/hazards` route with no `meta.roles` restriction, exactly mirroring spec 021's
`/shelters` route (added for the same reason: `/admin`'s route guard blocks Viewer accounts, and
this feature must remain Viewer-reachable per FR-008).

**Rationale**: Established, tested precedent — `tests/unit/router.test.js`'s viewer-blocking
assertion for `/admin` must not be touched or contradicted; a sibling top-level route is the
proven safe pattern.

**Alternatives considered**:
- *Widen `/admin`'s `meta.roles` to include `viewer`*: Rejected — same reasoning as spec 021,
  would break the passing spec-004 test and expose unrelated admin tabs to Viewers.

## Decision 4: Reuse existing cached data vs. new fetch

**Decision**: `HazardEncyclopediaPanel.vue` reads directly from the existing
`useHazardTypesStore()` (`hazardTypes`, `thresholds`, `activeHazardTypes`) — no new fetch action is
added. `App.vue`'s existing `onMounted` boot-time `fetchHazardTypes()` call already guarantees the
data is loaded app-wide by the time any route renders.

**Rationale**: Avoids a redundant network round trip and matches SC-004 (no additional load time
beyond the app's existing initial load).

**Alternatives considered**:
- *Dedicated fetch scoped to the encyclopedia route*: Rejected — unnecessary given the existing
  app-wide boot-time cache.
