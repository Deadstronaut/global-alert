# Quickstart: Validating Data Source Country Scoping

Prerequisites: 001-data-ingestion-monitoring already applied (`data_sources` table with rows
exists), migration `20260706_data_sources_country_scope.sql` applied, two test profiles available
— one `country_admin` with `country_code = 'TR'` and one `country_admin` with `country_code =
'MG'` (Madagascar) or any second country with no local sources yet.

## 1. Apply the migration

```bash
supabase db push
# or, for local dev:
supabase migration up
```
Confirms `data_sources.country_code` column exists (nullable) and the new/updated RLS policies
are in place (see contracts/source-scoping.md).

## 2. Verify existing sources default to global (FR-007, SC-002)

- As any pre-existing admin, open the Sources tab.
- Expected: every source that was visible before this feature ships is still visible
  (`country_code IS NULL` for all pre-existing rows) — no regression.

## 3. Scope a source to Turkey (User Story 3)

- As `super_admin`, edit the "Kandilli" (or "AFAD") source and set its scope to `TR`.
- Expected: save succeeds; the row's `country_code` is now `'TR'`.
- As the `TR` `country_admin`, open the Sources tab.
- Expected: Kandilli/AFAD now appear in the **Local** group, below the divider, under the
  **Global** group (User Story 2).

## 4. Confirm a new country sees zero unrelated local sources (User Story 1 — the core reported problem)

- As the `MG` (or other non-`TR`) `country_admin`, open the Sources tab.
- Expected: Kandilli/AFAD (now `TR`-scoped) do **not** appear anywhere — neither in Global nor
  Local. Only truly global sources (USGS, NASA FIRMS, etc.) are visible; the Local group and its
  divider are entirely absent since Madagascar has zero local sources configured yet (FR-006).

## 5. Confirm write restriction for `country_admin` (FR-008)

- As the `MG` `country_admin`, attempt to create a new source.
- Expected: the scope field is locked/pre-set to `MG` in the form; there is no option to pick
  `TR`, another country, or "Global".
- Attempt (e.g. via direct API call bypassing the UI) to `INSERT`/`UPDATE` a `data_sources` row
  with `country_code = 'TR'` or `country_code = NULL` while authenticated as the `MG`
  `country_admin`.
- Expected: rejected by RLS (`WITH CHECK`/`USING` failure) — confirms the restriction is enforced
  at the database layer, not only hidden in the form (research.md §3).

## 6. Confirm `super_admin` full control (User Story 3)

- As `super_admin`, open the Sources tab.
- Expected: sees every source across every country, with each local source labeled by its own
  country (User Story 2, acceptance scenario 3) — not merged into one undifferentiated "local"
  bucket.
- Create a source and set it to "Global".
- Expected: it appears in every country_admin's Global group on their next view.

## 7. Verify no change to event-level country tagging (FR-010)

- Confirm a disaster event ingested via a `TR`-scoped source (e.g. an earthquake reported by
  Kandilli) is still tagged with its event-level `country_code` exactly as before this feature,
  via the existing boundary/geocoding pipeline — independent of the source's own new scope
  attribute. (No behavior change expected here; this step is a regression check only.)

## 8. Run automated tests

```bash
npm run test    # Vitest — includes sourceScope.test.js (groupSourcesByScope grouping/empty-group cases)
```
All tests pass; `sourceScope.test.js` explicitly covers: mixed global+local input, local-only
viewer, empty-local-group omission case (FR-006), and multi-country super_admin input.
