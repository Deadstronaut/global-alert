# Contract: Route Table Equivalence (before → after)

Purpose: guarantee FR-006/FR-007/FR-009 — every route name, path, param, and guard behavior
listed here must resolve identically before and after the router restructuring. This table is
the acceptance contract for the router change; `/speckit-tasks` should generate a test task that
asserts each row.

| Route name | Path | Public today? | Component (unchanged) | After this feature |
|---|---|---|---|---|
| `login` | `/login` | yes | `LoginView.vue` | top-level, outside MainLayout (unchanged) |
| `public-portal` | `/portal` | yes | `PublicPortalView.vue` | top-level, outside MainLayout (unchanged) |
| `report-hazard` | `/report` | yes | `ReportHazardView.vue` | top-level, outside MainLayout (unchanged) |
| `mfa-challenge` | `/mfa-challenge` | no (auth-required, no `meta.public`) | `LoginView.vue` | top-level, outside MainLayout — MFA challenge screen has no reason to show the authenticated shell before MFA passes |
| `home` | `/` | no | `HomeView.vue` | child of MainLayout parent route |
| `map` | `/map` | no | `HomeView.vue` | child of MainLayout parent route |
| `country` | `/:countryCode` | no | `HomeView.vue` (`props: true`) | child of MainLayout parent route, `props: true` preserved |
| `country-map` | `/:countryCode/map` | no | `HomeView.vue` (`props: true`) | child of MainLayout parent route, `props: true` preserved |
| `cap` | `/alerts/cap` | no | `CapView.vue` | child of MainLayout parent route |
| `incidents` | `/alerts/incidents` | no | `IncidentsView.vue` | child of MainLayout parent route |
| `shelters` | `/shelters` | no | `ShelterInfoView.vue` | child of MainLayout parent route |
| `hazards` | `/hazards` | no | `HazardEncyclopediaView.vue` | child of MainLayout parent route |
| `admin` | `/admin` | no (`meta.roles: ['super_admin','country_admin','org_admin']`) | `AdminView.vue` | child of MainLayout parent route, `meta.roles` preserved |
| `account-security` | `/account-security` | no | `AccountSecurityView.vue` | child of MainLayout parent route |

## Guard contract (unchanged)

`router.beforeEach(authGuard)` continues to run for every navigation, at every nesting depth,
with identical logic:
1. `meta.public` routes bypass the login check (rows: login, public-portal, report-hazard).
2. Non-public routes without a session redirect to `login`.
3. `meta.roles` mismatch redirects to `home` (row: admin).
4. `aal1`/pending-`aal2` MFA state redirects to `mfa-challenge` (any non-public route except
   `mfa-challenge` itself).
5. MFA-required-but-unenrolled redirects to `account-security` (any route except
   `account-security` itself, once MFA-pending is false).

None of this logic moves, changes, or gets duplicated — `authGuard` in `router/index.js` is not
edited by this feature beyond (if at all) adjusting which route objects it's attached to, since
it's registered once globally via `router.beforeEach`, independent of nesting.

## MainLayout mount contract

- `MainLayout.vue` MUST render a `<router-view/>` (or `<RouterView/>`) so its `children` routes
  have somewhere to mount.
- `MainLayout.vue` MUST NOT itself perform auth checks — `authGuard` already gates every child
  route before the layout (or child) ever renders; duplicating a check inside `MainLayout` would
  violate FR-007 by introducing a second, potentially-divergent guard.
