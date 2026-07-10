# Feature Specification: Risk & Scenario Modeling

**Feature Branch**: `039-risk-scenario-modeling`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Add a Risk & Scenario Modeling module, previously scoped out of spec 008 as
'not-yet-started roadmap module'. Goal: compute a composite risk score per location/administrative area
using the standard deterministic UNDRR/INFORM-style formula: Risk = (Hazard x Exposure) x Vulnerability x
(Lack of) Coping Capacity, where each factor is a weighted composite of normalized indicator layers (0-10
scale), matching INFORM Risk Index's published methodology exactly (no ML/AI — fully deterministic,
auditable, reproducible, since this feeds life-safety decisions and must be explainable to partners like
UNDP). Hazard x Exposure reuses existing hazard event history and existing exposure_datasets/
exposure_features (population etc., from spec 008/038). Vulnerability and Coping Capacity are new
composite indices built from country-uploaded socioeconomic indicator layers — indicators and their
weights must be admin-configurable per country (not hardcoded), consistent with this project's strict
genericity requirement. Also add scenario modeling: given a hypothetical hazard event, simulate its
footprint using established deterministic physics/empirical formulas per hazard type, and overlay it
against exposure+vulnerability layers to estimate expected impact. Add probabilistic simulation: Monte
Carlo sampling over historical hazard frequency/severity distributions per area to produce a probabilistic
loss/impact exceedance curve. Explicitly OUT of scope: any AI/ML model — that remains the separate,
still-not-started 'Forecasting/AI' roadmap module referenced in spec 008. Follow-on to specs 008 (Impact
Analysis) and 038 (Population Exposure Sources)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure a country's Vulnerability & Coping Capacity indicators (Priority: P1)

A country_admin uploads (or maps from existing exposure datasets) a set of socioeconomic indicator
layers for their country — e.g., poverty rate, food insecurity, health access, governance capacity —
each tagged as contributing to either "Vulnerability" or "Coping Capacity", and assigns a relative
weight to each. This configuration lives entirely within that country's own deployment/scope.

**Why this priority**: Every other capability in this module (composite risk score, scenario overlay)
requires at least one configured Vulnerability/Coping Capacity indicator set to exist — without it,
the risk formula has no denominator/multiplier data to compute against.

**Independent Test**: Can be fully tested by an authorized admin uploading 2+ indicator layers, tagging
them, assigning weights, and confirming a "Vulnerability" and "Coping Capacity" composite score appears
per administrative area, computed strictly from that country's own configured indicators.

**Acceptance Scenarios**:

1. **Given** an authorized admin with two uploaded indicator layers (e.g., poverty rate, health access),
   **When** they tag each as Vulnerability or Coping Capacity and assign a weight (0-100%, weights per
   category summing to 100%), **Then** the system computes and displays a normalized 0-10 composite
   score per administrative area for each category.
2. **Given** a country_admin has configured no indicators yet, **When** they view the risk module,
   **Then** the system clearly states no Vulnerability/Coping Capacity configuration exists yet rather
   than showing a misleading zero or default score.
3. **Given** indicator weights for a category do not sum to 100%, **When** the admin attempts to save,
   **Then** the system rejects the save with a clear validation message.
4. **Given** a country_admin from country A, **When** they view indicator configuration, **Then** they
   cannot see or edit country B's indicator layers or weights.

---

### User Story 2 - View composite risk score per administrative area (Priority: P1)

A country_admin or super_admin views a map/list of administrative areas, each showing a computed
composite risk score (Hazard × Exposure × Vulnerability × Lack of Coping Capacity, normalized 0-10),
along with a breakdown of the four contributing factors so the score is auditable rather than a single
opaque number.

**Why this priority**: This is the module's core value proposition — a defensible, explainable risk
ranking across areas, the foundational output every other feature (scenario overlay, exceedance
curves) builds on or references.

**Independent Test**: Can be fully tested by configuring Hazard/Exposure/Vulnerability/Coping Capacity
inputs for a known area and confirming the displayed composite score and its four-factor breakdown
match a manually-computed expectation using the documented formula.

**Acceptance Scenarios**:

1. **Given** an administrative area with existing hazard history, exposure data, and configured
   Vulnerability/Coping Capacity indicators, **When** a user views that area's risk score, **Then** the
   system displays a single composite score (0-10) plus the four underlying factor scores that produced
   it.
2. **Given** an area with hazard history but no configured exposure dataset, **When** the composite
   score is computed, **Then** the system clearly flags the Exposure factor as "not available" rather
   than silently treating it as zero (which would understate risk).
3. **Given** two areas with identical Hazard/Exposure/Vulnerability but different Coping Capacity,
   **When** compared, **Then** the area with lower coping capacity shows a proportionally higher
   composite risk score, consistent with the documented formula's direction.

---

### User Story 3 - Simulate a hypothetical hazard scenario (Priority: P2)

