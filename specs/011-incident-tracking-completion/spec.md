# Feature Specification: Incident Tracking Completion

**Feature Branch**: `011-incident-tracking-completion`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Incident Tracking modülünü tamamlama (PRD modül M8, docs/21_structured_srs.md §3.8, MHEWS-FC-STM-04). Mevcut `incidents` tablosu ve IncidentsView.vue var (state machine, RLS, audit trigger, temel CRUD). Eksikler: (1) DB'de zorunlu state machine yok, (2) AAR (after-action report) zorunluluğu yok, (3) SOP repository yok, (4) linked_cap_id hiç kullanılmıyor."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guaranteed incident lifecycle integrity (Priority: P1)

An operator (country_admin/org_admin) changes an incident's status as the real-world situation evolves. Regardless of which client or integration performs the update, the system must reject any status change that skips a step in the required lifecycle (open → in_progress → monitoring → closed → archived), so an incident can never be silently mis-tracked (e.g., jumping straight from "open" to "closed" without ever being worked).

**Why this priority**: This is the core data-integrity guarantee the whole module depends on. Without it, every other feature (AAR enforcement, reporting, audit) rests on an unenforced assumption. It is also the most direct, previously-unaddressed constitution/SRS gap (MHEWS-FC-STM-04).

**Independent Test**: Attempt to update an incident's status directly (bypassing the UI) to a non-adjacent state (e.g., `open` → `closed`) and confirm the operation is rejected with a clear error, while a valid adjacent transition (e.g., `open` → `in_progress`) succeeds.

**Acceptance Scenarios**:

1. **Given** an incident with status `open`, **When** a user attempts to set status directly to `closed`, **Then** the system rejects the change and the incident remains `open`.
2. **Given** an incident with status `monitoring`, **When** a user sets status to `closed`, **Then** the change is accepted (subject to Story 2's AAR requirement).
3. **Given** an incident with status `archived`, **When** any status change is attempted, **Then** the system rejects it (archived is terminal).

---

### User Story 2 - Mandatory after-action reflection before closing (Priority: P1)

A country_admin/org_admin closing out a monitored incident must record what happened and what was learned before the incident can be marked `closed`. This ensures every closed incident carries a minimum record of lessons learned, supporting the learning feedback loop the module exists to provide.

**Why this priority**: Directly required by MHEWS-FC-STM-04 ("AAR required for MONITORING→CLOSED") and is the single most concrete, previously-missing behavior named in the module's own governing requirement.

**Independent Test**: Attempt to transition an incident from `monitoring` to `closed` with an empty after-action note, confirm rejection; then supply a non-empty note and confirm the transition succeeds.

**Acceptance Scenarios**:

1. **Given** an incident in `monitoring` status with no after-action notes recorded, **When** a user attempts to transition it to `closed`, **Then** the system rejects the transition and prompts for after-action notes.
2. **Given** an incident in `monitoring` status, **When** a user provides non-empty after-action notes and transitions to `closed`, **Then** the transition succeeds and the notes are permanently stored with the incident.
3. **Given** an already-closed incident, **When** a user views it, **Then** its after-action notes are displayed as part of the incident record.

---

### User Story 3 - Standard operating procedure guidance during an incident (Priority: P2)

A Tenant Admin maintains a small library of standard operating procedures (SOPs), each associated with one or more hazard types. When an operator opens an incident, the system shows any SOPs relevant to that incident's hazard type, so responders have immediate access to the documented procedure without hunting through external documents.

**Why this priority**: Directly named in the module's scope ("SOP repo") and in FR-0207/FR-0242/FR-0344, and is the second concrete capability gap after lifecycle integrity/AAR. It depends on incidents existing but not on Stories 1-2 being implemented first, so it can be built and validated independently.

**Independent Test**: As a Tenant Admin, create an SOP document tagged with hazard type "earthquake"; as any user, open an earthquake incident and confirm the SOP appears in its detail view; confirm a flood incident does not show the earthquake SOP.

**Acceptance Scenarios**:

1. **Given** an active SOP document tagged with hazard type "flood", **When** a user views a `flood` incident, **Then** the SOP appears in a linked-procedures list on that incident.
2. **Given** an SOP document that has been deactivated, **When** a user views an incident matching its hazard type, **Then** the deactivated SOP no longer appears.
3. **Given** a Tenant Admin (super_admin), **When** they create, edit, or deactivate an SOP document, **Then** the change is reflected immediately for all users viewing matching incidents.
4. **Given** a country_admin/org_admin/viewer (not super_admin), **When** they attempt to create or edit an SOP document, **Then** the action is rejected.

---

### User Story 4 - Automatic incident creation from a broadcast alert (Priority: P3)

When an operator broadcasts a CAP alert for a hazard that warrants operational tracking, they can create a linked incident directly from that alert (rather than re-entering the hazard type, severity, and area description by hand), and the resulting incident retains a visible link back to the CAP alert that triggered it.

**Why this priority**: Useful workflow improvement (uses the previously-inert `linked_cap_id` column) but is not required for lifecycle integrity, AAR enforcement, or SOP guidance to deliver value — it is a convenience layer on top of Stories 1-3, hence lowest priority.

**Independent Test**: From a broadcast CAP alert's detail view, trigger "create incident from this alert," confirm a new incident is created pre-filled with the alert's hazard type/severity/area and linked to that CAP alert, and confirm navigating from the incident shows the originating alert.

**Acceptance Scenarios**:

1. **Given** a broadcast CAP alert, **When** an authorized user creates an incident from it, **Then** the new incident's hazard type, severity, and area description are pre-filled from the alert, and the incident stores a reference back to that alert.
2. **Given** an incident created from a CAP alert, **When** a user views the incident, **Then** they can navigate to the originating alert.
3. **Given** a CAP alert that has not been broadcast (still draft/pending approval), **When** a user attempts to create an incident from it, **Then** the action is unavailable.

---

### Edge Cases

- What happens when a user attempts to transition an incident to the same status it is already in (no-op update)? The system MUST reject it as an invalid transition (not a valid lifecycle step), consistent with archived being terminal and every other state having a fixed set of allowed next states.
- How does the system handle an incident stuck in `monitoring` with no SOP matching its hazard type? The linked-procedures list is simply empty; this is not an error condition.
- What happens if a Tenant Admin deactivates an SOP that is currently displayed on several open incidents? It disappears from all of them immediately (no historical/frozen snapshot per incident).
- What happens if a hazard type used by an SOP is later deactivated in the Hazard Taxonomy registry (spec 010)? The SOP remains stored as-is; it simply will not surface on any newly viewed incident of that (now-inactive) type, since inactive hazard types are excluded from the active incident-creation hazard list.
- What happens when a user tries to create an incident from a CAP alert outside their own country/organization scope? The action is rejected the same way direct incident creation outside scope is rejected today (existing RLS behavior, unchanged by this spec).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST enforce, at the data layer (not only in client UI), that an incident's status can only move to one of its explicitly allowed next states: `open`→`in_progress`; `in_progress`→`monitoring` or `closed`; `monitoring`→`closed`; `closed`→`archived`. Any other transition attempt (including re-setting the current status, skipping states, or moving backward) MUST be rejected.
- **FR-002**: The system MUST reject a transition into `closed` from `monitoring` unless the incident has non-empty after-action notes recorded (either already present or supplied as part of the same update).
- **FR-003**: The system MUST persist after-action notes as a permanent, visible part of the incident record once set, and MUST display them wherever incident details are shown.
- **FR-004**: The system MUST allow authorized administrators to create, edit, deactivate, and reactivate SOP (standard operating procedure) documents, each associated with one or more hazard types, a title, and body content (text and/or a reference link).
- **FR-005**: The system MUST display, on each incident's detail view, the list of active SOP documents whose hazard type matches the incident's hazard type.
- **FR-006**: The system MUST restrict SOP document creation/editing/deactivation to the same administrative role tier used for hazard taxonomy management (super_admin), consistent with existing platform conventions; other roles MAY view SOPs but not manage them.
- **FR-007**: The system MUST allow an authorized user to create a new incident directly from a broadcast CAP alert, pre-filling the incident's hazard type, severity, and area description from that alert, and recording a permanent link from the incident back to the originating alert.
- **FR-008**: The system MUST NOT allow creating an incident from a CAP alert that has not reached broadcast status.
- **FR-009**: The system MUST continue to enforce existing incident visibility/write scoping (super_admin sees all; country_admin/org_admin scoped to their own country/organization; viewer read-only) unchanged for all capabilities added by this spec.
- **FR-010**: All state-transition rejections and AAR-requirement rejections MUST surface a clear, specific reason to the user (not a generic/opaque error), distinguishing "invalid transition" from "after-action notes required."
- **FR-011**: All new user-facing text introduced by this spec (SOP management UI, AAR prompt, incident-from-alert action) MUST be available in all 7 supported locales (tr/en/es/fr/ru/ar/zh).

### Key Entities

- **Incident** *(existing entity, extended)*: An operational record tracking a real-world hazard event through its lifecycle. This spec adds enforcement around its existing `status` and `post_event_notes` fields and begins using its existing `linked_cap_id` field; no destructive changes to its existing shape.
- **SOP Document** *(new entity)*: A standard operating procedure reference. Has a title, body/content (and/or external reference link), one or more associated hazard types, and an active/inactive flag. Managed by administrators; read by anyone viewing a matching incident.
- **CAP Alert** *(existing entity, referenced)*: A broadcast alert that can now serve as the origin point for a newly created, linked Incident.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of incident status-transition attempts that skip or reverse a lifecycle step are rejected, regardless of which client performs the request.
- **SC-002**: 100% of incidents that reach `closed` status have non-empty after-action notes recorded — zero incidents can reach `closed` without them.
- **SC-003**: An operator responding to an incident can find a relevant SOP (when one exists for that hazard type) without leaving the incident view.
- **SC-004**: An operator can go from "viewing a broadcast alert" to "having a linked, pre-filled incident record" in a single action, with zero re-typing of hazard type, severity, or area description.
- **SC-005**: All incident-tracking-related administrative and operator-facing text renders correctly in all 7 supported languages with no missing-key fallbacks.

## Assumptions

- The existing `incidents` table, its state values, RLS policies, and audit trigger (established prior to this spec) are correct and are not being redesigned — this spec only adds enforcement, one new linked entity (SOP documents), and wiring for the already-existing `linked_cap_id` column.
- "Tenant Admin" in the PRD/SRS maps to the `super_admin` role in this system's actual RBAC model, consistent with how hazard taxonomy administration (spec 010) and other admin-only capabilities are scoped — there is no separate "Tenant Admin" role distinct from `super_admin`.
- Drill/exercise simulation, annual/automated reporting, LLM-powered SOP guidance, timeline playback, false-alarm-rate metrics, and capacity planning reports (also referenced under PRD module M8 in the SRS) are explicitly out of scope for this spec; they belong to the separate Drill & Exercise module (already tracked separately, 0% complete) or to post-PoC analytics work.
- An SOP document's association with hazard types is a simple many-to-few tag relationship (a hazard type is chosen from the existing hazard taxonomy registry); no versioning or approval workflow for SOP content is required for this iteration.
- "Creating an incident from a CAP alert" is an operator convenience that pre-fills a new incident; it does not retroactively link or merge with any incident that might already exist for the same real-world event — de-duplication of incidents is out of scope.
