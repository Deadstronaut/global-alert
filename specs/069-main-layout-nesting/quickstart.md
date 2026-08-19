# Quickstart: Validate the Main Layout Shell

## Prerequisites
- Repo installed (`npm install`) and dev server runnable (`npm run dev`).
- A logged-in test account for at least one non-`super_admin` role and one `super_admin`/
  `country_admin`/`org_admin` role (to check `/admin` gating still works under the new nesting).
- 7-locale i18n setup already in place (no changes needed to run this check).

## 1. Public routes unaffected (User Story 3)
1. Without logging in, open `/login`, `/portal`, `/report` directly by URL.
2. Confirm: no header/hazard-row/footer shell appears; pages render exactly as before; anonymous
   hazard report at `/report` can still be submitted.

## 2. Shell persists across authenticated routes (User Story 1)
1. Log in.
2. Visit `/`, then `/alerts/cap`, `/shelters`, `/hazards`, `/account-security` in sequence
   (use in-app navigation where available, and direct URL entry for at least one, per FR-009).
3. Confirm: header (language + account dropdown), hazard-type row, and footer date scrubber stay
   mounted in the same position on every page; only the central content swaps.
4. Change language via the header dropdown on one page; confirm the whole app (menus + current
   page content) updates to the new locale without a full reload.
5. Open the account dropdown; confirm sign-out and a link to `/account-security` both work.

## 3. Hazard filter + focus row (User Story 2, revised)
1. On any authenticated page, click a hazard type chip in the row (e.g. Flood).
2. Confirm: the chip shows active, the map's flood layer toggles on, AND the focus row appears
   below showing Flood's active count / top severity / forecast indicator / quick-access links.
3. Click a *different* chip (e.g. Wildfire) without touching Flood's chip.
4. Confirm: Wildfire's chip also shows active, Flood's chip STAYS active (its layer doesn't turn
   off), and the focus row re-targets to show Wildfire's data instead of Flood's.
5. Click Flood's chip again (it's currently active but no longer focused).
6. Confirm: Flood's layer toggles off; if Flood was focused, the focus row would have cleared —
   here Wildfire stays focused since it's the one that's focused, not Flood.
7. Reload with nothing ever clicked; confirm the focus row does not appear and no layout jump
   occurs.

## 3a. Header controls: Panel / Konum / world-shape (User Story 4)
1. Click the header's "Panel" button; confirm the same dashboard the old sidebar's Panel button
   opened still opens.
2. Click "Konum"; confirm a popover appears with the alert-radius slider and (if you have a
   detected region) the "only my region" toggle; adjust the radius and confirm it has the same
   effect the sidebar's radius slider used to have.
3. Click the world-shape toggle; confirm the view switches between 3D globe and 2D map exactly
   as the sidebar's switch used to.

## 3b. Footer status row: Durum / hex / legend (User Story 5)
1. In the footer's status row (above the date scrubber), switch the Durum selector to Hexagon;
   confirm the hex-resolution slider becomes interactive and adjusting it changes the map's
   hexagon aggregation, matching the sidebar's old behavior.
2. Switch to Normal or Heatmap; confirm the resolution slider becomes disabled again.
3. Click a severity legend entry; confirm events of that severity toggle out of view, matching
   the sidebar's old legend behavior.

## 3c. Sidebar cleanup (User Story 6)
1. Open the app (or the leftover sidebar UI element, if any remains) and confirm none of the
   following still appear there, since they now live in the header/footer: disaster-type filter
   accordion, severity legend, magnitude/depth/duration sliders, view-mode section (world-shape +
   Durum/hex), location section, standalone Panel button, brand/logo header block.
2. Confirm the country banner, last-updated timestamp, and source-health count are still visible
   somewhere in the shell (header or footer), not lost.

## 4. Auth guard regression check (FR-007)
1. As a non-admin role, attempt `/admin` directly by URL; confirm redirect to `home` still
   happens (now happening for a child route, same as it did for the flat route before).
2. Log out, then attempt any authenticated route directly by URL; confirm redirect to `login`
   still happens.
3. If MFA is configured for a role in this environment, confirm the `aal1`/pending-`aal2`
   redirect to `/mfa-challenge` still fires, and that `/mfa-challenge` itself still renders
   without the new shell (per contracts/router-contract.md).

## 5. Automated check
Run the existing router/unit test suite plus any new tests added for this feature:

```powershell
npm run test:unit -- router
```

Expected: all route-name/path assertions from `contracts/router-contract.md` pass unchanged,
plus new assertions confirming children resolve under the `MainLayout` parent and public routes
remain top-level.