A country_admin defines a hypothetical hazard event (e.g., "magnitude 7.0 earthquake centered at point
X", "category 3 cyclone following track Y") and the system simulates that event's footprint using a
deterministic, hazard-type-appropriate formula, then overlays the footprint against exposure and
vulnerability layers to estimate the population and assets that would be affected.

**Why this priority**: Delivers the "scenario" half of "Risk & Scenario Modeling" — planning/drill use
cases (e.g., "what if a major quake hit this city") — but depends on Story 2's composite-score
machinery already existing and correctly wired to real data.

**Independent Test**: Can be fully tested by defining a hypothetical earthquake at a known location with
a known magnitude, confirming the simulated footprint radius matches the documented formula, and
confirming the estimated affected population matches manual computation against known exposure data.

**Acceptance Scenarios**:

1. **Given** a user defines a hypothetical earthquake (magnitude, epicenter), **When** they run the
   simulation, **Then** the system displays the estimated affected area (as a map overlay) and the
   estimated exposed population/assets within it, using the same deterministic per-hazard-type formula
   documented for that hazard type.
2. **Given** a hazard type without a documented deterministic footprint formula (e.g., a hazard type
   added later with no scenario formula defined yet), **When** a user attempts a scenario for that type,
   **Then** the system clearly states scenario simulation is not yet available for that hazard type
   rather than silently returning an inaccurate or zero result.
3. **Given** a completed scenario simulation, **When** the user saves it, **Then** it can be reloaded
   later with the same inputs and outputs (matching the existing saved-scenario pattern from spec 008).

---

### User Story 4 - View a probabilistic risk exceedance curve for an area (Priority: P3)

A country_admin or super_admin selects an administrative area and hazard type and views a probabilistic
exceedance curve — e.g., "there is an X% annual chance that impact in this area exceeds Y" — generated
from historical hazard frequency/severity data for that area, rather than a single deterministic
estimate.

**Why this priority**: Adds statistical rigor and planning value (e.g., for financing/preparedness
decisions) on top of Stories 2-3, but the module delivers its primary explainability value without it —
this is an enhancement, not a blocker.

**Independent Test**: Can be fully tested by selecting an area with sufficient historical hazard event
history, running the simulation, and confirming the resulting curve's shape and headline probability
figures are reproducible (same inputs and random seed produce the same curve) and directionally
consistent with the area's known hazard frequency.

**Acceptance Scenarios**:

1. **Given** an area with at least a minimum threshold of historical hazard event records, **When** a
   user requests a probabilistic exceedance curve for a hazard type, **Then** the system displays a
   curve showing impact level vs. probability of exceedance, plus the number of historical events used
   to generate it.
2. **Given** an area with insufficient historical hazard event history to produce a statistically
   meaningful curve, **When** a user requests one, **Then** the system states there is insufficient
   historical data rather than generating a misleading curve from too few data points.

---

### Edge Cases

- What happens when an administrative area's boundary spans two different country deployments (should
  not occur given this project's federated per-country isolation, but the system must not silently
  merge or average data across a boundary as if it were one area)?
- How does the system handle an admin changing indicator weights after historical composite scores have
  already been computed and displayed/exported — are prior computed scores recalculated, or preserved
  as a point-in-time snapshot with a recorded "as of" configuration version?
- How does the system handle a hazard type that has hazard event history but zero configured Hazard
  weight (e.g., an admin deliberately excludes a hazard type from the composite formula) — does it
  simply not contribute, or is that treated as a configuration error?
- What happens when a scenario's hypothetical hazard parameters fall outside the range the deterministic
  formula was validated for (e.g., an unrealistically extreme magnitude)? The system should flag the
  result as outside the formula's validated range rather than presenting it with the same confidence as
  an in-range estimate.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authorized admin to upload or select socioeconomic indicator layers
  and tag each as contributing to "Vulnerability" or "Coping Capacity" for their own country's scope
  only.
- **FR-002**: System MUST allow an authorized admin to assign a relative weight to each indicator within
  its category, and MUST validate that weights within a category sum to 100% before saving.
- **FR-003**: System MUST compute a normalized composite score (0-10 scale) per administrative area for
  each of the four risk factors — Hazard, Exposure, Vulnerability, Lack of Coping Capacity — using
  country-specific configured weights, with no cross-country hardcoded values anywhere in the
  computation logic.
- **FR-004**: System MUST compute an overall composite risk score per administrative area as a
  deterministic, documented, reproducible function of the four factor scores (Risk = Hazard × Exposure
  × Vulnerability × Lack of Coping Capacity, each normalized before combination), and MUST make the
  four contributing factor scores visible alongside the composite score, not just the final number.
- **FR-005**: System MUST NOT use any machine-learning or opaque statistical model anywhere in the
  composite risk score computation — every step from raw indicator to final score MUST be traceable to
  a documented deterministic formula and the specific configured weights that produced it.
- **FR-006**: System MUST reuse existing hazard event history (frequency/severity per area) and existing
  exposure datasets/features (spec 008/038) as the Hazard and Exposure inputs respectively, rather than
  introducing a parallel/duplicate data model for either.
