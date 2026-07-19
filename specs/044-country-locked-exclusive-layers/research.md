# Research: Country-Locked Map View

**Note (2026-07-19)**: §2 and §3 below (originally documenting the hazard-hex/exposure-layer
coordination hooks) were removed after that component was reverted — see spec.md's Note. The
decision that survives is: `uiStore.mapMode` and `layerVisibility` remain exactly as they were
before this feature touched them, with no coordination added between them.

## §1. "Country-locked" definition — reuses existing `authStore`, no new auth mechanism

**Decision**: A user is "country-locked" for this feature's purposes when
`authStore.countryCode !== null && authStore.role !== 'super_admin'`. `super_admin` is treated as
the sees-all role (analogous to an anon user for map-navigation purposes), matching this project's
existing federated-per-country architecture (`[[project_country_scoping_architecture]]`
memory: anon-sees-all + country-locked logins is intentional).

**Source confirmed live**: `src/stores/auth.js` — `session` ref holds
`{ id, email, role, countryCode, regionCode, orgId, capabilities }`, populated by `loadProfile()`
from the `profiles` table's `country_code` column. `countryCode`/`role` are already exposed as
computed getters (`countryCode`, `isSuperAdmin`) — no new reactive field needed, only a new derived
computed combining them (`isCountryLocked`).

**Alternatives considered**: Treating every role except `viewer`-without-countryCode as locked —
rejected as needlessly narrow; the actual distinguishing signal is simply "does this session have
a `countryCode`, and is the role not the one sees-all role" — `country_admin`/`org_admin` sessions
with a `countryCode` are locked exactly the same way a plain `viewer` with a `countryCode` is, for
map-navigation purposes (this feature doesn't need role-level granularity beyond the sees-all
distinction).

## §4. Per-country default zoom: new nullable column on `country_boundaries`

**Decision**: Add `default_zoom numeric NULL` to `country_boundaries` — the same table already
used for every other per-country config value that needs admin-editability and RLS scoping
(confirmed live: `country_admin` can write only their own row, `super_admin` any row,
`supabase/migrations/20260705_country_boundaries.sql:27-46`). `NULL` means "no configured
default" and triggers the existing `zoomToCountry()` fit-to-bounds fallback (spec.md FR-003) —
no separate "has this country been configured yet" flag is needed, `NULL` already carries that
meaning unambiguously.

**Alternatives considered**: A frontend TypeScript lookup table (mirroring
`hydroshedsContinent.ts`'s `Record<string, string>` pattern) — rejected because default zoom is
plausibly something a `country_admin` should be able to tune themselves without a code deploy
(unlike HydroSHEDS' continent mapping, which is genuinely fixed geographic reference data no
admin should ever need to change) — the DB column is both simpler to keep in sync with
`country_boundaries`'s other per-country fields and consistent with this project's existing
admin-editable-config convention for country-specific values that *are* expected to change.

## §5. Double-click handler: conditional registration, not a runtime guard

**Decision**: For a country-locked session, simply do not call `map.on('dblclick', ...)` for the
cross-country-navigation handler at all (rather than registering it and adding an `if (locked)
return` guard inside). Both achieve the same observable behavior (FR-004); conditional
registration is chosen because it makes the country-locked code path's absence of that capability
structurally obvious at the registration site, matching this project's general preference (seen
in `import-*` Edge Functions' per-country isolation) for making a restriction visible at the point
where the capability would otherwise be wired up, not buried in a later branch.
