# Feature Specification: Cascading Hazard Risk

**Feature Branch**: `048-cascading-hazard-risk`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Add a Cascading Hazard Risk module, follow-on to spec 039 (Risk & Scenario
Modeling) and spec 008 (Impact Analysis). Goal: when a primary hazard event occurs (or is simulated via
spec 039's scenario builder), automatically evaluate whether it should trigger secondary/cascading risk
assessments in the same area, using ONLY deterministic, admin-configurable rules — explicitly NO AI/ML/LLM
component anywhere in this module's computation path (same constraint and same rationale as spec 039's
FR-005/FR-015/SC-005: this feeds life-safety recommendations to government users and must remain fully
traceable to a documented rule and the specific configured thresholds/weights that produced it, auditable
to partners like UNDP). Core mechanism: a new admin-configurable 'cascade rule' registry (matching the
existing risk_indicators pattern from spec 039 — per-country, admin CRUD, not hardcoded) where each rule
defines: a trigger hazard type, a condition (magnitude/severity threshold and/or spatial proximity to an
existing exposure layer such as HydroRIVERS/HydroBASINS, or coastline proximity), a resulting secondary
risk category, and an admin-editable recommendation text template. Three concrete initial rule examples:
(1) earthquake near a river/basin -> elevated secondary flood risk; (2) any hazard in an area with a high
Vulnerability score -> elevated building-collapse/damage risk, scaled by that score; (3) drought in an
area with already-elevated food-insecurity data -> elevated famine risk. Must reuse existing hazard
tables/history view, hazardFootprint.ts, exposure_datasets/exposure_features, risk_indicators/
risk_area_scores/compute_risk_area_score, and hazard_scenarios (a saved hypothetical scenario should be
able to trigger the same cascade evaluation as a real event). Country-scoped per the federated/
self-hosted-per-country architecture (same three-tier RLS pattern as risk_indicators). Output is a
persisted assessment surfaced in the existing Risk dashboard alongside the composite risk score and
scenario builder, showing: primary event -> triggered secondary risk(s) -> affected population/assets ->
the editable recommendation text -> which specific rule and inputs produced it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure cascade rules for a country (Priority: P1) 🎯 MVP

A country_admin defines the cascade rules relevant to their own country — e.g. "an earthquake of
magnitude 6+ within 15km of a major river triggers an elevated secondary flood risk assessment" — by
picking a trigger hazard type, a condition (severity/magnitude threshold and/or proximity to an existing
exposure layer), a resulting secondary risk category, and writing (or reusing a suggested) recommendation
text template with placeholders for computed values (e.g. affected population, the specific area name).
This configuration lives entirely within that country's own deployment/scope, matching how Vulnerability/
Coping Capacity indicators are configured in spec 039.

**Why this priority**: Every other capability in this module (evaluating a real event, querying a
hypothetical scenario) requires at least one configured rule to exist — without it, there is nothing to
evaluate against.

**Independent Test**: Can be fully tested by an authorized admin creating 2+ rules (one proximity-based,
one vulnerability-score-based) and confirming they are saved, editable, deletable, and scoped only to
that admin's own country — a country_admin from another country cannot see or edit them.

**Acceptance Scenarios**:

1. **Given** an authorized admin on the Risk dashboard, **When** they create a rule with a trigger hazard
   type, a threshold condition, a secondary risk category, and a recommendation template, **Then** the
   rule is saved and appears in their country's rule list.
2. **Given** an existing rule, **When** the admin edits its threshold or recommendation text, **Then**
   the change is saved and future evaluations use the updated rule (past assessments are not silently
   rewritten).
3. **Given** a rule belonging to Country A, **When** a country_admin for Country B views the rule list,
   **Then** Country A's rule is not visible.

---

### User Story 2 - See triggered secondary risks for a real hazard event (Priority: P1) 🎯 MVP

When a real hazard event is recorded (e.g. an earthquake), a user viewing that event or its area on the
Risk dashboard sees any secondary risks that the country's configured cascade rules determined should be
elevated as a result — each with the affected population/assets (reusing existing exposure overlay), the
filled-in recommendation text, and a clear reference to exactly which rule and which input values (e.g.
"magnitude 6.2, 8km from Basin X, area Vulnerability score 7.4") produced that result.

**Why this priority**: This is the actual life-safety value of the module — turning "an earthquake
happened" into "here is what else this area should now be watching for and what to do about it" — and
is independently demonstrable as soon as User Story 1's rules exist.

**Independent Test**: Configure a proximity-based rule and a vulnerability-based rule, record/select a
qualifying real event, confirm both secondary risks appear with correct affected-population figures and
full traceability to the triggering rule; confirm an event that meets no rule's condition shows no
secondary risks (not a fabricated one).

