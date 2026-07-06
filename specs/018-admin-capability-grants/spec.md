# Feature Specification: Admin Panel Capability Grants

**Feature Branch**: `018-admin-capability-grants`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Super_admin'e özel 4 admin panel alanı (Hazard Taxonomy, SOP Repository, Map Layers, Audit) için ek/opsiyonel yetki verme mekanizması ekleme — Administration & Access modülünün MHEWS-FR-0136 ('Custom user groups with configurable permissions') gereksinimini, mevcut 4 sabit rolü ve 50+ RLS kuralını hiç değiştirmeden karşılayan dar kapsamlı bir çözüm."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Super Admin grants a single admin capability to a Country/Org Admin (Priority: P1)

A Super Admin manages a Country Admin who should be able to maintain the Hazard Taxonomy registry (add hazard types, edit severity thresholds) without being promoted to full Super Admin. The Super Admin opens that user's row in the user list and turns on the "Hazard Taxonomy" capability for them, without touching their base role.

**Why this priority**: This is the core value of the feature — delegating one specific admin responsibility without an all-or-nothing role change. Without this, the only options today are "promote to Super Admin" (over-grants everything) or "no access" (under-grants).

**Independent Test**: As Super Admin, grant the "Hazard Taxonomy" capability to an existing Country Admin user; log in as that user and confirm the Hazard Taxonomy tab is now visible and usable, while the other three capability-gated tabs (SOP Repository, Map Layers, Audit) remain hidden.

**Acceptance Scenarios**:

1. **Given** a Country Admin with no granted capabilities, **When** the Super Admin enables "Hazard Taxonomy" for that user, **Then** that user's next session shows the Hazard Taxonomy tab and they can create/edit hazard types and thresholds exactly as a Super Admin could.
2. **Given** a Country Admin with the "Hazard Taxonomy" capability granted, **When** that user views the admin panel, **Then** the SOP Repository, Map Layers, and Audit tabs remain hidden (no capability granted for those).
3. **Given** an Org Admin, **When** the Super Admin enables "Audit" for that user, **Then** that user can view and export the audit log exactly as a Super Admin could, scoped the same way Super Admin's audit view already is (no new data-scoping behavior introduced by this feature).

---

### User Story 2 - Super Admin revokes a previously granted capability (Priority: P1)

A Super Admin previously granted "Map Layers" to an Org Admin who has since changed responsibilities. The Super Admin turns the capability off for that user.

**Why this priority**: Granting without revoking is not a complete access-control feature — the ability to correct a delegation is equally essential from day one, and is low additional effort given User Story 1's data model.

**Independent Test**: As Super Admin, disable a previously granted capability for a user; confirm that user's next session no longer shows the corresponding tab or allows the corresponding writes.

**Acceptance Scenarios**:

1. **Given** an Org Admin with "Map Layers" granted, **When** the Super Admin turns that capability off, **Then** the user's next session hides the Map Layers tab and any direct write attempt to map layer data is rejected.
2. **Given** a user with multiple capabilities granted, **When** the Super Admin revokes one of them, **Then** the remaining granted capabilities are unaffected.

---

### User Story 3 - Super Admin sees which capabilities each user currently holds (Priority: P2)

While managing the user list, the Super Admin needs to see, at a glance, which of the four capabilities are currently granted to each Country/Org Admin, so grants can be reviewed and audited without opening a separate screen per user.

**Why this priority**: Supports the grant/revoke workflow (P1 stories) with visibility, but the feature is still usable without a polished at-a-glance view (Super Admin could otherwise check one user at a time) — hence P2, not P1.

**Independent Test**: As Super Admin, view the user list and confirm each Country/Org Admin row displays the current on/off state of all four capabilities without needing to open an edit dialog first.

**Acceptance Scenarios**:

1. **Given** a Country Admin with "Hazard Taxonomy" and "Audit" granted and the other two not granted, **When** the Super Admin views the user list, **Then** that user's row visibly shows exactly those two capabilities as active and the other two as inactive.

---

### Edge Cases

