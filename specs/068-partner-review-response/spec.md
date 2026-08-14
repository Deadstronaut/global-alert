# Feature Specification: Partner Review Response Bundle

**Feature Branch**: `068-partner-review-response`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "MHEWS review-response feature bundle (safe subset from partner review, items not blocked by pending architecture decisions): map layer legend visibility, per-layer filter/transparency consistency, SOP document file upload, CAP warning radius UI exposure, ADM2-level impact analysis, contact directory clarification, Risk & Scenario Modeling relocation under Impact Analyzer with role gating, and a scoped 2D layer-panel consolidation. Explicitly excludes items blocked on pending partner decisions (2D/3D parity, deployment model, full role taxonomy, data ingestion limits, map control placement, 3D layer consolidation)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Layer legend and controls only appear for active layers (Priority: P1)

A map user (analyst or country admin) opens the 2D Map View and toggles hazard, shelter, wind/current, and exposure layers on and off individually. The legend and per-layer transparency/filter controls should only be visible for layers that are currently active, so the panel doesn't clutter with information about layers the user hasn't turned on.

**Why this priority**: This is the most visible, most-cited complaint in the partner review and affects every map session; it's also the least architecturally risky item to ship.

**Independent Test**: Toggle a single layer (e.g., Floods) on with all others off; verify only that layer's legend and transparency/filter controls are visible. Toggle it off; verify its controls disappear.

**Acceptance Scenarios**:

1. **Given** all layers are inactive, **When** the user opens the layer panel, **Then** no per-layer legend or transparency control is shown.
2. **Given** a layer is toggled active, **When** the panel re-renders, **Then** that layer's legend and a transparency/opacity slider and any applicable filter controls become visible.
3. **Given** two layers are active simultaneously, **When** the user deactivates one, **Then** only that layer's controls disappear; the other layer's controls remain visible and unaffected.

---

### User Story 2 - Consolidated, collapsible 2D layer panel (Priority: P1)

A map user viewing the 2D Map View sees Disaster Filters, Shelters, Wind & Current, and Exposure (Domain Layers) grouped together in one left-side panel instead of scattered across separate floating panels. Groups are collapsed by default (accordion-style) so the panel doesn't consume the whole screen, and the user expands only the group(s) they need.

**Why this priority**: Directly addresses the partner's top structural complaint about layer organization; scoped to 2D only and collapsed-by-default to avoid rework once 2D/3D parity and default-expanded-state are decided separately.

**Independent Test**: Open the 2D Map View; verify all four layer groups appear as sections of one panel, each collapsed by default; expand one group and verify the others remain collapsed and the map remains mostly visible.

**Acceptance Scenarios**:

1. **Given** the 2D Map View is loaded, **When** the layer panel renders, **Then** Disaster Filters, Shelters, Wind & Current, and Exposure appear as sections within a single panel, each collapsed by default.
2. **Given** the panel is in its default state, **When** the user expands one group, **Then** the other groups remain collapsed and at least 60% of the viewport remains visible as map area.
3. **Given** a group is expanded, **When** the user collapses it again, **Then** its controls hide and previously-set layer toggle states (on/off) are preserved.
4. **Given** the 3D/Globe View is loaded, **When** the user inspects the layer panel, **Then** it continues to behave as it does today (no change in this release — 3D consolidation is out of scope).

---

### User Story 3 - Upload a document to the SOP library (Priority: P2)

An SOP editor (data manager or authorized admin) uploads an existing procedure document (e.g., a national mitigation response guide, PDF or Word file) directly into the SOP module, instead of retyping its contents. The existing AI-assisted summary workflow then runs against the uploaded document to propose a summary/procedure text, which the editor reviews and approves before publishing, exactly as it does today for typed entries.

**Why this priority**: Explicitly requested by the partner and unblocks real-world SOP onboarding, but depends on User Story 1/2 shipping first only in the sense of general sequencing, not technical coupling — can proceed independently.

**Independent Test**: Upload a sample PDF to a new SOP entry; verify the file is stored and retrievable, and that the AI-summary workflow can be triggered against the uploaded document producing a draft summary for review.

**Acceptance Scenarios**:

1. **Given** an SOP editor is creating a new SOP document, **When** they choose to upload a file instead of typing body content, **Then** the system accepts a document file (PDF or Word) up to a defined size limit and stores it associated with that SOP entry.
2. **Given** a file has been uploaded, **When** the editor requests an AI summary, **Then** the system produces a draft summary/procedure text derived from the uploaded document for the editor to review, edit, approve, or reject — matching the existing approve/reject flow for typed SOP content.
3. **Given** an unsupported file type or an oversized file is selected, **When** the user attempts to upload it, **Then** the system rejects the upload with a clear, specific error message before any data is persisted.