**Acceptance Scenarios**:

1. **Given** a configured "earthquake near river -> flood risk" rule and a real earthquake event within
   that rule's distance/magnitude thresholds, **When** a user views that event's area, **Then** an
   elevated secondary flood risk assessment appears with the recommendation text and affected population.
2. **Given** a configured "high vulnerability -> building-collapse risk" rule, **When** a hazard event
   occurs in an area whose current Vulnerability factor (from spec 039) exceeds the rule's threshold,
   **Then** a building-collapse/damage risk assessment appears, scaled by that area's actual vulnerability
   score.
3. **Given** a hazard event that does not satisfy any configured rule's condition, **When** a user views
   its area, **Then** the dashboard explicitly shows no secondary risks were triggered, not a blank or
   misleading state.
4. **Given** a triggered assessment, **When** a user inspects it, **Then** they can see the exact rule
   name/condition and the exact input values (magnitude, distance, score, etc.) that produced it.

---

### User Story 3 - Query a hypothetical "what would this trigger" scenario (Priority: P2)

A user defines a hypothetical hazard event via the existing scenario builder (spec 039) — e.g. "a
magnitude 4.7 earthquake at this location today" — and the same cascade-rule evaluation used for real
events runs against it, showing which secondary risks would be triggered without any real event having
occurred and without affecting live data.

**Why this priority**: This directly answers the "if X happened here today, what would it set off"
question the module exists for, using a hypothetical input, but depends on User Story 2's evaluation
logic already existing for real events.

**Independent Test**: Build a hypothetical scenario matching a configured rule's condition, confirm the
same secondary risk(s) and recommendation text appear as would for an equivalent real event, clearly
labeled as based on a hypothetical/simulated scenario, not a live assessment.

**Acceptance Scenarios**:

1. **Given** a saved or in-progress hypothetical scenario from spec 039's scenario builder that meets a
   configured rule's condition, **When** the user requests cascade evaluation for it, **Then** the same
   secondary risk(s), affected-population estimate, and recommendation text appear as for a real
   qualifying event, visibly marked as simulated.
2. **Given** a hypothetical scenario for a hazard type or condition with no matching rule, **When**
   evaluated, **Then** the system clearly states no cascade rule was triggered, rather than guessing.

---

### Edge Cases

- What happens when a rule's proximity condition references an exposure layer (e.g. HydroRIVERS) that
  has not been imported for that country yet? The rule must not silently fail or fabricate a result; it
  is flagged as not evaluable with the specific missing layer named.
- What happens when a rule's vulnerability-score condition references an area with no `risk_indicators`
  configured (per spec 039, a fully valid state)? The rule is flagged as not evaluable due to missing
  Vulnerability data for that area, not evaluated against a defaulted/zero score.
- How does the system handle two rules triggering on the same event (e.g. both the proximity rule and the
  vulnerability rule fire)? Both resulting assessments are shown independently, each with its own
  traceability — they are not merged or averaged into a single output.
- How does the system handle a rule whose trigger hazard type has no entry in `hazardFootprint.ts` (no
  documented footprint formula)? The rule cannot evaluate spatial-proximity conditions for that hazard
  type and is flagged accordingly, consistent with spec 039's existing "not yet available" handling
  rather than approximating a footprint.
- What happens if an admin edits or deletes a rule after assessments already exist that were produced by
  it? Existing assessments are historical records and are not retroactively changed or deleted; they
  continue to show the rule configuration that was in effect when they were computed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authorized admin to create, edit, and delete cascade rules scoped to
  their own country, each consisting of: a trigger hazard type, a condition (severity/magnitude threshold
  and/or spatial proximity to a named existing exposure layer or coastline), a resulting secondary risk
  category, and an editable recommendation text template with placeholders for computed values.
