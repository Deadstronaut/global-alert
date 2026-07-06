# Research: Dissemination & Contact Directory

## 1. What actually triggers dispatch: DB trigger vs. client call

**Decision**: A Postgres `AFTER UPDATE` trigger on `cap_drafts` (fires only when `status` changes to `broadcast`) that calls the `dispatch-alert` Edge Function asynchronously via the `pg_net` extension (`net.http_post`), authenticated with the service role key.

**Rationale**: `CapView.vue`'s `performTransition()` (src/views/CapView.vue:146) does a plain `supabase.from('cap_drafts').update({ status: newStatus, ... })` — there is no existing Edge Function call in the broadcast path today. If dispatch depended on the client explicitly invoking an Edge Function after the update, any other code path that flips `status` to `broadcast` (a future UI, a support script, direct SQL) would silently skip dispatch. A DB trigger guarantees dispatch fires exactly once per genuine `→ broadcast` transition regardless of caller, matching this project's existing "enforce it server-side, don't trust the client" pattern (RBAC in `create-user`, country scoping in RLS).

**Alternatives considered**:
- *Client calls `dispatch-alert` right after the status update*: rejected — dispatch becomes optional/bypassable, and CapView.vue would need new error-handling for a step that isn't actually about CAP authoring.
- *Supabase Realtime subscription driving dispatch from a long-running server process*: rejected as unnecessary infrastructure (no long-running process exists in this stack outside the separate `server/` aggregator, which is unrelated to CAP) — violates Principle VIII (Simplicity & YAGNI).

## 2. Email provider

**Decision**: Resend, called via a plain `fetch()` from the `dispatch-alert` Edge Function, selected through an `EMAIL_PROVIDER` environment variable (`resend` | `sendgrid`) so the provider is swappable without redesigning the dispatch pipeline — only the low-level `sendEmail()` adapter function changes per provider.

**Rationale**: Both Resend and SendGrid work equally well from a Deno Edge Function via a single authenticated `fetch()` call (no SDK dependency needed, keeping Principle VIII intact). Resend's API is a single JSON POST with no additional setup (domain verification can be deferred to a sandbox `onboarding@resend.dev` sender during development), which is the faster path to a working vertical slice. The adapter is intentionally a thin `sendEmail({to, subject, html}) → {providerMessageId, ok, error}` function so swapping to SendGrid later is a one-file change.

**Alternatives considered**:
- *SendGrid as the only provider*: rejected as the default only because Resend's simpler API reduces implementation risk for the first version; both remain supported via the adapter interface.
- *A queueing service (e.g., a message broker) in front of the provider*: rejected — Principle VIII; a Postgres-backed `dispatch_receipts` table already gives us the queue/retry semantics needed at this scale.

## 3. WhatsApp — mock adapter design

**Decision**: The mock adapter runs entirely inside `dispatch-alert` (no separate webhook-receiving Edge Function in this phase). For each WhatsApp-eligible contact, it synchronously creates a `dispatch_receipts` row with `channel = 'whatsapp'`, immediately transitions it `QUEUED → SENT`, then `SENT → DELIVERED` (simulating a successful mock send), and records a `mock: true` marker in the receipt's metadata. No real Meta Cloud API call is made and no real webhook is exposed.

**Rationale**: The spec's own Assumptions state the mock's job is only to "prove out the state machine, receipt tracking, and UI." A separate webhook-receiving endpoint has no real external caller to invoke it yet (Meta's Cloud API is explicitly out of scope), so building one now would be speculative infrastructure with no consumer — a direct Principle VIII violation. When live WhatsApp integration is built later, that phase will add the webhook endpoint and change the adapter to make a real API call instead of self-transitioning; the state machine and `dispatch_receipts` schema do not need to change.

**Alternatives considered**:
- *Build the webhook endpoint now, matching the future real shape, but never call it*: rejected — dead code with no test path (nothing would ever invoke it), against YAGNI.

## 4. Recipient matching (hazard type + geography)

**Decision**: A contact matches a broadcasting CAP alert when: `contact.is_active = true AND contact.<channel>_opt_in = true AND contact.country_code = cap_drafts.country_code AND (contact.hazard_type_filter IS NULL OR contact.hazard_type_filter = cap_drafts.hazard_type)`. Matching is by `country_code` equality only in this phase — not polygon/bounding-box geofencing.

**Rationale**: `cap_drafts` already carries `country_code` (used today for RLS scoping); reusing it for recipient matching is consistent with the existing country-scoping pattern (spec 002) and requires no new geometry logic. Full polygon-based geofenced targeting (SRS FR-0104/FR-0147) is explicitly a larger SRS ambition than this phase's CRITICAL/HIGH slice requires, and this project has no PostGIS — building accurate polygon-vs-contact-location matching without it would mean re-deriving the point-in-polygon utility (`src/utils/pointInPolygon.js`) against contacts that don't yet reliably carry lat/lng. Country-level matching satisfies the spec's actual acceptance scenarios (Story 1) without speculative geometry work.

**Alternatives considered**:
- *Bounding-box matching using `cap_drafts.lat/lng/radius_km` against a contact's coordinates*: rejected for this phase — contacts are onboarded by country/region (per FR-001), not precise coordinates, so a radius check has nothing meaningful to compare against yet.
- *region_code matching in addition to country_code*: deferred — `region_code` exists on `profiles` (spec 002) but adding it to `contacts` and to matching logic is a natural, low-risk follow-up once country-level matching is proven, not a blocker for the P1 story.

## 5. Retry mechanism

**Decision**: A single `dispatch-alert` Edge Function handles both the automatic initial dispatch (invoked by the DB trigger with `{ draft_id }`, service-role authenticated) and a manual retry (invoked by an authenticated Operator/Approver client with `{ job_id }`) — when `job_id` is supplied, it re-attempts only that job's `FAILED` receipts instead of computing a fresh recipient list.

**Rationale**: One Edge Function with two entry modes is simpler than two near-duplicate functions (both need the same provider adapters and receipt-writing logic); this mirrors the project's existing single-purpose-but-parameterized Edge Function style (e.g., `suspend-user` handling both `suspend` and `reactivate` via an `action` field).

**Alternatives considered**: *A separate `retry-dispatch` function*: rejected as needless duplication of the send/receipt-writing logic for a marginal separation-of-concerns gain.

## 6. Testing approach

**Decision**: Pure-logic unit tests in `supabase/functions/shared/`, using **`Deno.test`** (not Vitest) — matching the actual existing convention there (`sourceHealth.test.ts`/`validatePayload.test.ts` both import `assertEquals` from `https://deno.land/std/assert/mod.ts` and use `Deno.test(...)`, since these files run in the Deno Edge Function runtime, not Node/Vite): `dispatchMatching.ts`/`.test.ts` (recipient-matching predicate) and `dispatchStateMachine.ts`/`.test.ts` (`DispatchJob`/`DispatchReceipt` valid-transition checks, as a port of the same `computeNextState()`-style pattern already used for data-source health in `server/src/processors/sourceHealth.js`). Frontend code (Pinia store, CSV field-mapping) is tested with Vitest, matching `src/utils/fileParsers`'s existing Vitest coverage — the runtime, not a blanket project-wide choice, determines which test tool applies.

**Rationale**: Per constitution Development Workflow & Quality Gates, state-machine and validation logic are non-negotiable test-first zones, and this project already has an established, working pattern for exactly this kind of table-driven state machine test — reusing it is both correct and low-risk.
