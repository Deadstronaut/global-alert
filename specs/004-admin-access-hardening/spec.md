# Feature Specification: Administration & Access Hardening

**Feature Branch**: `004-admin-access-hardening`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Complete the Administration & Access RBAC module (docs/security_roles_protocol.md) by closing 5 identified gaps in the existing Super Admin / Country Admin / Org Admin / Viewer hierarchy: (1) router-level authorization guard for /admin, (2) missing profiles RLS policies for country_admin/org_admin, (3) real account suspension distinct from role downgrade, (4) invite/magic-link onboarding instead of admin-chosen passwords, (5) reconciling the orphaned self-registration DB capability against the 'No Public Registration' policy."

## Clarifications

### Session 2026-07-06

- Q: How long should a new-user invitation link remain valid before it expires? → A: 48 hours

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unauthorized roles cannot reach the admin panel (Priority: P1)

A Viewer (field staff account) is logged in and, out of curiosity or by guessing the URL, tries to navigate directly to the admin area. Today the admin screen still loads and fires its data requests before deciding what to show; the system should instead refuse entry before any admin-only screen or request happens.

**Why this priority**: This is the most direct access-control gap — an authenticated but unprivileged user reaching admin surface area at all, even if the visible data ends up restricted by other layers. Closing entry at the door is the highest-leverage, most foundational fix.

**Independent Test**: Log in as a Viewer, attempt to open the admin area directly by URL; confirm the user is redirected away immediately and no admin-only screen or admin-only request is ever issued. Log in as each of Country Admin, Org Admin, and Super Admin and confirm each still reaches the admin area normally.

**Acceptance Scenarios**:

1. **Given** a logged-in Viewer, **When** they navigate to the admin area, **Then** they are redirected to a non-admin page and no admin-only screen ever renders.
2. **Given** a logged-in Country Admin, Org Admin, or Super Admin, **When** they navigate to the admin area, **Then** they reach it normally with the same behavior as before this change.
3. **Given** a logged-out visitor, **When** they navigate to the admin area, **Then** they are sent to the login screen (existing behavior, unchanged).

---

### User Story 2 - Country and Org Admins can actually manage their own users (Priority: P1)

A Country Admin (e.g., a Ministry lead for Turkey) opens the "Users" management screen expecting to see and manage every account within their own country, per the documented role hierarchy. Today the underlying data access rules only let a user see their own single account, so the Country Admin's Users screen is effectively broken — it appears to work but silently shows almost nothing. The same problem applies to Org Admins, scoped further to their own organization.

**Why this priority**: This directly breaks a core, already-documented promise of the role hierarchy (country/org-scoped user management) and is currently silently broken rather than visibly missing — the UI exists and looks functional, which is worse than an obviously absent feature.

**Independent Test**: As a Country Admin, confirm the Users screen lists every account within your own country (not just yourself), and that you can change a role or reassign an organization for one of those accounts, within the limits of your own permission level. As an Org Admin, confirm the same is true but scoped to your own organization, and that you can only manage Viewer-level accounts.

**Acceptance Scenarios**:

1. **Given** a Country Admin for country X, **When** they open the Users screen, **Then** they see every user account whose country is X (and no accounts from other countries).
2. **Given** a Country Admin for country X, **When** they change another country-X user's role or organization assignment (within their permitted range), **Then** the change is saved successfully.
3. **Given** an Org Admin for organization Y in country X, **When** they open the Users screen, **Then** they see only accounts belonging to organization Y, and can only manage Viewer-role accounts among them.
4. **Given** a Country Admin, **When** they attempt to view or modify a user account in a different country, **Then** the action is denied.
5. **Given** the existing rule that no one may promote themselves above their own role, **When** a Country Admin or Org Admin attempts to edit their own role, **Then** the system continues to block that change (no regression).

---

### User Story 3 - Revoking access actually blocks the person from logging in (Priority: P1)

An admin needs to fully cut off a user's access — for example, someone who has left their organization. Today "revoking access" just changes that person's role to the lowest level, but they can still log in and use the system as a Viewer. The admin needs an action that genuinely locks the person out.

**Why this priority**: This is a security gap with real-world consequences — an admin who believes they've removed someone's access has not actually done so. High severity despite being one user story, because the current behavior actively misleads the person performing the action.

**Independent Test**: As an admin with permission, suspend a user account, then attempt to log in as that user — confirm login is refused with a clear reason. Reactivate the account and confirm login succeeds again.

**Acceptance Scenarios**:

1. **Given** an active user account, **When** an authorized admin suspends it, **Then** that user's next login attempt is refused.
2. **Given** a suspended user who was already logged in elsewhere, **When** they try to continue using the system, **Then** their access is cut off within a reasonable time (not indefinitely honored).
3. **Given** a suspended account, **When** an authorized admin reactivates it, **Then** the user can log in normally again.
4. **Given** the existing role-downgrade action, **When** an admin wants to merely change someone's permission level without blocking their access entirely, **Then** that remains a separate, still-available action from suspension.

---

### User Story 4 - New users set their own password via a secure invite (Priority: P2)

When an admin provisions a new account for a person (a new Country Admin, Org Admin, or Viewer), the admin currently must choose and type that person's password directly, which means the admin ends up knowing another person's password and must communicate it out-of-band. Instead, the new user should receive a secure email invitation and set their own password themselves.

**Why this priority**: Important security hygiene and a real onboarding friction point, but lower risk than the access-control gaps in P1 (US1–US3) since it does not currently allow any unauthorized access — it's a process improvement, not an open door.

**Independent Test**: As an authorized admin, provision a new account by email only (no password field). Confirm the new user receives an email invitation and can set their own password through a secure link, then log in successfully with the password they chose.

**Acceptance Scenarios**:

1. **Given** an authorized admin provisioning a new account, **When** they submit the new user's email, role, and scope (country/org) without setting a password, **Then** an invitation is sent to that email address.
2. **Given** a new user who received an invitation, **When** they follow the link and set a password, **Then** they can subsequently log in with that password.
3. **Given** an invitation that has not yet been used, **When** 48 hours pass from the time it was sent, **Then** the invitation expires and can no longer be used to set a password.

---

### User Story 5 - No hidden self-registration path (Priority: P3)

Per the platform's access policy, there is no public sign-up — every account must be created by an authorized admin. Today, however, a database-level capability still exists that would let a self-registered account set its own country code, left over from before the current provisioning model. Nothing in the visible product exposes a way to use this, but it should not remain available.

**Why this priority**: Lowest immediate risk since no UI currently exposes it, but it is a latent inconsistency between stated policy and actual system capability that should be closed as cleanup, not left indefinitely.

**Independent Test**: Confirm that no path exists — UI or otherwise — for a person to create their own account and self-assign a country/role without going through an authorized admin's provisioning action.

**Acceptance Scenarios**:

1. **Given** the platform's "no public registration" policy, **When** the system is reviewed end-to-end, **Then** no self-service path exists for a person to create their own account or set their own country/role.
2. **Given** any legitimate remaining reason for a user to update their own profile (e.g., display name), **When** this feature is complete, **Then** that ability is preserved, scoped only to non-privileged fields.

### Edge Cases

- What happens when a Country Admin tries to suspend a Super Admin or another Country Admin? Must be denied — suspension follows the same "cannot act above or outside your own scope" rule as other admin actions.
- What happens if the person performing a suspension suspends their own account? Should be prevented (an admin should not be able to lock themselves out).
- What happens when an invited user never completes setup? The account remains inactive/unusable until the invite is completed or reissued; it must not grant any access in the meantime.
- What happens when a suspended user still holds an active session in the app at the moment they're suspended? Their access must be cut off within a reasonable time, not honored indefinitely for the life of that session.
- What happens if an admin tries to reassign a user to a role or scope beyond what that admin is permitted to grant (e.g., an Org Admin trying to make someone a Country Admin)? Must be denied, consistent with the existing provisioning hierarchy.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST prevent any authenticated user whose role is not Super Admin, Country Admin, or Org Admin from entering the admin area at all — the redirect decision MUST happen before any admin-only screen renders or any admin-only data request is issued.
- **FR-002**: System MUST allow a Country Admin to view every user account within their own country, and to modify the role and organization assignment of those accounts, within the bounds of the existing provisioning hierarchy (a Country Admin may not grant Super Admin or Country Admin roles, and may not modify accounts outside their own country).
- **FR-003**: System MUST allow an Org Admin to view every user account within their own organization, and to modify only Viewer-role accounts within that organization; an Org Admin MUST NOT be able to view or modify accounts outside their own organization.
- **FR-004**: System MUST continue to prevent any user (Country Admin or Org Admin included) from elevating their own role above its current level, consistent with existing self-escalation protection.
- **FR-005**: System MUST provide an explicit "suspend" action, distinct from any role change, that immediately prevents a suspended account from authenticating.
- **FR-006**: System MUST revoke a suspended user's active access within a reasonable time even if they were already logged in when suspended.
- **FR-007**: System MUST provide an explicit "reactivate" action that restores a suspended account's ability to authenticate, without altering its previously assigned role or scope.
- **FR-008**: System MUST prevent an admin from suspending an account that is equal to or above their own permission level (e.g., a Country Admin may not suspend a Super Admin or another Country Admin), and MUST prevent an admin from suspending their own account.
- **FR-009**: System MUST allow an authorized admin to provision a new account by specifying email, role, and scope (country/org) without directly choosing that user's password.
- **FR-010**: System MUST send the newly provisioned user a secure invitation allowing them to set their own password before their account becomes usable.
- **FR-011**: System MUST expire an unused invitation after a bounded period; the platform's documented recommended default is 48 hours, but since each country/tenant deployment runs its own backend project, the exact value is a per-deployment operational setting configured by whoever operates that project, not a value hardcoded into the application.
- **FR-012**: System MUST NOT expose, via any interface, a way for a person to create an account and self-assign a role or country/organization scope outside of the authorized admin-provisioning flow.
- **FR-013**: System MAY continue to allow an authenticated user to edit non-privileged fields of their own profile (e.g., display name), but MUST NOT allow self-editing of role, country, or organization scope through that same path.
- **FR-014**: System MUST log or otherwise make visible which admin performed a suspend, reactivate, or scope/role change action on another account, consistent with the existing audit posture of the platform.

