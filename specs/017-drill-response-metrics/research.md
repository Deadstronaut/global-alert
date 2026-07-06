# Research: Drill Response-Time and Participation Metrics

No `[NEEDS CLARIFICATION]` markers remain.

## Decision: Ack confirmation is a public Edge Function returning HTML directly, not a Vue route

**Rationale**: The acknowledgment link is clicked from inside an email client, where there is no guarantee the
SPA's JavaScript bundle ever loads (many email clients open links in a bare browser tab or an in-app webview with
restricted script execution). A Deno Edge Function that itself renders a minimal, self-contained HTML confirmation
page on `GET` requires zero JavaScript to work correctly — the click alone completes the acknowledgment
server-side before any HTML is even parsed. Routing through a Vue route (`/ack/:id`) would require the full SPA
bundle to load, mount the router, run a component's `onMounted`, and fire an API call before the user sees
anything — several failure points that don't exist with a direct Edge Function response.

**Alternatives considered**: A Vue route + `PublicPortalView.vue`-style component making a client-side call to a
JSON API — rejected: adds a full SPA-load dependency to a flow whose entire value is "the least friction possible
for a recipient who just wants to confirm receipt," and duplicates work the Edge Function can already do directly.

## Decision: No RLS grant to `anon` on `dispatch_receipts` — the Edge Function is the only writer

**Rationale**: `dispatch_receipts` currently has no `anon`-reachable policy at all (spec 009's RLS only grants
`super_admin`/scoped `country_admin`/`org_admin` access). Adding *any* `anon` UPDATE policy — even one narrowly
scoped to `WHERE acknowledged_at IS NULL` — creates a public write surface on a table that also holds delivery
status, failure reasons, and provider message IDs, and requires reasoning about what a maliciously-crafted request
to that policy could still do (e.g., probing which receipt IDs exist by observing whether an update "succeeds").
Using the existing service-role Edge Function pattern (already established by `dispatch-alert`, `create-user`,
`suspend-user`) keeps `dispatch_receipts` fully RLS-locked to authenticated staff roles, with the one narrow
exception being a single, fully-controlled code path that does exactly one thing: set `acknowledged_at` once, if
unset, for a specific ID.

**Alternatives considered**: A narrow `anon` RLS policy (`FOR UPDATE USING (acknowledged_at IS NULL) WITH CHECK
(...)`) — rejected as strictly riskier than a service-role Edge Function for equivalent capability, and this
project has zero precedent of granting `anon` any write access anywhere in its RLS (confirmed: every existing
`anon`/`authenticated`-scoped policy across all migrations is read-only or role-gated).

## Decision: `verify_jwt = false` for `ack-dispatch` only, explicitly registered in `supabase/config.toml`

**Rationale**: Every existing Edge Function in this project either requires an `Authorization` header (staff
actions, `geocode-search`) or is invoked internally by a DB trigger with the service-role key (`dispatch-alert`'s
Mode A). None is designed to be visited directly, unauthenticated, from an external link — this is a new pattern
for this project, and it is scoped to exactly one function, not a global relaxation.

**Alternatives considered**: Requiring the anon key as a query parameter and attaching it client-side — rejected:
still requires the SPA to run to attach it, defeating the point above; also would expose the anon key more
directly in a forwarded/logged URL than necessary, when no auth is actually needed for this idempotent,
narrowly-scoped action.

## Decision: Response time and ack-rate computation split into a pure, testable module (`drillMetrics.ts`)

**Rationale**: Following spec 016's `applyFetchResult()` precedent (a pure merge function extracted specifically
so tests don't need to mock Supabase), `computeResponseTime(startedAt, firstAlertAt)` and
`computeAckRate(sentCount, ackCount)` are extracted as pure functions taking already-fetched values, so
`drillMetrics.test.ts` can assert their edge-case behavior (no alert issued → `null`; zero sent → `null` ack rate,
never a divide-by-zero or a misleading `0%`) without any database interaction. `AdminView.vue`'s `endDrill()`
remains the thin, DB-touching caller — unchanged in kind from its current shape, just calling two more pure helpers
after its existing queries.

**Alternatives considered**: Inlining the arithmetic directly in `endDrill()` — rejected: spec.md's edge cases
(FR-002's "no response ≠ zero", FR-005's "zero sent ≠ zero rate") are exactly the kind of easy-to-get-subtly-wrong
logic this project's constitution flags for test-first treatment (Development Workflow & Quality Gates).

## Decision: `receipt.id` (already a UUID, already unguessable) is reused directly as the ack token — no separate token column

**Rationale**: `dispatch_receipts.id` is a `gen_random_uuid()` primary key, cryptographically unguessable and
already unique per contact/channel/dispatch. Introducing a separate `ack_token` column would duplicate exactly the
property the primary key already has, for no additional security benefit — this project's Simplicity/YAGNI
principle favors reusing an existing unguessable identifier over minting a parallel one.

**Alternatives considered**: A dedicated random token column, rotated/expiring — rejected: over-engineered for a
one-click, non-security-critical confirmation (worst case of a guessed/leaked receipt ID is a false acknowledgment
being recorded for one dispatch, not a data breach — `dispatch_receipts` rows carry no PII beyond a contact
foreign key already protected by RLS from anon SELECT).