---

### User Story 4 - Set a warning radius when authoring a CAP alert (Priority: P2)

An alert maker drafting a CAP warning specifies a warning radius (in kilometers) as part of the alert, in addition to existing fields. The radius is saved with the draft and is visible to reviewers before publish, and to recipients/map viewers after publish.

**Why this priority**: A pure UI-exposure fix for an already-existing database field; low risk, directly requested by the partner, but secondary in visible impact to the layer-panel work.

**Independent Test**: Create a new CAP draft, enter a radius value, save, and verify the value persists and displays correctly when reopening the draft and when previewing/publishing the alert.

**Acceptance Scenarios**:

1. **Given** an alert maker is authoring a new CAP warning, **When** they view the authoring form, **Then** a "Warning Radius (km)" field is present and editable.
2. **Given** a radius value has been entered and the draft saved, **When** the draft is reopened, **Then** the previously entered radius value is displayed.
3. **Given** a CAP warning with a radius has been published, **When** a reviewer or map viewer inspects the alert, **Then** the radius value is visible alongside the other alert details.
4. **Given** no radius is entered, **When** the alert maker saves or publishes, **Then** the system allows it (radius remains optional) and does not block the workflow.

---

### User Story 5 - Run impact analysis at the district (ADM2) level (Priority: P2)

An analyst running an impact analysis selects a district-level administrative boundary (in addition to the existing country/province-level options) to scope the exposure/impact summary to that specific district.

**Why this priority**: Extends an existing, valued feature (impact analysis) using data already present in the system; moderate effort since it reuses the existing province-level pattern.

**Independent Test**: Open Impact Analyzer, switch the administrative-level selector from province to district, pick a district, and verify the resulting exposure/impact summary is scoped to that district's boundary rather than the whole province or country.

**Acceptance Scenarios**:

1. **Given** the analyst is in Impact Analyzer, **When** they open the administrative-level selector, **Then** both province-level and district-level options are available.
2. **Given** the analyst selects a specific district, **When** the impact analysis runs, **Then** the resulting summary (affected population, exposed assets, etc.) is scoped to that district's boundary only.
3. **Given** a country whose district-level boundary data is not available, **When** the analyst opens the administrative-level selector for that country, **Then** the district option is disabled or omitted with a clear indication that district-level data isn't available, rather than silently returning incorrect results.

---

### User Story 6 - Understand what the Contact Directory is for (Priority: P3)

Any user with access to the Contact Directory screen (admin, reviewer) can tell at a glance, from the screen's label and description, that it manages the recipient list used for alert dissemination — not a general-purpose public contact book — reducing the ambiguity the partner raised.

**Why this priority**: Lowest-effort item in this bundle; a labeling/copy clarification, not a functional change.

**Independent Test**: Open the Contact Directory screen and confirm its title, description, and any related menu label clearly identify it as the alert-dissemination recipient list.

**Acceptance Scenarios**:

1. **Given** a user navigates to the Contact Directory from the admin menu, **When** the screen loads, **Then** the page title and/or a short description text identify it as the list of recipients used for alert dissemination (email/SMS/WhatsApp).
2. **Given** the same user checks the admin navigation menu, **When** they read the menu entry label, **Then** it is unambiguous that this screen relates to alert recipients, not a general public contact directory.

---

### User Story 7 - Relocate Scenario Modeling as an advanced mode of Impact Analyzer (Priority: P3)

Any user who currently has access to Risk & Scenario Modeling finds it as an "Advanced" mode inside Impact Analyzer, rather than as a separate top-level menu item. This story covers navigation/structure only. Today's access level (whoever can reach it today) is preserved as-is — no new role-based restriction is introduced yet.

**Why this priority**: Structural/navigation change only; lowest urgency in this bundle. The role-based access restriction originally bundled with this item is intentionally deferred (see User Story 7b) because building it against the current 4-role system risks having to redo the RLS policy once the partner's role-taxonomy decision (how many roles, how they map to contacts/positions like "minister" vs. "local firefighter") comes back — better to move the feature now and gate it once, correctly, later.

**Independent Test**: Open Impact Analyzer and confirm the Scenario Modeling mode is reachable from within it (not a separate top-level menu), with no change in who can currently reach it.

**Acceptance Scenarios**:

1. **Given** a user who currently has access to Scenario Modeling, **When** they look for it, **Then** it is available as an "Advanced" mode within Impact Analyzer, not a separate top-level menu entry.
2. **Given** the relocation is deployed, **When** any previously-authorized user opens the advanced mode, **Then** they can use scenario modeling exactly as before (no loss of functionality, no change in who can access it).
3. **Given** the relocation is deployed, **When** compared to pre-change access rules, **Then** no user gains and no user loses access as a side effect of the move alone.

---

### User Story 7b - Restrict Scenario Modeling to authorized roles once the role model is confirmed (Priority: Deferred — not part of this release)

Once the partner confirms the target role taxonomy (see the open "user role model" decision), Scenario Modeling's advanced mode is restricted to the roles designated as authorized (e.g., analyst and above), enforced at the data-access layer via RLS, while super admin retains full access including for local/testing use.

**Why deferred**: Building RLS now against the current 4-role system (super_admin/country_admin/org_admin/viewer) risks a costly rewrite if the partner's eventual role model doesn't map cleanly onto it — this has already happened once in this engagement (hierarchy → then "let local operators in too"). We build the technical relocation now (User Story 7) and land the access restriction as a fast follow-up once the role decision is final, so it's built once, correctly.

**Independent Test**: Not applicable to this release — tracked as follow-up work once the role-model decision (see spec's Assumptions / partner-facing decision list) is confirmed.

**Acceptance Scenarios** (for the follow-up spec, not this one):

1. **Given** the confirmed role model, **When** a non-authorized role opens Impact Analyzer, **Then** the advanced mode is hidden or disabled, and direct access to its data/actions is denied at the data layer.
2. **Given** a super admin, **When** they access the system, **Then** their access to Scenario Modeling is unaffected regardless of the confirmed role model.

---

### Edge Cases

- What happens when a user has an SOP document upload in progress and navigates away or loses connectivity mid-upload? The system should not leave a partially-uploaded, unusable SOP entry behind.
- How does the layer panel behave when a user has zero layers available for their country/role (e.g., a very limited dataset)? Groups with no available layers should indicate they're empty rather than appearing broken.
- What happens if a CAP warning radius is set to zero or a negative/unrealistic value? The system should validate and reject clearly invalid values.
- What happens when an analyst requests district-level (ADM2) impact analysis for a country where only country-level boundaries exist (no province or district data at all)? The system should clearly communicate the lowest available level rather than failing silently.
- How does the system handle a role-authorization change (e.g., a user promoted from country_admin to analyst) — does their access to Scenario Modeling update immediately or require re-login? Immediate effect on next request is expected, consistent with how other role-gated features behave today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The 2D Map View MUST display a layer's legend and per-layer transparency/filter controls only when that layer is toggled active; these controls MUST be hidden when the layer is inactive.
- **FR-002**: The 2D Map View MUST present Disaster Filters, Shelters, Wind & Current, and Exposure (Domain Layers) as sections of a single, unified left-panel layer control.
- **FR-003**: Each section of the unified 2D layer panel MUST default to a collapsed state on initial load; the user MUST be able to expand/collapse each section independently.
- **FR-004**: Collapsing a layer group's section MUST NOT change the on/off state of the layers within it — only the visibility of its controls.
- **FR-005**: This release MUST NOT change the 3D/Globe View's existing layer panel behavior.
- **FR-006**: The SOP Document module MUST allow an authorized user to upload a document file (at minimum PDF and Word formats) as an alternative to typing body content.
- **FR-007**: The system MUST enforce a maximum file size for SOP document uploads and reject uploads exceeding it with a clear error message, without persisting partial data.
- **FR-008**: The system MUST reject SOP document uploads of unsupported file types with a clear error message.
- **FR-009**: The existing AI-assisted summary workflow MUST be able to run against an uploaded SOP document, producing a draft summary that follows the same review/approve/reject flow already used for typed SOP content.
- **FR-010**: The CAP warning authoring form MUST include an optional "Warning Radius (km)" field that persists with the draft and is visible on published alerts.
- **FR-011**: The system MUST validate that an entered warning radius is a positive number and reject clearly invalid values (zero, negative, or non-numeric).
- **FR-012**: Impact Analyzer MUST allow the analyst to select a district-level (ADM2) administrative boundary, in addition to the existing province-level (ADM1) option, when district boundary data is available for the selected country.
- **FR-013**: Impact Analyzer MUST scope its exposure/impact summary results to the selected administrative boundary (country, province, or district) accordingly.
- **FR-014**: When district-level boundary data is unavailable for a given country, Impact Analyzer MUST clearly indicate this rather than silently falling back to a different level or returning incorrect results.
- **FR-015**: The Contact Directory screen and its navigation entry MUST clearly identify its purpose as the alert-dissemination recipient list.
- **FR-016**: Risk & Scenario Modeling MUST be accessible as an advanced mode within Impact Analyzer rather than as a separate top-level menu item.
- **FR-016a**: The relocation in FR-016 MUST preserve today's existing access level exactly (whoever can reach Scenario Modeling today continues to be able to reach it at the same access level after the move) — no new role-based restriction is introduced by this spec.

> **Deferred (not part of this spec — tracked as follow-up once the partner's role-model decision is confirmed):**
> - Restricting the Scenario Modeling advanced mode to specific authorized roles (e.g., analyst and above), enforced at the data-access layer via RLS.
> - Ensuring super admin retains full access under the new restriction.
> - Hiding/disabling the advanced mode in the UI for unauthorized roles.
>
> Building this now against the current 4-role system risks a redo once the partner's target role taxonomy is confirmed (see the open "user role model" decision in the partner-review response). See User Story 7b.

### Key Entities

- **SOP Document**: An existing entity extended with an optional uploaded-file reference (in addition to its existing typed body content), plus the file's type and size for validation purposes.
- **CAP Draft / CAP Warning**: An existing entity whose already-present radius attribute becomes user-visible and user-editable through the authoring UI, and is carried through to the published alert.
- **Administrative Boundary**: An existing hierarchy (country → province → district) that Impact Analyzer will query one level deeper (district) than it does today.
- **Contact Directory Entry**: Unchanged in structure; only the surrounding screen/menu labeling changes.
- **User Role**: Existing roles (super_admin, country_admin, org_admin, viewer, plus the analyst designation used for CAP/impact workflows) gain a new authorization check for the relocated Scenario Modeling mode.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the 2D Map View, a user can identify and toggle any of the four layer groups (Disaster Filters, Shelters, Wind & Current, Exposure) from one panel location, without navigating to a separate floating panel, in under 10 seconds.
- **SC-002**: With the default collapsed layer panel, at least 60% of the viewport remains visible as map area on a standard 1366x768 or larger screen.
- **SC-003**: An SOP editor can create a fully published SOP entry from an uploaded document (upload through AI-summary approval) in under 5 minutes, without needing to manually retype the source document's content.
- **SC-004**: 100% of newly created CAP warnings that specify a radius display that radius correctly on both the authoring review screen and the published alert view.
- **SC-005**: An analyst can complete a district-level impact analysis (from selecting the district to viewing the exposure summary) in under 1 minute for a country with available district boundary data.
- **SC-006**: After relocation, 100% of users who had access to Scenario Modeling before the change retain identical access after the change, verified by comparing access before/after the move. (Role-based restriction and its own access-control testing are deferred to the User Story 7b follow-up.)
- **SC-007**: Following the Contact Directory relabeling, new admins can correctly describe the directory's purpose (alert-dissemination recipients) without additional explanation, verified via a brief usability check with at least 3 test users.

## Assumptions

- "Authorized users" for SOP upload are the same roles that can currently create/edit SOP documents today; no new role is introduced by this feature.
- Supported SOP upload formats are limited to PDF and Word (.docx) for this release; other formats (e.g., scanned images, spreadsheets) are out of scope and can be added later if requested.
- A reasonable default maximum SOP upload file size (e.g., in the tens of megabytes) will be applied; this is an implementation-time default, not dictated by the partner, and is independent of the separate, still-open "external data ingestion limits" discussion for large geospatial datasets.
- Role-based restriction of Scenario Modeling is intentionally out of scope for this spec and deferred to a follow-up once the partner confirms the target role taxonomy (how many roles, and how positions like "minister" vs. "local first-responder" map onto them). This spec only relocates the feature's navigation/UI placement, preserving current access levels unchanged.
- District-level (ADM2) boundary data already exists in the system for at least some countries (per prior codebase verification); for countries lacking it, Impact Analyzer degrades gracefully rather than being blocked entirely.
- The 3D/Globe View is explicitly unchanged by this feature; any future 3D layer-panel consolidation will be scoped as a separate feature once 2D/3D parity priorities are decided with the partner.
- "Collapsed by default" means all four layer group sections start collapsed each time the panel is freshly loaded; this spec does not require persisting expand/collapse state across sessions unless trivial to include.