- What happens when a Super Admin grants a capability to a Viewer? System rejects it — only Country Admin and Org Admin accounts are eligible targets (Viewer accounts have no admin-panel access at all, granting a capability to one would be meaningless and is explicitly out of scope).
- What happens if the target user's account is later suspended? Existing suspension behavior already blocks all admin access session-wide; capability grants remain stored but have no effect while suspended (no special handling needed — same choke point as every other permission in the system).
- What happens if a Country Admin with a granted capability is later demoted or their role changes? Grants are keyed to the user, not the role — if desired, the Super Admin removes the grant separately; the system does not need to auto-revoke on role change for this feature (documented as an assumption, not automatic cleanup).
- What happens when a non-Super-Admin user attempts to grant or revoke a capability directly (e.g. by tampering with a request)? Must be rejected at the data layer, not just hidden in the UI — this must hold even if the user knows another user's ID.
- What happens when a user with a granted capability tries to access the underlying feature through a means other than the admin panel tab (e.g. a direct request)? Access must be allowed or denied consistently with the tab visibility — a capability grant must be a real access grant, not merely a UI toggle.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a Super Admin to grant any of four named capabilities — Hazard Taxonomy, SOP Repository, Map Layers, Audit — to any individual Country Admin or Org Admin user.
- **FR-002**: System MUST allow a Super Admin to revoke a previously granted capability from a user at any time.
- **FR-003**: System MUST NOT allow granting or revoking capabilities for Viewer accounts.
- **FR-004**: System MUST NOT allow any user other than a Super Admin to grant or revoke capabilities, including attempts that bypass the admin panel UI.
- **FR-005**: System MUST display, for each Country Admin/Org Admin user in the user management list, which of the four capabilities are currently granted.
- **FR-006**: A user granted a capability MUST gain the same level of access to that specific admin area (view and manage) that a Super Admin already has for that same area — no partial/read-only variant is introduced by this feature.
- **FR-007**: A user granted a capability MUST NOT gain any access to the other three admin areas, or to any other Super-Admin-only ability, as a side effect of the grant.
- **FR-008**: System MUST enforce granted capabilities at the same layer that already enforces the existing Super-Admin-only restriction on these four areas, so that a capability grant is a genuine access grant and not only a visual/UI change.
- **FR-009**: System MUST NOT alter the existing behavior, access, or data visibility of the four base roles (Super Admin, Country Admin, Org Admin, Viewer) for any area not covered by these four capabilities.
- **FR-010**: System MUST preserve all existing access-control behavior for the four covered areas (Hazard Taxonomy, SOP Repository, Map Layers, Audit) exactly as it is today for users who have no capability grants — a user with zero grants must experience identical behavior before and after this feature ships.
- **FR-011**: System MUST record, for each capability grant, who granted it and when, so that grants themselves are auditable.

### Key Entities

- **Capability Grant**: Represents one admin-panel capability (Hazard Taxonomy, SOP Repository, Map Layers, or Audit) given to one specific user. Attributes: which user it applies to, which of the four capabilities, who granted it, when it was granted. A user may hold zero, some, or all four grants independently of one another.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Super Admin can delegate a single admin capability to another user in under 30 seconds from the user management screen, without leaving that screen.
- **SC-002**: 100% of users with zero capability grants experience the admin panel identically to how it behaved before this feature shipped (zero regression).
- **SC-003**: A capability grant takes effect for the recipient without requiring any manual account changes beyond the grant itself (e.g., no role change, no re-invitation).
- **SC-004**: Revoking a capability removes the corresponding access completely — verified by confirming the previously-granted admin area is both hidden from and inaccessible to the user afterward.
- **SC-005**: Every one of the four capabilities can be granted and revoked completely independently of the other three, for the same user, with no observed interference between them.

## Assumptions

- Only Country Admin and Org Admin accounts are eligible recipients of capability grants; Super Admin already has full access and Viewer is intentionally excluded (no admin-panel access at all).
- The four capabilities map exactly to the four existing Super-Admin-only admin panel areas (Hazard Taxonomy, SOP Repository, Map Layers, Audit); no additional or different capability names are introduced.
- Capability grants do not automatically expire or get revoked when a user's base role changes; management of that overlap is a manual Super Admin action, not automatic system behavior.
- A capability grant gives the same scope of access to that admin area as Super Admin currently has for it (e.g., the Audit capability sees the same audit log scope Super Admin sees today) — this feature does not introduce any new partial/scoped view of these four areas.
- This feature does not change anything about the four existing base roles themselves, the ~50+ existing role-based access rules already in the system, or any Edge Function's role-hierarchy logic (contacts, dispatch retry, user creation/suspension) — it only adds a new, additive layer for these four specific admin areas.