### Key Entities

- **User Account / Profile**: A person's identity and access scope within the system — includes role (Super Admin / Country Admin / Org Admin / Viewer), country assignment, organization assignment, and now an active/suspended status distinct from role.
- **Invitation**: A pending, time-bounded offer for a specific email address to complete account setup (set a password) at a specific role/country/organization scope, created by an authorized admin.
- **Admin Action Record**: A record of who performed a privileged action (suspend, reactivate, role/scope change) against which account and when, supporting accountability for the access-control changes in this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of admin-area access attempts by non-admin roles (Viewer) are blocked before any admin-only screen or data request occurs, verified across all admin roles and the logged-out case.
- **SC-002**: A Country Admin or Org Admin can locate and successfully modify any in-scope user account's role/organization assignment in under 30 seconds, without engineering help — a functional capability that does not exist today.
- **SC-003**: 100% of suspended accounts are unable to authenticate on their next login attempt, and any already-active session for a suspended account loses access within 5 minutes.
- **SC-004**: New users complete their own password setup via invitation, with zero instances of an admin needing to communicate a password out-of-band, for all newly provisioned accounts after this feature ships.
- **SC-005**: A security review of the system finds zero remaining paths for self-service account creation or self-assigned role/country/organization scope outside admin provisioning.

## Assumptions

- The existing role hierarchy (Super Admin / Country Admin / Org Admin / Viewer) and its provisioning rules, as documented in the platform's security & role protocol, remain unchanged by this feature — this feature closes enforcement gaps, it does not redesign the hierarchy.
- The existing "self-role-escalation is blocked" protection continues to apply unmodified; this feature extends similar protection to the new suspend/reactivate action.
- Suspending an account is reversible (via reactivation) and distinct from deleting an account; account deletion is out of scope for this feature.
- Sending invitation emails and the underlying email delivery capability are available to the platform (the same delivery channel already assumed for other account-related notifications); this feature does not need to select or stand up a new email provider.
- "A reasonable time" for revoking an already-active suspended session is treated as within 5 minutes for this feature, matching typical session-refresh/token-expiry expectations for this class of system.
- Any remaining legitimate self-service profile editing (e.g., display name) is limited to fields that carry no access-control meaning; this feature does not need to enumerate every such field beyond ensuring role/country/org cannot be among them.
- Multi-factor authentication (docs/21_structured_srs.md MHEWS-NFR-0057, marked CRITICAL) is a real, currently-unmet requirement but is explicitly OUT OF SCOPE for this feature — it is a distinct technical area (TOTP/email-OTP enrollment and challenge flow, recovery codes) deserving its own spec-kit cycle, tracked as a follow-up (spec 005), not bundled into this profiles/RLS/router-scoped hardening feature.
- This platform is deployed per-country/per-tenant, each on its own backend project — settings that live at the backend-project level rather than in application code (e.g., invitation-link expiry, outbound email/SMTP configuration) are per-deployment operational decisions made by whoever administers that specific project, not something this codebase or any single administrator can set once on behalf of every current or future deployment. This feature documents a recommended default (48 hours) rather than asserting one universal value.
