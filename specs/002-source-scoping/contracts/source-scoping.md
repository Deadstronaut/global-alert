# Contract: Data Source Scoping (RLS + frontend helper)

This feature has no new HTTP/Edge Function endpoints — it extends the existing direct-Supabase-client
contract from `specs/001-data-ingestion-monitoring/contracts/manage-data-sources.md`. Two contracts
change/are added:

## 1. `data_sources` read/write contract (extended)

Same transport as 001 (`src/stores/sources.js` → `supabase.from('data_sources')...`), no method
signature changes. Behavior changes only:

- `fetchSources()` — **no code change**. Continues to `select('*')` with no manual filter; the
  Postgres RLS policy (see §2 below) now transparently returns only rows the caller may see. A
  `super_admin` continues to see every row; any other authenticated role sees global rows
  (`country_code IS NULL`) plus their own country's rows.
- `createSource(payload)` / `updateSource(id, payload)` — payload may now include `country_code`.
  - `super_admin`: may set `country_code` to `null` or any country value.
  - `country_admin`: may only set `country_code` equal to their own `profiles.country_code`; an
    attempt to set it to `null` or another country's value is **rejected by RLS** (`WITH
    CHECK`/`USING` failure), which Supabase surfaces as a Postgres RLS error — `sourcesStore`
    already propagates `err.message` into `error.value` and re-throws (existing 001 behavior), so
    no new error-handling path is required, only a user-facing message in `SourceFormModal.vue`.

**Response shape unchanged** from 001's contract (a `data_sources` row), with `country_code` now
present in every row (`null` or a country code string).

## 2. RLS policy contract (`supabase/migrations/20260706_data_sources_country_scope.sql`)

Read (`SELECT`), mirroring `country_scoped_read_*` from `20260704_country_scoped_disaster_reads.sql`:

```sql
-- anon: unchanged from 001 (public_read_data_sources, USING (true)) — dashboard is
-- read-only for all roles including anonymous, per 001 spec Assumptions.

-- authenticated: super_admin sees all; others see global + their own country
CREATE POLICY "country_scoped_read_data_sources" ON data_sources
  FOR SELECT TO authenticated USING (
    current_profile_role() = 'super_admin'
    OR country_code IS NULL
    OR country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())
  );
```

Write (`INSERT`/`UPDATE`), extending 001's `admins_write_data_sources`/`admins_update_data_sources`:

```sql
-- super_admin: unrestricted (unchanged from 001)
-- country_admin: may only write rows scoped to their own country (never NULL/global,
-- never another country)
CREATE POLICY "country_admin_write_own_country_data_sources" ON data_sources
  FOR INSERT WITH CHECK (
    current_profile_role() = 'country_admin'
    AND country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "country_admin_update_own_country_data_sources" ON data_sources
  FOR UPDATE USING (
    current_profile_role() = 'country_admin'
    AND country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())
  );
```

(Exact policy composition/replacement of 001's existing `admins_write_data_sources` /
`admins_update_data_sources` — which currently allow both roles unconditionally — is a
Postgres-RLS detail resolved at migration-authoring time in Phase 3/4 implementation: policies
are OR'd, so the existing role-only checks must be narrowed for `country_admin` specifically while
`super_admin` keeps the unconditional path, either by rewriting the single existing policy per role
or by adding a per-role pair as sketched above.)

## 3. Frontend helper contract: `groupSourcesByScope()`

`src/utils/sourceScope.js`:

```js
/**
 * @param {Array<{country_code: string|null, ...}>} sources
 * @param {string|null} viewerCountryCode - the viewing admin's own country_code (null for super_admin's "no home country" case, though super_admin sees all rows regardless via RLS)
 * @returns {{ global: Array, local: Array }}
 */
function groupSourcesByScope(sources, viewerCountryCode)
```

- Pure function, no I/O — operates on whatever `sources` array `sourcesStore.sources` already
  holds (already RLS-filtered by the time it reaches the frontend).
- `global` = every source with `country_code == null`.
- `local` = every source with `country_code != null` (RLS guarantees these are only ones the
  viewer is allowed to see — for a non-super_admin this is exactly their own country's sources; for
  a super_admin this may include multiple countries' sources, each still carrying its own
  `country_code` for per-row labeling).
- MUST NOT throw on an empty `sources` array — returns `{ global: [], local: [] }`.
- MUST NOT mutate the input array (returns new arrays via `.filter()`).
