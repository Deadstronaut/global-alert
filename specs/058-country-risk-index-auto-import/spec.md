# Feature Specification: Country Risk Index Automated Import

**Feature Branch**: `058-country-risk-index-auto-import`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: User description: "MHEWS gap analysis (Disaster Risk Knowledge pillar): country_risk_indices (INFORM Index) is entered by hand every year with no automated update path. Add a scheduled import — no external API key is needed since INFORM-style indices are published as public CSV downloads, just a URL a Super Admin points the system at."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Super Admin configures an automated feed instead of yearly manual entry (Priority: P1)

A Super Admin who currently re-types each country's INFORM Index numbers by hand once a year
instead points the system at a public CSV URL once, and the table stays current automatically.

**Independent Test**: Set `source_url` to a CSV with the expected header, mark it active, click
"Import now", and confirm new/updated rows appear in `country_risk_indices` with `source` matching
the configured label.

**Acceptance Scenarios**:

1. **Given** a Super Admin has configured and activated a source URL, **When** the scheduled job or
   a manual "Import now" runs, **Then** the CSV is fetched, parsed, and each valid row is upserted
   into `country_risk_indices` on `(country_code, year, source)`.
2. **Given** the import settings are inactive or have no URL configured, **When** the scheduled job
   runs, **Then** it exits immediately with a "skipped" result and makes no database writes.
3. **Given** a CSV row is missing a usable `country_code` or `year`, **When** it is processed,
   **Then** that row is skipped (counted, not silently dropped) and the rest of the file still
   imports.
4. **Given** a CSV row has no explicit `composite_score` column, **When** it is imported, **Then**
   the composite score is computed as the mean of whichever of the three dimension scores are
   present.
5. **Given** an import run completes (success or failure), **When** an admin reopens the panel,
   **Then** they see the last run's timestamp, status, and message.

### Edge Cases

- A network failure or non-2xx response from the source URL is recorded as `last_run_status =
  'failure'` with the error message, and does not throw an unhandled error to the caller.
- Re-running an import with the same CSV is idempotent (upsert on the same unique key, no
  duplicate rows).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a single-row configuration (`country_risk_index_import_settings`)
  for a CSV source URL, a label, and an active/inactive toggle, editable only by a Super Admin.
- **FR-002**: System MUST provide a scheduled (monthly) job that invokes the import when active,
  and a manual "Import now" action an admin can trigger on demand.
- **FR-003**: The import MUST upsert into `country_risk_indices`, never duplicate rows for the same
  `(country_code, year, source)`.
- **FR-004**: The import MUST require no third-party API key or account — only a plain HTTP(S) URL.
- **FR-005**: System MUST record the outcome (success/failure + message) of every import run.
- **FR-006**: This feature MUST NOT remove or change the existing manual entry path in
  `CountryRiskIndexPanel.vue` — automated and manual entry coexist (manual entry remains the only
  option until a Super Admin opts into automation).

### Key Entities

- **country_risk_index_import_settings**: `source_url`, `source_label`, `is_active`,
  `last_run_at`, `last_run_status`, `last_run_message`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Super Admin can go from a blank configuration to a populated `country_risk_indices`
  table in under 2 minutes, given a valid CSV URL.
- **SC-002**: Once configured and active, no manual yearly re-entry is required for countries
  covered by the source CSV.

## Assumptions

- INFORM Index (and similar indices) are published as plain downloadable CSV/spreadsheet exports
  without an authenticated API — this spec targets that shape. If a future source only offers a
  gated API, that becomes a "just needs a credential" integration (see spec 066/parking doc), not
  this one.
- The exact public download URL is left for the Super Admin to enter and verify (published index
  URLs and formats change over time); this spec ships the mechanism, not a hardcoded URL.
