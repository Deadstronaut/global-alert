# Feature Specification: Multi-Factor Authentication (MFA) for Login

**Feature Branch**: `005-mfa-login`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Add multi-factor authentication (MFA) to the existing login flow, closing the CRITICAL requirement docs/21_structured_srs.md MHEWS-NFR-0057 ('Multi-factor authentication | All accounts | CRITICAL') that was explicitly deferred out of spec 004. Add a second authentication factor (authenticator-app TOTP) with: (1) a user-facing enrollment flow, (2) a challenge step inserted into login after correct password verification, (3) recovery codes for lost-device recovery, (4) MFA must be available to every role, but whether it is required vs. optional per role is a per-deployment policy decision (this platform deploys per-country/per-tenant, each on its own backend). SMS-based MFA is out of scope."

## Clarifications

### Session 2026-07-06

- Q: Spec 004 just restricted `/admin` to super_admin/country_admin/org_admin, but US1 says any
  role (including Viewer) can enroll MFA — where should enrollment live so Viewers can reach it? →
  A: A separate, self-service "Account Security" page open to every authenticated role regardless
  of `/admin` access — not placed inside the Admin area.
- Q: Should MFA be mandatory by default for any role? → A: No — default posture is optional for
  every role out of the box. Many admin-provisioned accounts (e.g., a ministry contact invited via
  email) may not reliably check that inbox, so forcing a second factor by default would create
  onboarding friction disproportionate to the risk. A deployment operator can still turn on a
  mandatory policy for specific roles (FR-008/FR-009) if their own risk posture calls for it, but
  that is an opt-in per-deployment choice, not this feature's shipped default.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A user enrolls an authenticator app as a second factor (Priority: P1)

Any logged-in user (regardless of role) wants to add a second layer of protection to their
account by linking an authenticator app (like Google Authenticator or Authy) to it, so that a
password alone is no longer enough to sign in as them.

**Why this priority**: Without an enrollment path, nothing else in this feature can exist —
there is no second factor to challenge for. This is the foundation the rest of the feature builds
on.

**Independent Test**: Log in as any role, open the account-security area, start enrollment,
scan the presented code with an authenticator app, confirm the resulting one-time code, and see
the factor listed as active.

**Acceptance Scenarios**:

1. **Given** a logged-in user with no second factor enrolled, **When** they start enrollment,
   **Then** they are shown a setup code/QR image compatible with standard authenticator apps.
2. **Given** a user mid-enrollment, **When** they enter a valid current code from their
   authenticator app, **Then** the factor becomes active and is shown in their account security
   settings.
3. **Given** a user mid-enrollment, **When** they enter an invalid or expired code, **Then**
   enrollment is not completed and they are told the code was incorrect, with a chance to retry.
4. **Given** a user with an already-active factor, **When** they view their account security
   settings, **Then** they can choose to remove it (ending MFA protection on their account,
   subject to any per-deployment policy that may require it — see User Story 4).

---

### User Story 2 - Login requires the second factor once enrolled (Priority: P1)

A user who has enrolled a second factor logs in with their email and password as before, but the
system does not consider them fully signed in until they also provide a valid current code from
their authenticator app.

**Why this priority**: This is the actual security payoff of the feature — enrollment without
enforcement at login provides no protection at all. Equal priority to enrollment because neither
is useful without the other.

**Independent Test**: As a user with an enrolled factor, log in with the correct password;
confirm the system then asks for the authenticator code before granting access; confirm access is
denied with a wrong or missing code, and granted with a correct one.

**Acceptance Scenarios**:

1. **Given** a user with an enrolled second factor, **When** they enter the correct email and
   password, **Then** they are prompted for their current authenticator code before reaching any
   protected area of the system.
2. **Given** a user at the second-factor prompt, **When** they enter a valid current code,
   **Then** they are signed in normally with their existing role and permissions, unchanged from
   today.
3. **Given** a user at the second-factor prompt, **When** they enter an invalid or expired code,
   **Then** they are denied access and told the code was incorrect, without revealing whether the
   password step succeeded or failed for security reasons beyond what's already implied.
4. **Given** a user with no second factor enrolled, **When** they log in with the correct password
   (and MFA is not required for their role in this deployment), **Then** they are signed in
   exactly as today, with no second-factor prompt.
5. **Given** a suspended account (per spec 004), **When** its second-factor prompt would otherwise
   appear, **Then** access is still denied — suspension continues to block access regardless of
   how far into login the user gets.

---

### User Story 3 - Recovering access after losing the authenticator device (Priority: P2)

