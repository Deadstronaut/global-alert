# Contract: `ack-dispatch` Edge Function

## Endpoint

`GET {SUPABASE_URL}/functions/v1/ack-dispatch?receipt_id={uuid}`

Registered in `supabase/config.toml` with `verify_jwt = false` — this is the **only** Edge Function in this
project that runs without JWT verification, deliberately, because it must be reachable by a direct click from an
email client with no bearer token available (research.md).

## Request

- Method: `GET` (a link, not a form submission — must work as a plain `<a href>`).
- Query parameter: `receipt_id` — a `dispatch_receipts.id` UUID. No other parameters, no request body, no
  `Authorization` header required or read.

## Response

- Always `200 OK`, `Content-Type: text/html`, regardless of outcome (FR-006 — never an application error visible
  to the recipient).
- Body: a minimal, self-contained HTML page (no external stylesheet/script dependency, consistent with this
  being viewed directly from an email client) with a short confirmation message. The exact wording differs by
  outcome only for clarity, not for correctness — the HTTP contract (200, HTML, no error) is identical in all
  three cases below:
  1. `receipt_id` is missing, malformed, or matches no row → friendly "link not recognized" message.
  2. `receipt_id` matches a row with `acknowledged_at IS NULL` → sets `acknowledged_at = NOW()`, then a "thank you,
     recorded" message.
  3. `receipt_id` matches a row with `acknowledged_at` already set → no write performed (idempotent), same
     "thank you, recorded" message as case 2 (FR-004 — a recipient re-clicking sees the same friendly outcome,
     not an error, and no duplicate record is created).

## Behavioral Contract

1. MUST NOT require any request header, cookie, or session — the URL alone is sufficient (FR-003/SC-002).
2. MUST set `acknowledged_at` at most once per receipt, regardless of how many times the endpoint is hit for the
   same `receipt_id` (FR-004) — enforced by the `WHERE acknowledged_at IS NULL` condition on the update, not by
   any application-level locking (a second concurrent hit simply updates zero rows, which is indistinguishable
   from — and handled identically to — the "already acknowledged" case).
3. MUST use the service-role Supabase client internally; MUST NOT rely on any `anon`-reachable RLS policy on
   `dispatch_receipts` (research.md — no such policy exists or is added by this feature).
4. MUST NOT throw or return a non-200 status for any input, including a garbage/missing `receipt_id` — this is a
   public surface and must degrade gracefully by design (FR-006).

## Test Cases (pure-logic; see `drillMetrics.test.ts` for the response-time/ack-rate math, not this endpoint's
HTTP behavior — the HTTP layer itself is exercised via `quickstart.md`, not unit tests, consistent with this
project's existing convention of not unit-testing thin Edge Function HTTP handlers directly)

N/A at the unit level — this contract's guarantees (idempotent update, always-200, no auth) are structural
properties of the endpoint's implementation, verified via `quickstart.md`'s manual scenarios rather than
`Deno.test`, matching how this project already treats other thin Edge Function entry points (e.g.
`dispatch-alert/index.ts` itself has no direct unit tests — its pure logic, `matchesContact()`, does).
