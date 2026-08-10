# Feature Specification: Forecast Model Registry Fields

**Feature Branch**: `059-forecast-model-registry`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: User description: "MHEWS gap analysis (Observations & Forecasting pillar): forecast_snapshots (spec 055) has no model version or confidence tracking — every row looks equally authoritative. Add model_version and a lead-time-based confidence_score, pure schema + ingestion-script change, no external dependency."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Analyst tells which model cycle produced a forecast, and how much to trust a far-out day (Priority: P1)

An analyst looking at the 15-day forecast detail chart wants to know which GFS run the shown data
came from, and can see that a Day 14 forecast is inherently less certain than a Day 1 forecast.

**Independent Test**: Load the forecast dashboard, select a variable, confirm the model version
label appears below the chart, and confirm hovering different days shows a decreasing confidence
percentage as the day number increases.

**Acceptance Scenarios**:

1. **Given** wind-importer writes a new `forecast_snapshots` row, **When** the row is inserted,
   **Then** it includes `model_version` (e.g. `"GFS 2026081006Z"`) and `confidence_score` (0-1).
2. **Given** the forecast dashboard's detail chart is showing a variable's series, **When** the
   admin hovers a point, **Then** the crosshair tooltip includes that day's confidence percentage.
3. **Given** existing `forecast_snapshots` rows written before this change, **When** they are read,
   **Then** `model_version`/`confidence_score` are simply NULL/absent from display — no error.

### Edge Cases

- `confidence_score` is a lead-time heuristic (linear decay from 1.0 at issuance to a 0.3 floor at
  the 360-hour/15-day horizon), not a model-native ensemble spread — GFS's deterministic run
  ingested by this importer carries no ensemble data to derive a statistical one from. This is
  documented in code and in this spec so it is never mistaken for a rigorous skill score.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `forecast_snapshots` MUST have nullable `model_version TEXT` and `confidence_score
  DOUBLE PRECISION` (0-1) columns.
- **FR-002**: `wind-importer/main.py` MUST populate both fields on every new forecast snapshot row
  it writes.
- **FR-003**: `confidence_score` MUST decrease monotonically as `forecast_step_hours` increases.
- **FR-004**: The forecast dashboard MUST surface both fields to the user (model version label,
  confidence in the hover tooltip) without requiring a new panel.
- **FR-005**: This feature MUST NOT change any existing forecast ingestion, storage-path, or
  retention behavior — additive columns only.

### Key Entities

- **forecast_snapshots** (extended): adds `model_version`, `confidence_score`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of forecast snapshot rows written after this change carry both fields.
- **SC-002**: An analyst can identify, without leaving the dashboard, which model cycle a forecast
  came from and how lead time affects its confidence.

## Assumptions

- No new external data source or credential is introduced — this is a pure ingestion-script and
  schema change plus a small dashboard display addition, matching the "fully completable now"
  classification from the MHEWS gap review.
