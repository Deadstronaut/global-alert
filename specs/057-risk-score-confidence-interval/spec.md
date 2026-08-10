# Feature Specification: Risk Score Confidence Interval

**Feature Branch**: `057-risk-score-confidence-interval`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: User description: "MHEWS gap analysis (Disaster Risk Knowledge pillar): risk_area_scores.composite_score is a single point value with no uncertainty band, unlike a mature impact-based forecasting capability which communicates confidence alongside a number. Add a confidence interval to the composite risk score, computable now with no external dependency."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Analyst sees how much to trust a computed risk score (Priority: P1)

An analyst viewing `RiskScoreDashboard.vue` for an area with very few historical hazard events or
very few exposure/vulnerability/coping-capacity records wants to know the computed composite score
is thin, rather than reading `6.2` as if it were as solid as a score backed by hundreds of records.

**Why this priority**: A single point score with no indication of its basis can be over-trusted in
exactly the low-data areas where it is least reliable — the core gap identified in the MHEWS
capacity review.

**Independent Test**: Compute a risk score for an area/hazard combination with a small number of
underlying records and confirm the dashboard shows a wide low–high range; compute one for an area
with many records and confirm the range is narrow.

**Acceptance Scenarios**:

1. **Given** `compute_risk_area_score` produces a non-null `composite_score`, **When** the row is
   inserted into `risk_area_scores`, **Then** `composite_score_low`, `composite_score_high`, and
   `confidence_sample_size` are also populated.
2. **Given** any of the four factors is missing (`composite_score` is NULL), **When** the row is
   inserted, **Then** the confidence columns are also NULL (never a false band around a null score).
3. **Given** the dashboard receives a score with a populated confidence range, **When** it renders
   the composite score, **Then** it also shows the low–high range and the sample size it was based
   on.

### Edge Cases

- An area with exactly one underlying record per factor still produces a band (not a divide-by-zero
  or NULL) — `GREATEST(sample_size, 1)` guards this.
- The band is clamped to the score's valid 0–10 range on both ends.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store `composite_score_low`, `composite_score_high`, and
  `confidence_sample_size` alongside every `risk_area_scores` row where `composite_score` is
  non-null.
- **FR-002**: The confidence band MUST widen as the smallest underlying factor's record count
  shrinks, and narrow as it grows.
- **FR-003**: System MUST NOT populate a confidence band when `composite_score` itself is NULL.
- **FR-004**: The risk dashboard MUST display the confidence range and sample size next to the
  composite score whenever present.
- **FR-005**: This feature MUST NOT change `compute_hazard_area_score`'s existing return type or
  any existing caller's behavior (additive-only, per spec 039's own convention).

### Key Entities

- **risk_area_scores** (extended): adds `composite_score_low DOUBLE PRECISION`,
  `composite_score_high DOUBLE PRECISION`, `confidence_sample_size INTEGER`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of `risk_area_scores` rows with a non-null `composite_score` also carry a
  non-null confidence band.
- **SC-002**: An analyst can visually distinguish a low-confidence score from a high-confidence one
  without consulting any other panel.

## Assumptions

- No per-indicator variance is stored anywhere in the system, so a rigorous statistical confidence
  interval cannot be computed; an inverse-sqrt-of-sample-size heuristic band is used instead and is
  documented as such in the migration and in this spec — it communicates "thin data" honestly
  without claiming statistical rigor it doesn't have.
- This is a pure computation/display change — no new external data source, credential, or API is
  required, matching the "fully completable now" classification from the MHEWS gap review.