- **FR-007**: System MUST clearly indicate, per administrative area, when one or more of the four risk
  factors cannot be computed due to missing input data (e.g., no exposure dataset configured), rather
  than silently defaulting the missing factor to zero (which would understate the composite score).
- **FR-008**: System MUST allow an authorized admin to define a hypothetical hazard scenario (hazard
  type plus type-appropriate parameters, e.g., magnitude and epicenter for earthquake) and simulate its
  footprint using a deterministic, published, hazard-type-specific formula.
- **FR-009**: System MUST overlay a simulated scenario footprint against configured exposure and
  vulnerability layers to produce an estimated affected-population/asset figure for that scenario.
- **FR-010**: System MUST clearly state when scenario simulation is unavailable for a given hazard type
  (no formula defined yet) rather than returning a fabricated or silently-zero result.
- **FR-011**: System MUST allow a completed scenario simulation to be saved with a name and reloaded
  later with the same inputs and outputs, consistent with the existing saved-scenario pattern (spec
  008).
- **FR-012**: System MUST generate a probabilistic exceedance curve (impact level vs. probability of
  exceedance) for a given area and hazard type, derived via statistical sampling over that area's
  historical hazard frequency/severity records — not a machine-learned model.
- **FR-013**: System MUST require a minimum threshold of historical hazard event records for an area
  before generating a probabilistic exceedance curve, and MUST state when that threshold is not met
  rather than generating a curve from insufficient data.
- **FR-014**: System MUST scope all Vulnerability/Coping Capacity indicator configuration, computed risk
  scores, and scenario data by country, consistent with existing country-scoped RLS patterns — no
  country's indicator configuration or computed scores are visible to another country's admins.
- **FR-015**: System MUST NOT incorporate any AI/ML-based component (image analysis, ML classifiers,
  forecast/AI projection) anywhere in this module's risk score, scenario footprint, or exceedance curve
  computations.

### Key Entities *(include if feature involves data)*

- **Risk Indicator**: A single socioeconomic data layer (e.g., poverty rate) contributed by a country,
  tagged as Vulnerability or Coping Capacity, with an assigned weight within its category; scoped to one
  country.
- **Composite Risk Score**: The computed four-factor (Hazard, Exposure, Vulnerability, Lack of Coping
  Capacity) and overall risk score for one administrative area at a point in time, including which
  indicator configuration version produced it (for auditability if weights later change).
- **Hazard Scenario**: A user-defined hypothetical hazard event (type + parameters) plus its simulated
  footprint and estimated exposure/impact overlay result; may be saved and reloaded.
- **Risk Exceedance Curve**: A computed probability distribution of impact levels for a given
  area/hazard type, derived from historical hazard event records for that area, including the record
  count used to generate it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any administrative area with fully configured inputs, a user can view the composite
  risk score and its four-factor breakdown in a single view, with every number traceable to a
  documented formula and the specific indicator weights that produced it (no black-box output).
- **SC-002**: A country's Vulnerability/Coping Capacity indicator configuration and computed risk scores
  are never visible to admins of another country, verified across at least two distinct country scopes.
- **SC-003**: A defined hazard scenario's estimated affected population, when checked against a manually
  computed expectation for a known test case, matches within the documented formula's expected
  precision.
- **SC-004**: A probabilistic exceedance curve is only ever shown for area/hazard-type combinations
  meeting the minimum historical-record threshold; below that threshold, users see an explicit
  insufficient-data message instead of a curve.
- **SC-005**: Zero AI/ML components are present anywhere in this module's computation path, verified by
  the module's design being fully explainable via its documented formulas alone.

## Assumptions

- The INFORM Risk Index's published methodology (Hazard & Exposure, Vulnerability, Lack of Coping
  Capacity — weighted composite, normalized 0-10 scale) is used as the reference formula structure;
  exact published INFORM sub-indicator sets are not required — countries configure their own indicator
  layers within this project's generic mechanism (see the partner-questions document, question C.2, for
  the open question of whether UNDP's own INFORM data/methodology should be adopted directly).
- "Administrative area" reuses whatever administrative boundary granularity already exists in this
  project's boundary data (e.g., `country_boundaries` or a finer subdivision if one exists) rather than
  introducing a new boundary concept.
- Deterministic hazard-footprint formulas are implemented per hazard type incrementally — this spec
  requires at least earthquake (extending spec 008's existing magnitude-derived radius) at launch, with
  other hazard types' formulas (cyclone, flood, etc.) added as separately justified follow-on work if a
  documented formula is not yet available, per FR-010's explicit "not yet available" handling.
- Monte Carlo/statistical sampling for exceedance curves runs against each country's own isolated
  historical hazard data only — no cross-country pooling of event history, consistent with this
  project's data isolation requirements.
- This module produces decision-support output for admins/analysts; it does not automatically trigger
  alerts, dispatch, or any CAP-related workflow (out of scope, per Principle II Scope Discipline).
