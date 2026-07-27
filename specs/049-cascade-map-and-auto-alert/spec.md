# Feature Specification: Cascade Map Integration & Opt-In Auto-Evaluation

**Feature Branch**: `049-cascade-map-and-auto-alert`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Add two extensions to the Cascading Hazard Risk module (spec 048): (1)
Map-integrated cascade risk view — add the existing cascading-risk evaluation to the main operational
map's impact-analysis side panel (where a user already one-click-analyzes affected population/critical
infrastructure for a selected hazard event), so a user investigating a real event on the main map sees
triggered secondary risks without switching to the admin panel; requires resolving an administrative
boundary code for the selected event's location using this project's existing client-side boundary
lookup utilities. (2) Opt-in automatic cascade evaluation per country ('second alarm system') — a
per-country setting, toggleable ONLY by country_admin (not org_admin, not viewer, who must not even see
the setting), defaulting OFF for every country; when enabled, a new real hazard event of a type with at
least one active cascade rule automatically triggers cascade evaluation without a user manually
clicking anything. Explicitly out of scope regardless of this setting: automatically feeding a CAP
alert, automatically dispatching/emailing/notifying external recipients, or otherwise touching the
existing CAP authoring/dispatch pipeline — this remains strictly decision-support. The only user-visible
effect of an automatic evaluation is a visible in-app unacknowledged-count/badge indicator a
country_admin/org_admin can see and dismiss, no push notification, no external channel, no new
real-time/SSE infrastructure. Both extensions reuse the existing spec 048 schema
(cascade_rules/cascading_risk_assessments/evaluate_cascade_rules) and UI component
(CascadingRiskPanel.vue) unmodified — purely additive new entry points. No AI/ML in either extension."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See cascading risks for a real event directly on the operational map (Priority: P1) 🎯 MVP

A user investigating a real hazard event on the main map — the same place they already check affected
population and critical infrastructure with one click — sees a "Cascading Risks" section in the same
side panel, showing any triggered secondary risks for that event without needing to switch to the Admin
panel's Risk & Scenario Modeling tab.

**Why this priority**: This is the most immediately useful extension — it puts an already-built
capability (spec 048) where operational users actually work (the map), rather than requiring them to
know it exists in a separate admin screen.

**Independent Test**: Select a real hazard event on the map that satisfies a configured cascade rule,
confirm the side panel's new section shows the same triggered/not-evaluable/no-risk result the admin
panel's dashboard would show for the same event, without leaving the map view.

**Acceptance Scenarios**:

1. **Given** a user has selected a real hazard event on the map whose location satisfies a configured
   cascade rule, **When** they view the map's impact-analysis side panel, **Then** a "Cascading Risks"
   section shows the triggered secondary risk(s) with the same recommendation text and traceability the
   admin dashboard shows for an equivalent lookup.
2. **Given** a selected event whose location cannot be resolved to any known administrative boundary,
   **When** the side panel attempts to evaluate cascades, **Then** it shows a clear "cannot determine
   area for this location" state rather than silently omitting the section or guessing an area.
3. **Given** a selected event that triggers no cascade rule, **When** the side panel evaluates cascades,
   **Then** it shows the same explicit "no secondary risk triggered" state as the admin dashboard.

---

### User Story 2 - Country admin opts a country into automatic cascade evaluation (Priority: P2)

A country_admin decides whether new real hazard events in their country should be automatically checked
against configured cascade rules, without anyone needing to manually click "evaluate" each time. This
choice is visible and changeable only by that country's country_admin — org_admin and viewer users never
see this setting at all, since it is a policy decision for a single accountable role, not an operational
toggle for everyone with access.

**Why this priority**: Valuable but depends on User Story 1/spec 048 already existing and being trusted;
it also introduces a real operational-policy decision (turning on an automatic mechanism) that a country
should opt into deliberately, priority below the always-useful map integration.

**Independent Test**: As country_admin, enable the setting for one country, trigger a new real qualifying
event, confirm an assessment is created automatically and an unacknowledged indicator appears without
any manual "evaluate" action; confirm the setting is invisible to org_admin/viewer sessions; confirm no
CAP draft, dispatch job, or external notification of any kind is created as a side effect.

**Acceptance Scenarios**:

1. **Given** a country_admin views their country's cascade settings, **When** they turn automatic
   evaluation on, **Then** the setting is saved and takes effect for subsequent new real events in that
   country only.
2. **Given** automatic evaluation is enabled for a country and a new real hazard event of a type with an
   active cascade rule occurs, **When** the event is recorded, **Then** cascade evaluation runs
   automatically and any triggered assessment increases a visible unacknowledged-count indicator, with no
   CAP alert, dispatch job, email, or other external-facing action created.
3. **Given** an org_admin or viewer session for that same country, **When** they look for this setting
   anywhere in the product, **Then** it is not present — only country_admin (and super_admin, across all
   countries) can see or change it.
4. **Given** an unacknowledged automatic assessment indicator, **When** an authorized user views the
   relevant area/assessment, **Then** they can acknowledge/dismiss it, clearing it from the count.
5. **Given** automatic evaluation is disabled (the default) for a country, **When** new real hazard
   events occur, **Then** no automatic evaluation happens — cascade evaluation remains fully manual for
   that country, identical to spec 048's original on-demand-only behavior.

---

### Edge Cases