A user who has enrolled a second factor loses their phone (or otherwise loses access to their
authenticator app) and can no longer produce a valid code. They use a recovery code, generated at
enrollment time and safely stored by them in advance, to get back into their account instead of
being permanently locked out.

**Why this priority**: A real, expected failure mode of any second-factor system — without this,
enrolling a factor becomes a risk of permanent lockout, which would suppress adoption of the
feature entirely. Slightly lower priority than US1/US2 because the system remains usable (via
admin-assisted account recovery) even before this exists, just with more support burden.

**Independent Test**: Enroll a factor, note the recovery codes shown at that time, then at a
later login use one of those codes instead of an authenticator code; confirm access is granted
and that same recovery code cannot be used a second time.

**Acceptance Scenarios**:

1. **Given** a user completing enrollment, **When** the factor becomes active, **Then** they are
   shown a set of one-time recovery codes to store securely, with a clear warning that this is
   the only time these codes are displayed.
2. **Given** a user at the second-factor login prompt, **When** they enter a valid, unused
   recovery code instead of an authenticator code, **Then** they are signed in successfully.
3. **Given** a recovery code that has already been used once, **When** it is entered again,
   **Then** it is rejected as invalid.
4. **Given** a user who has used a recovery code to sign in, **When** they reach their account
   security settings, **Then** they are clearly prompted to re-enroll a working authenticator app
   and generate a fresh set of recovery codes, since they are now down to fewer unused ones.
5. **Given** a user who has lost both their authenticator app and all recovery codes, **When**
   they cannot complete any second-factor path, **Then** they must be assisted by an authorized
   admin through the existing account-management capability (this feature does not need to
   invent a new self-service path for total lockout — that remains an admin-assisted case).

---

### User Story 4 - A deployment decides whether MFA is required or optional per role (Priority: P3)

Since this platform is deployed independently by each country/tenant on their own infrastructure,
one deployment's operators may decide MFA must be mandatory for their Country Admins, while
another deployment (or the same one, for its Viewer accounts) may leave it optional. The platform
must support both without requiring a code change to switch between them.

**Why this priority**: Valuable policy flexibility, but the feature is already meaningfully
useful and secure without it — every role can already voluntarily enroll and be protected (US1–
US3) before any deployment-level enforcement policy is added. This governs *whether enrollment is
mandatory*, not whether it's *possible*.

**Independent Test**: As a deployment operator, configure a policy that a given role must have an
enrolled second factor; confirm an unenrolled user of that role is guided to enroll before being
allowed to proceed past login, while a role without that policy is unaffected.

**Acceptance Scenarios**:

1. **Given** a deployment where a specific role is configured as requiring MFA, **When** a user
   of that role logs in without having enrolled a factor, **Then** they are guided directly into
   enrollment before being granted access to protected areas, rather than silently let through.
2. **Given** a deployment where a role is not configured as requiring MFA, **When** a user of
   that role logs in without an enrolled factor, **Then** login proceeds exactly as it does today,
   with enrollment remaining available but optional.
3. **Given** a role is configured as requiring MFA, **When** an already-enrolled user of that role
   attempts to remove their factor, **Then** removal is blocked (or requires immediately enrolling
   a replacement) so that a mandatory factor can never be dropped to zero.

### Edge Cases

- What happens if a user starts enrollment but never completes it (never enters a valid code)?
  No factor becomes active, and the incomplete attempt does not block them from logging in
  normally with just their password (per whatever policy already applied to them beforehand).
- What happens if a user tries to enroll a second, additional authenticator app while one is
  already active? Out of scope for this feature's first version — one active factor per account
  is sufficient to satisfy the CRITICAL requirement; supporting multiple simultaneous factors is
  a possible future enhancement, not required now.
- What happens if the same authenticator code is submitted twice in quick succession (replay)?
  A given time-window code must not be usable more than once, consistent with standard TOTP
  practice.
- What happens to in-progress login attempts if an admin suspends the account (spec 004) between
  the password step and the second-factor step? The suspension must still take effect — a
  suspended account cannot complete login regardless of which step it's paused at.
- What happens when a user changes their password? Their enrolled second factor is unaffected —
  password changes and second-factor enrollment are independent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow any authenticated user, regardless of role, to enroll one
  authenticator-app-based (TOTP) second factor on their own account, via a self-service account
  security area that is reachable independently of role-restricted areas like the admin panel
  (spec 004 restricts admin-panel entry to super_admin/country_admin/org_admin — this area MUST
  remain reachable by every role, Viewer included).
