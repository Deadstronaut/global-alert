# Phase 0 Research: CAP v1.2 Envelope & Export

No `[NEEDS CLARIFICATION]` markers remained in the spec. This phase confirms the technical
approach against the existing `cap_drafts` schema, the OASIS CAP v1.2 mandatory field set, and
this project's established patterns for auto-populated columns (spec 013's `is_exercise`).

## Decision: reuse `cap_drafts.id` as the CAP `identifier` — no new column

- **Decision**: The CAP `<identifier>` element is the alert's existing `id::text` (already a
  globally unique UUID, already present on every row, including historical ones).
- **Rationale**: OASIS CAP v1.2 requires `<identifier>` to be a unique string identifying this
  specific message — a UUID already satisfies that with zero migration risk and zero new state to
  keep in sync.
- **Alternatives considered**: A separate human-readable identifier scheme (e.g.
  `TR-2026-00042`) — rejected as unnecessary complexity (Principle VIII) with no acceptance
  scenario requiring it.

## Decision: `sender` is a new column, auto-populated via a `BEFORE INSERT` trigger

- **Decision**: `cap_drafts.sender` (TEXT), set by `set_cap_sender()` — a `BEFORE INSERT` trigger
  computing `NEW.sender := COALESCE(org.name, 'GEWS') || '@' || lower(COALESCE(NEW.country_code,
  'global')) || '.gews.local'` (looking up `organizations.name` via `NEW.org_id` when present).
- **Rationale**: Mirrors spec 013's `set_cap_exercise_flag()` pattern exactly — a `BEFORE INSERT`
  trigger guarantees the field is populated regardless of which code path performs the insert
  (the same reasoning already validated twice in this project: spec 009's dispatch trigger, spec
  013's exercise flag). FR-001 explicitly requires zero manual operator input.
- **Alternatives considered**: A manual "sender" text field in `CapView.vue`'s authoring form —
  rejected: adds a mandatory field to every alert authoring flow for information the system
  already has access to (the alert's own org/country), directly contradicting FR-001.

## Decision: extend the existing `guard_cap_draft_transition()` completeness gate (not a new trigger)

- **Decision**: Add one more condition to the existing `pending_approval` completeness check in
  `guard_cap_draft_transition()` (spec 006): `sender` must be non-blank before a draft may enter
  `pending_approval` (and by the transition graph's own transitivity, before it can ever reach
  `broadcast`).
- **Rationale**: `sender` is now guaranteed non-blank by the new `BEFORE INSERT` trigger for every
  row going forward, so this check is defense-in-depth (FR-002) rather than the primary
  enforcement mechanism — but it's one added `OR` clause in an already-existing function, not a
  new trigger, keeping the single-source-of-truth completeness gate intact rather than splitting
  validation logic across two triggers.
- **Alternatives considered**: A separate new trigger purely for envelope validation — rejected:
  would duplicate the "is this draft complete enough to submit" concern `guard_cap_draft_transition()`
  already owns.

## Decision: CAP XML/JSON generation as pure, synchronous JS functions in `src/lib/capExport.js`

- **Decision**: `capMsgType(draft)` returns `'Cancel'` for `status` in
  `('cancelled','false_alarm','all_clear')`, `'Update'` when `supersedes_id` is set (and status is
  none of the above), else `'Alert'`. `generateCapXml(draft, supersededDraft)` builds a CAP v1.2
  `<alert>` document via escaped template literals; `generateCapJson(draft, supersededDraft)`
  builds the equivalent as a plain JS object. Both accept an already-fetched `supersededDraft`
  (or `null`) rather than performing their own DB query, keeping them pure and unit-testable.
- **Rationale**: CAP v1.2's `<alert>` root element structure (identifier, sender, sent, status,
  msgType, scope, one `<info>` block) is straightforward enough that a dedicated XML library adds
  a dependency for no real benefit (Principle VIII) — template-literal construction with an
  `escapeXml()` helper (escaping `&<>"'`) for every user-supplied text field is sufficient and
  matches this project's existing `src/lib/` pure-function module convention
  (`capStateMachine.js`, `auditExport.js`).
- **Alternatives considered**: A dedicated XML-builder library (e.g. `xmlbuilder2`) — rejected:
  unnecessary dependency for a single, fixed document shape; a full XML library is justified for
  complex/variable schemas, not a single well-known fixed template.

## Decision: `<references>` element built from the superseded draft's own envelope fields

- **Decision**: When `draft.supersedes_id` is set and the superseded draft is found,
  `<references>` is populated as `{superseded.sender},{superseded.id},{superseded.effective_at in
  CAP date-time format}` (OASIS CAP's documented `sender,identifier,sent` comma-separated format
  per reference). When the superseded draft cannot be found (Edge Case), `<references>` is simply
  omitted.
- **Rationale**: Directly satisfies FR-007 using data already available on the superseded row (no
  new fields needed on the referencing draft itself); matches the OASIS-documented format exactly.
- **Alternatives considered**: Storing a denormalized copy of the superseded alert's
  sender/identifier/sent on the new draft at creation time — rejected: `supersedes_id` already
  provides a stable FK to look this up fresh at export time, avoiding stale denormalized copies if
  ever needed for legacit historical exports.

## Decision: exercise-flagged exports use CAP's own native `status="Exercise"` value

- **Decision**: The exported CAP `<status>` element (distinct from this project's own
  `cap_drafts.status` lifecycle column, which is never exported verbatim) is set to `"Exercise"`
  when `draft.is_exercise` is true, and `"Actual"` otherwise — both are valid values in OASIS CAP
  v1.2's own `<status>` enumeration (`Actual`, `Exercise`, `System`, `Test`, `Draft`), so this is
  the standards-correct way to mark a drill message, not a workaround.
- **Rationale**: CAP v1.2 already has first-class support for exactly this concept — reusing it
  is more correct and more interoperable with any downstream CAP consumer (which will already
  know how to handle `status="Exercise"`) than inventing project-specific text-marker conventions.
  This project's own `cap_drafts.status` column tracks a different concept (this alert's
  authoring/approval lifecycle stage: draft, pending_approval, broadcast, etc.) and is mapped
  separately — a broadcast, non-exercise draft exports as CAP `status="Actual"`.
- **Alternatives considered**: A headline text marker (e.g. prepending "[EXERCISE]") — rejected
  once the correct CAP-native mechanism was identified; a text convention would be strictly worse
  for machine-readability by downstream CAP consumers than the standard's own enumerated value.

All decisions above resolve directly from spec.md requirements, the existing `cap_drafts` schema,
and OASIS CAP v1.2's documented field requirements — no outstanding unknowns remain for Phase 1.