- **FR-002**: System MUST NOT hardcode any cascade rule in code — all rules (including the three example
  rules named in this module's motivating description) must be created as ordinary admin-configured data,
  demonstrating the same genericity already required of hazard types and risk indicators elsewhere in
  this project.
- **FR-003**: System MUST evaluate a country's configured cascade rules against a real hazard event and
  persist the resulting secondary risk assessment(s), each including the affected population/assets
  (reusing existing exposure-overlay computation), the filled-in recommendation text, and a reference to
  the exact rule and the exact input values that produced it.
- **FR-004**: System MUST provide the same cascade-rule evaluation for a hypothetical scenario (as
  defined via the existing scenario-simulation capability), clearly labeling any resulting assessment as
  simulated rather than based on a real event.
- **FR-005**: System MUST NOT use any machine-learning, opaque statistical, or generative/LLM-based
  component anywhere in cascade rule evaluation or recommendation-text generation — every triggered
  assessment MUST be traceable to a specific configured rule, its documented condition, and the specific
  input values that satisfied it. Recommendation text is produced by filling placeholders in the admin's
  own template, never generated freeform.
- **FR-006**: System MUST explicitly flag a rule as not evaluable (naming the specific missing
  prerequisite — exposure layer, risk indicator, or footprint formula) rather than silently skipping it,
  defaulting a missing value to zero, or fabricating a result, whenever a required input is unavailable
  for the area in question.
- **FR-007**: System MUST show, for any given hazard event or hypothetical scenario, an explicit "no
  secondary risk triggered" state when no configured rule's condition is satisfied, distinct from the
  "not evaluable" state in FR-006.
- **FR-008**: System MUST allow multiple rules to independently trigger for the same event/scenario,
  presenting each resulting assessment separately rather than combining them into a single score.
- **FR-009**: System MUST scope cascade rules and their resulting assessments by country, following the
  existing three-tier access pattern (super_admin: all countries; country_admin/org_admin: own country
  only; no anonymous read) used by this project's other admin-configured risk data.
- **FR-010**: System MUST preserve historical assessments unchanged when the rule that produced them is
  later edited or deleted, so past assessments remain an accurate record of what was shown at the time.
- **FR-011**: System MUST surface triggered secondary risk assessments in the existing Risk dashboard,
  alongside the composite risk score and scenario builder, in a way that makes clear which primary
  event/scenario produced which secondary risk(s).

### Key Entities *(include if feature involves data)*

- **Cascade Rule**: An admin-configured, country-scoped rule defining a trigger hazard type, a condition
  (threshold and/or proximity to a named exposure layer or coastline), a resulting secondary risk
  category, and a recommendation text template. Analogous in spirit to a Risk Indicator (spec 039) but
  describes a relationship between two hazards/risks rather than a single scoring weight.
- **Cascading Risk Assessment**: A persisted record of one rule's evaluation against one real event or
  hypothetical scenario — capturing the triggering event/scenario reference, the rule that fired, the
  specific input values used, the resulting secondary risk category, the affected population/assets, and
  the filled recommendation text. Historical and immutable once created.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can configure a working cascade rule (from a blank state) in under 5 minutes.
- **SC-002**: For a real hazard event that satisfies a configured rule, the resulting secondary risk
  assessment appears with correct affected-population figures within the same time the existing composite
  risk score (spec 039) becomes available for that area.
- **SC-003**: 100% of triggered assessments shown to users include a visible reference to the specific
  rule and input values that produced them (full traceability, zero unexplained results).
- **SC-004**: Zero AI/ML/generative components are present anywhere in this module's rule-evaluation or
  recommendation-text path, verified by the module's design being fully explainable via its configured
  rules and documented formulas alone (mirrors spec 039's SC-005).
- **SC-005**: A user asking "if a hazard of type/severity X happened at location Y today, what would it
  trigger" via the hypothetical-scenario path receives the same answer a real qualifying event would
  produce, with no additional manual steps beyond building the scenario.

## Assumptions

- This module is a follow-on to spec 039 (Risk & Scenario Modeling) and depends on its existing
  `risk_indicators`/`risk_area_scores`/`compute_risk_area_score`, `hazard_scenarios`, and
  `hazardFootprint.ts` capabilities rather than reimplementing equivalents.
- It also depends on spec 008/038/040/041 exposure infrastructure (`exposure_datasets`/
  `exposure_features`, including HydroRIVERS/HydroBASINS) for proximity-based conditions and
  population/asset overlay figures.
- The three rule examples named in the input (earthquake-near-river flood risk, high-vulnerability
  building-collapse risk, drought-plus-food-insecurity famine risk) are illustrative starting content an
  admin can create using the generic rule mechanism — they are not hardcoded special cases in the system
  itself (per FR-002).
- Proximity conditions are evaluated against whatever exposure layers a country has actually imported;
  a country without a given layer imported simply cannot use rules that depend on it (flagged per FR-006),
  consistent with this project's existing per-country data-availability handling elsewhere.
- No AI/ML/LLM component is in scope anywhere in this module, now or as a future iteration of the
  rule-evaluation or recommendation-text logic itself — per the user's explicit direction, any future
  natural-language generation (e.g. turning an assessment into freeform prose for a report) would be a
  separate, clearly-labeled optional layer on top of this module's deterministic output, not a
  replacement for it, and is out of scope for this spec.
- Recommendation text templates support simple placeholder substitution (e.g. area name, affected
  population, triggering value) rather than conditional logic or scripting.