- **FR-002**: System MUST present a setup code/QR image during enrollment that standard
  authenticator apps can consume, and MUST require the user to confirm enrollment by entering one
  valid current code before the factor is considered active.
- **FR-003**: System MUST prompt any user with an active second factor for a current code
  immediately after correct password verification, and MUST NOT treat the session as fully
  authenticated (i.e., MUST NOT grant access to any protected area) until that code (or a valid
  recovery code, per FR-006) is verified.
- **FR-004**: System MUST NOT prompt a user with no active second factor for any additional code
  beyond their password, except when a per-deployment policy requires their role to enroll (see
  FR-008).
- **FR-005**: System MUST generate a set of one-time recovery codes at the moment a factor becomes
  active, display them to the user exactly once, and never display the same set again afterward.
- **FR-006**: System MUST accept a valid, unused recovery code as an alternative to a current
  authenticator code at the second-factor login step, and MUST permanently invalidate that code
  after one use.
- **FR-007**: System MUST allow a user to remove their own active second factor from their
  account, unless doing so is blocked by a per-deployment mandatory-MFA policy for their role
  (FR-008/FR-009).
- **FR-008**: System MUST support configuring, per role, whether enrolling a second factor is
  mandatory or optional, as a setting each deployment controls independently rather than a value
  fixed across all deployments of this platform. The shipped default for every role, before any
  deployment operator changes it, MUST be optional — admin-provisioned accounts (e.g., a ministry
  contact invited by email) cannot be assumed to reliably monitor that inbox, so defaulting to
  mandatory would create onboarding friction disproportionate to the risk for a first release.
- **FR-009**: For any role configured as requiring MFA, system MUST guide an unenrolled user of
  that role into enrollment before granting them access to any protected area, rather than
  allowing indefinite postponement.
- **FR-010**: System MUST continue to deny access to a suspended account (per spec 004) at every
  step of login, including the second-factor step, regardless of whether correct credentials or
  codes are supplied.
- **FR-011**: System MUST record enrollment, removal, and recovery-code use as auditable events,
  consistent with this platform's existing audit posture (spec 004's approach of logging
  privileged/security-relevant account actions).
- **FR-012**: System MUST NOT implement SMS-based delivery of authentication codes.

### Key Entities

- **Second Factor (Authenticator Enrollment)**: Represents one user's enrolled TOTP credential —
  when it was created, whether it is currently active, and which account it belongs to. One per
  account in this feature's scope.
- **Recovery Code Set**: A batch of one-time-use codes generated alongside a Second Factor,
  each independently markable as used or unused, tied to the same account.
- **MFA Policy (per role, per deployment)**: A per-deployment, per-role setting stating whether
  enrollment is mandatory or optional for that role — not a single global value.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete second-factor enrollment (scan code, confirm, receive recovery
  codes) in under 2 minutes without engineering assistance.
- **SC-002**: 100% of login attempts for accounts with an active second factor are denied access
  to protected areas until a valid current code or unused recovery code is supplied.
- **SC-003**: 100% of previously-used recovery codes are rejected on any subsequent attempt to
  reuse them.
- **SC-004**: A deployment operator can change a role's mandatory-vs-optional MFA policy without
  any code change or new deployment of the application.
- **SC-005**: Zero accounts are permanently locked out solely due to losing their authenticator
  device, provided they retained at least one unused recovery code.

## Assumptions

- This feature builds on spec 004's `profiles`/role model and audit approach; it does not change
  the existing role hierarchy or provisioning flow, only what happens between password entry and
  a session being treated as fully authenticated.
- One active second factor per account is sufficient to satisfy the CRITICAL SRS requirement for
  this version; supporting multiple concurrent factors per account is not required now.
- As established in spec 004, settings that are inherently per-deployment (this platform runs on a
  separate backend per country/tenant) are documented as configurable per deployment rather than
  fixed in this codebase — the mandatory-vs-optional MFA policy per role (FR-008) follows that
  same pattern already used for spec 004's invite-link expiry.
- SMS-based MFA and multiple simultaneous factors per account are explicitly out of scope for this
  version, per the feature description and the platform's existing dissemination-channel
  boundaries.
- Recovery codes are generated by the application itself (not a third-party service), since the
  underlying authentication provider used by this platform does not natively provide a recovery-
  code mechanism — only the second-factor (TOTP) mechanism itself is a provider-native capability.
- Admin-assisted recovery for a user who has exhausted both their authenticator app and all
  recovery codes reuses this platform's existing account-management capability (spec 004) rather
  than requiring a new self-service mechanism in this feature.
