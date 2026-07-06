# Feature Specification: Shelter Management

**Feature Branch**: `021-shelter-management`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Dissemination modülünün kalan kalemlerinden biri: Shelter Management (sığınak/barınak yönetimi) — SRS'de MHEWS-FR-0208 (harita entegre sığınak arayüzü, kapasite ve durumla), MHEWS-FR-0243 (kapasite/durum gösteren yönetim paneli), MHEWS-FR-0343 (gerçek zamanlı doluluk dashboard'u: mevcut/toplam kapasite) olarak tanımlı. Scope: new shelters entity with country/org-scoped CRUD (mirroring spec 009's contacts pattern), capacity/occupancy/status fields, optional link to an incident, admin panel tab, and an occupancy-percentage pure function. Map visualization (MHEWS-FR-0208's map integration) and Public Alert Portal exposure are explicitly deferred to later iterations."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin registers and maintains a shelter's capacity and status (Priority: P1)

A Country Admin (or Org Admin) needs a system of record for the shelters in their country — where
they are, how many people they can hold, how many are currently there, and whether the shelter is
open, closed, or full — so that responders and the public early-warning system have accurate,
up-to-date shelter information during a disaster.

**Why this priority**: This is the foundational capability — without a place to register shelters
and their capacity/status, no other shelter-related feature (dashboards, map pins, public
visibility) has any data to work with.

**Independent Test**: As a Country Admin, create a shelter with a name, location, and total
capacity; update its current occupancy and status; confirm the values persist and are reflected
immediately in the admin panel.

**Acceptance Scenarios**:

1. **Given** a Country Admin is signed in, **When** they create a new shelter for their own
   country with a name, location, total capacity, and status, **Then** the shelter appears in
   their shelter list with those values.
2. **Given** an existing shelter, **When** its current occupancy or status is updated, **Then**
   the updated values are immediately visible in the admin panel.
3. **Given** a shelter is no longer in service, **When** an admin deactivates it, **Then** it no
   longer appears in the active shelter list but its historical record is preserved (consistent
   with this project's existing soft-delete convention for similar entities).

---

### User Story 2 - Anyone can see current shelter capacity and status (Priority: P2)

A responder, viewer, or any signed-in user needs to see which shelters are open and how much
capacity remains, without needing administrative permissions — this information directly
supports life-safety decisions during an active hazard event.

**Why this priority**: Builds directly on User Story 1's data; the feature only delivers its core
value (informing people where they can go) once that data is actually visible to the people who
need to act on it, not just to the admin who entered it.

**Independent Test**: As a signed-in Viewer (non-admin) account, confirm all active shelters and
their current capacity/status are visible, and confirm no create/edit/remove controls are
available to that account.

**Acceptance Scenarios**:

1. **Given** a Viewer account is signed in, **When** they open the shelter information view,
   **Then** they see all active shelters with their location, total capacity, current occupancy,
   and status, across every country (not just their own).
2. **Given** a Viewer account is signed in, **When** they attempt to create, edit, or remove a
   shelter, **Then** the action is unavailable/rejected, since Viewers have read-only access.

---

### User Story 3 - Admin links a shelter to an active incident (Priority: P3)

During a specific disaster response, a Country Admin wants to mark which shelters are being
actively used for a particular incident, so responders and coordinators can see the connection
between an ongoing event and the shelters supporting it.

**Why this priority**: A valuable coordination aid once shelters exist and are visible (User
Stories 1–2), but the feature remains fully useful without it — plenty of shelters are proactively
registered without ever needing an incident link, hence lowest priority.

**Independent Test**: As a Country Admin, link an existing shelter to an open incident; confirm
the link is visible from the shelter's record; close or reassign the incident and confirm the
shelter record is unaffected (the link is informational, not a lifecycle dependency).

**Acceptance Scenarios**:

1. **Given** an open incident and an existing shelter in the same country, **When** an admin links
   the shelter to that incident, **Then** the shelter's record shows which incident it is
   currently associated with.
2. **Given** a shelter linked to an incident, **When** that incident is later closed, archived, or
   deleted, **Then** the shelter's own record is unaffected (the link is simply cleared, not the
   shelter itself).

---

### Edge Cases

- What happens when someone tries to set a shelter's current occupancy higher than its total
  capacity? The system MUST reject this — occupancy can never exceed total capacity.
