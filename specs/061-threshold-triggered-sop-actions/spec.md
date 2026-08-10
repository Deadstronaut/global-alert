# Feature Specification: Threshold-Triggered SOP Actions

**Feature Branch**: `061-threshold-triggered-sop-actions`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: User description: "MHEWS gap analysis (Preparedness & Response pillar): no anticipatory-action automation exists linking a fired risk threshold (cascade_rules, spec 048/049) to the SOP repository (spec 010/033) — an admin has to manually remember which procedure applies. Link a cascade rule to a SOP document so every assessment it produces surfaces the relevant procedure directly."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin links a cascade rule to its procedure (Priority: P1)

An admin configuring a cascade rule (e.g. "earthquake M6+ near a hospital → elevated epidemic
risk") wants to attach the SOP document that describes what to actually do when that risk fires,
so responders don't have to separately search the SOP repository during an actual event.

**Independent Test**: Open the cascade rule form, select a SOP from the dropdown, save, and confirm
the rule shows the linked SOP on reload.

**Acceptance Scenarios**:

1. **Given** an admin is creating or editing a cascade rule, **When** they select a SOP document
   from the linked-SOP dropdown and save, **Then** `cascade_rules.linked_sop_document_id` stores
   that SOP's id.
2. **Given** a rule has no SOP selected, **When** saved, **Then** `linked_sop_document_id` is NULL
   (unchanged behavior for rules that don't need one).

### User Story 2 - Responder sees the recommended procedure on a fired assessment (Priority: P1)

When spec 049's automatic (or a manual) cascade evaluation fires a rule that has a linked SOP, the
resulting assessment shows the SOP's title directly, without a separate lookup.

**Independent Test**: Fire a rule with a linked SOP (via `evaluate_cascade_rules` or the
auto-evaluate trigger), and confirm the returned/stored assessment includes the SOP's title.

**Acceptance Scenarios**:

1. **Given** a cascade rule with `linked_sop_document_id` set fires, **When** the assessment is
   created, **Then** `cascading_risk_assessments.sop_document_id` is copied from the rule and the
   assessment's JSON payload includes `sop_title`.
2. **Given** the rule that fired has no linked SOP, **When** the assessment is created, **Then**
   `sop_document_id`/`sop_title` are simply NULL/absent — no error, no placeholder text.
3. **Given** an admin later unlinks or deletes the SOP from the rule, **When** a past assessment
   (created while the link existed) is viewed, **Then** it still shows its own stored
   `sop_document_id` at the time it fired (immutability, matching `rule_config_snapshot`'s existing
   convention) — ON DELETE SET NULL only affects future reads of a deleted SOP, not the historical
   record's correctness up to that point.

### Edge Cases

- This spec does not change *whether* or *when* a rule fires (spec 048/049's evaluation logic is
  untouched) — it only adds a procedure pointer to what already fires.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `cascade_rules` MUST have a nullable `linked_sop_document_id UUID REFERENCES
  sop_documents(id) ON DELETE SET NULL`.
- **FR-002**: `cascading_risk_assessments` MUST have a nullable `sop_document_id` column, populated
  from the firing rule's `linked_sop_document_id` at evaluation time.
- **FR-003**: `save_cascade_rule` MUST accept an optional linked-SOP parameter, backward compatible
  with every existing caller (new parameter has a default).
- **FR-004**: `_evaluate_cascade_rules_core`'s returned `triggered` entries MUST include
  `sop_document_id` and `sop_title` (NULL when unset).
- **FR-005**: The cascade rule admin form MUST let an admin pick a SOP from the existing SOP
  repository; the cascading risk panel MUST display the linked SOP's title on any assessment that
  has one.
- **FR-006**: This feature MUST NOT change any existing rule-firing condition, authorization check,
  or the shape of any field that existed before this change (additive only).

### Key Entities

- **cascade_rules** (extended): `linked_sop_document_id`.
- **cascading_risk_assessments** (extended): `sop_document_id`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can link a rule to a procedure in under 30 seconds from the existing rule
  form.
- **SC-002**: 100% of assessments produced by a rule with a linked SOP surface that SOP's title
  without a separate query by the viewing admin.

## Assumptions

- This is the "action" half of "threshold-triggered action" — the "automatic" half already exists
  (spec 049's `auto_evaluate_cascade` trigger on hazard-event insert). No new automation timing or
  trigger mechanism was needed, only the missing procedure link.
- Pure schema + admin-configured link + display change — no external dependency, matching the
  "fully completable now" classification from the MHEWS gap review.