- What happens when the same real event would satisfy multiple active rules under automatic evaluation?
  Every rule that fires produces its own assessment and its own contribution to the unacknowledged count,
  same as manual evaluation (spec 048 FR-008) — never merged into one.
- What happens if automatic evaluation is enabled but the country has zero active cascade rules for the
  incoming event's hazard type? No evaluation work happens (nothing to check), consistent with spec 048's
  existing "no rules configured" handling — this is not an error state.
- How does the map's side panel behave for a hypothetical (not real) event? This story only covers real
  events selected on the operational map; hypothetical-scenario evaluation remains in the admin panel's
  Scenario Builder (spec 048 US3), unchanged.
- What happens to the unacknowledged count across multiple admins in the same country? It reflects the
  country's total unacknowledged automatic assessments regardless of who eventually acknowledges them —
  any authorized user acknowledging one reduces the shared count for everyone in that country.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show a "Cascading Risks" section in the main map's existing impact-analysis
  side panel for a selected real hazard event, using the same evaluation logic and result states
  (triggered / not-evaluable / no-risk) already established by spec 048.
- **FR-002**: System MUST resolve the administrative boundary for a selected map event using this
  project's existing boundary-lookup capability rather than introducing a new or duplicate
  boundary-resolution mechanism; when no boundary can be resolved, the system MUST show this as an
  explicit state rather than omitting the section or fabricating an area.
- **FR-003**: System MUST provide a per-country automatic-cascade-evaluation setting, defaulting to
  disabled ("off") for every country unless a country_admin explicitly enables it.
- **FR-004**: System MUST restrict visibility and control of this setting to country_admin (own country)
  and super_admin (any country) only — org_admin and viewer roles MUST NOT see or be able to change it,
  regardless of any other capability grant they hold.
- **FR-005**: System MUST, when the setting is enabled for a country, automatically run the same
  cascade-evaluation logic used for manual/on-demand evaluation (spec 048) against new real hazard events
  of a type with at least one active rule for that country, with no user action required.
- **FR-006**: System MUST NOT allow the automatic-evaluation path, under any configuration, to create or
  modify a CAP draft, trigger a dispatch job, send an email/WhatsApp message, or otherwise interact with
  the existing alert-authoring/dissemination pipeline — its only effect is a persisted assessment (spec
  048) and a visible in-app unacknowledged indicator.
- **FR-007**: System MUST show a visible, count-based indicator of unacknowledged automatically-created
  assessments to authorized users (country_admin/org_admin/super_admin for that country), and MUST allow
  an authorized user to acknowledge/dismiss individual assessments, reducing the shared count.
- **FR-008**: System MUST NOT introduce any AI/ML/LLM component in either extension — the map integration
  reuses spec 048's existing deterministic evaluation unchanged, and the automatic trigger's own decision
  ("is this enabled, does this event's type have an active rule") is a plain deterministic condition
  check, not a model inference (mirrors spec 048 FR-005).
- **FR-009**: System MUST leave spec 048's existing manual/on-demand evaluation entry points (Admin
  panel's Risk dashboard and Scenario Builder) unchanged in behavior — both extensions are additive new
  entry points to the same underlying capability, not replacements.

### Key Entities *(include if feature involves data)*

- **Country Cascade Settings**: A per-country record of whether automatic cascade evaluation is enabled.
  Changeable only by that country's country_admin (or any super_admin). Not visible to org_admin/viewer.
- **Cascading Risk Assessment (existing, spec 048)**: Reused unchanged; this feature adds an
  acknowledgement state (acknowledged/unacknowledged) so automatically-created assessments can be counted
  and dismissed, without altering their existing traceability fields.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can see cascading risk results for a real event they select on the main map without
  navigating away from the map, in the same number of clicks as the existing affected-population check.
- **SC-002**: 100% of automatically-triggered assessments are visible via the unacknowledged-count
  indicator to every authorized user in that country, and 0% result in any CAP/dispatch/external-channel
  side effect, verified by inspection of the relevant tables after an automatic trigger.
- **SC-003**: Zero org_admin or viewer sessions can view or change the per-country automatic-evaluation
  setting, in any country.
- **SC-004**: A country_admin can enable or disable automatic evaluation for their country in under 30
  seconds from a standing start.

## Assumptions

- This is a direct, additive follow-on to spec 048 (Cascading Hazard Risk); it depends on
  `cascade_rules`/`cascading_risk_assessments`/`evaluate_cascade_rules` existing and working as already
  built, and reuses `CascadingRiskPanel.vue` rather than duplicating its UI.
- "Automatic" triggering means the system reacts to newly-recorded real hazard events for the enabled
  country without a human clicking an "evaluate" action — the exact mechanism (e.g. a database trigger,
  a scheduled sweep) is an implementation decision for the planning phase, not specified here, as long as
  it does not depend on any user having the app open.
- The unacknowledged-count indicator is a simple, poll-refreshed count (matching this project's existing
  admin-facing summary-count patterns) — no new real-time/push infrastructure is in scope.
- Acknowledging an assessment is a lightweight, non-destructive action (marks it seen) — it does not
  delete or alter the assessment's own historical record (spec 048 FR-010's immutability still applies).
- The boundary-resolution capability reused for the map integration (FR-002) is this project's existing
  client-side point-in-polygon lookup over already-loaded administrative boundary data; a location
  outside all loaded boundaries is a legitimate "cannot determine area" outcome, not a defect.
