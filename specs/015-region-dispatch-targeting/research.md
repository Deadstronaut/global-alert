# Research: Region-Scoped Dissemination Targeting

No `[NEEDS CLARIFICATION]` markers remain in the Technical Context — this feature reuses existing, already-proven
patterns rather than introducing new technology. Findings below document *why* each existing pattern was reused
as-is.

## Decision: Region as free text, not a controlled vocabulary/registry

**Rationale**: `contacts.region_code` (spec 009) is already a free-text `TEXT` column with no foreign key to a
region/admin-boundary table. Introducing a controlled vocabulary now would require: (a) a new registry table, (b)
backfilling/migrating every existing contact's region value, (c) an admin UI to manage it. None of that is needed to
close the actual gap (contacts already have a value; it's just unused downstream). Matching the existing convention
keeps the two sides of the match (contact and draft) trivially compatible.

**Alternatives considered**:
- A `regions` lookup table with FK constraints — rejected: over-engineering for a field that's currently
  unconstrained free text on the only other table that has it; would create an inconsistency where contacts allow
  any string but drafts are constrained to a fixed list, which doesn't help matching at all (a contact with an
  un-migrated free-text region would just never match).
- Hierarchical region codes (e.g., ISO 3166-2 subdivision codes) — rejected: not how the existing `contacts.region_code`
  field is populated today (per `ContactFormModal.vue`, it's a plain text box); adopting a stricter format only for
  new drafts would silently make matching *worse* against the existing unconstrained contact data.

## Decision: Match rule is "unset on either side = always matches"

**Rationale**: This is the load-bearing design decision from the spec (FR-003/FR-005) — an unset region must never
be treated as a mismatch. This guarantees the feature is purely additive: every existing contact (100% of which
currently have no reason to have set a meaningful region for dispatch purposes, since nothing used it before) keeps
receiving every alert it would have received before, and only contacts *and* drafts that both opt into using region
get the narrower behavior.

**Alternatives considered**:
- Treat an unset draft region as "matches everyone" but an unset *contact* region as "matches nothing" (i.e., require
  contacts to explicitly opt in to region-scoped alerts) — rejected: this would silently stop delivering alerts to
  every existing contact the moment an operator started using region-scoped drafts, which is exactly the kind of
  regression FR-007 rules out. The spec's symmetric "either side unset = match" rule is the only option that
  guarantees zero regression without a backfill.

## Decision: Case-insensitive, whitespace-trimmed string comparison

**Rationale**: Both `region_code` values are free text entered by different admins/operators at different times
(`ContactFormModal.vue` for contacts, `CapView.vue` draft form for alerts going forward). Exact byte-equality would
make the feature fragile to trivial formatting differences ("Istanbul" vs "istanbul "). This mirrors how the
project already treats other free-text-adjacent identifiers loosely at comparison time rather than enforcing strict
normalization at write time (consistent with the project's YAGNI stance — no new normalization/taxonomy layer).

**Alternatives considered**: Exact match only — rejected as too brittle for two independently-typed free-text
fields with no shared validation; would produce false negatives (silently under-notifying) which is worse than the
current all-country-notify behavior the feature is trying to improve on.

## Decision: Fix the `dispatch-alert/index.ts` `draftForMatching` narrowing as part of this feature, not separately

**Rationale**: `index.ts:109` already explicitly constructs a narrowed object (`{ country_code, hazard_type }`)
rather than passing the full `draft` row through to `matchesContact()`. Even after `cap_drafts` gains a
`region_code` column and `matchesContact()` is taught to check it, this call site would silently continue to pass
`undefined` for `region_code` unless updated — meaning the feature would appear implemented (types compile, unit
tests pass) but do nothing in production. This wiring fix is therefore in-scope for User Story 1, not a separate
follow-up.

**Alternatives considered**: Pass the full `draft` object instead of narrowing it — rejected as a larger change than
necessary for this feature; the narrowing pattern itself is a reasonable defensive practice (only pass what the pure
function's interface declares), so the fix is to add the one new field to the narrowed object, not to remove the
narrowing pattern.