- What happens when a Country Admin from one country tries to create or edit a shelter for a
  different country? The action MUST be rejected, even if attempted through a means other than
  the visible admin interface (consistent with this project's existing country-scoping pattern).
- What happens when a shelter has no organization assigned? This MUST be allowed — organization
  assignment is optional, matching the existing Contacts entity's own optional `org_id`.
- What happens when an incident linked to a shelter is deleted? The shelter's link MUST clear
  automatically rather than blocking the incident's deletion or leaving a dangling reference.
- What happens when total capacity is set to zero or a negative number? The system MUST reject
  non-positive total capacity values, since a shelter with zero or negative capacity is not
  meaningful.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authorized administrator to register a new shelter with a
  name, location (coordinates), country, total capacity, current occupancy, and status
  (open/closed/full).
- **FR-002**: System MUST reject a shelter record where current occupancy exceeds total capacity,
  at the time of creation or any later update.
- **FR-003**: System MUST reject a shelter record where total capacity is zero or negative.
- **FR-004**: An administrator MUST be able to update an existing shelter's occupancy, status, and
  other details.
- **FR-005**: An administrator MUST be able to deactivate a shelter (soft-delete), after which it
  no longer appears in the active shelter list but its historical record is retained.
- **FR-006**: A Country Admin or Org Admin MUST be able to create, edit, and deactivate shelters
  only for their own country; Super Admin MUST be able to do so for any country.
- **FR-007**: System MUST reject an attempt to create, edit, or deactivate a shelter for a country
  other than the acting administrator's own (unless that administrator is Super Admin), even if
  attempted through a means other than the visible admin interface.
- **FR-008**: Any signed-in user, regardless of role, MUST be able to view all active shelters
  (location, total capacity, current occupancy, status) across every country — shelter
  availability is life-safety information, not administratively restricted data.
- **FR-009**: System MUST allow an administrator to optionally associate a shelter with a specific
  incident, and to change or clear that association at any time.
- **FR-010**: When an incident associated with a shelter is deleted, the shelter's association
  MUST be cleared automatically; the shelter record itself MUST remain unaffected.
- **FR-011**: System MUST provide a way to see, for each active shelter, what percentage of its
  total capacity is currently occupied.

### Key Entities

- **Shelter**: Represents a physical location where people can seek refuge during a hazard event.
  Attributes: name, country, optional organization, location (coordinates), total capacity,
  current occupancy, status (open/closed/full), active/inactive flag, optional link to an
  incident it is currently supporting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can register a new shelter with all required details in under 2
  minutes.
- **SC-002**: 100% of attempts to record occupancy above total capacity, or non-positive total
  capacity, are rejected.
- **SC-003**: Any signed-in user can view current shelter capacity and status for every country
  without needing elevated permissions.
- **SC-004**: Zero instances of a shelter being created, edited, or deactivated for a country other
  than the acting administrator's own, unless that administrator is Super Admin.
- **SC-005**: Deleting an incident never blocks on, or destroys, a shelter record linked to it.

## Assumptions

- This feature covers the data model and administrative management of shelters (registration,
  capacity/occupancy/status tracking, optional incident linkage) and making that information
  visible to all signed-in users. Map-based visualization of shelters (showing shelter pins on the
  hazard map, part of the SRS's map-integrated requirement) is a separate, larger follow-up,
  mirroring this project's established pattern of separating data-model/admin-UI work from
  map/visualization integration work (e.g. spec 010 → spec 016 for the hazard taxonomy registry).
- Exposing shelter information on the unauthenticated Public Alert Portal is explicitly out of
  scope for this iteration and is not planned as an internal follow-up either — the customer
  receiving this system is expected to add that exposure themselves later if/when they decide how
  much shelter detail is appropriate to show without authentication.
- Only signed-in users (any role) can view shelter information; fully anonymous/public access is
  covered by the separate Public Alert Portal follow-up noted above, not by this feature.
- A shelter's optional incident link is purely informational/coordinational — it does not gate or
  drive the shelter's own lifecycle (a shelter can exist, open, and close entirely independently
  of any incident).
- Real-time occupancy updates in this iteration means "reflects the latest value an administrator
  has saved," not automated sensor/IoT capacity tracking, which is out of scope.
