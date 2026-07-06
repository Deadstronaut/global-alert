# Quickstart: Drill Response-Time and Participation Metrics

Prerequisites: migration applied, `ack-dispatch` deployed with `verify_jwt = false` (see `tasks.md` for exact
commands); `npm run test` / `deno test` passing locally.

## Scenario 1 — Response time is measured from drill start to first exercise alert (User Story 1, FR-001)

1. Start a drill for a country.
2. Wait a known interval (e.g. 2 minutes), then author and broadcast a CAP draft for that country while the drill
   is active (it will auto-flag `is_exercise = true` per spec 013).
3. End the drill.
4. **Expected**: the drill's summary shows a response time of approximately 2 minutes (120 seconds).

## Scenario 2 — No exercise alert issued shows "no data," not zero (FR-002)

1. Start a drill and end it immediately without authoring any alert.
2. **Expected**: the summary clearly indicates no response occurred — not a `0`-second response time.

## Scenario 3 — Recipient acknowledges a dispatched alert (User Story 2, FR-003/FR-004)

1. Ensure at least one active, email-opted-in contact exists in the drill's country.
2. Broadcast an exercise CAP draft during an active drill so it dispatches to that contact.
3. Locate the resulting `dispatch_receipts` row's `id` (e.g. via the admin audit view or a direct query) and visit
   `{SUPABASE_URL}/functions/v1/ack-dispatch?receipt_id={that id}` in a browser.
4. **Expected**: a friendly confirmation page loads; `dispatch_receipts.acknowledged_at` is now set for that row.
5. Visit the same URL again.
6. **Expected**: the same friendly confirmation page loads again (no error), and `acknowledged_at` is unchanged
   from step 4 (not updated to a later timestamp).

## Scenario 4 — Drill summary shows the correct acknowledgment rate (FR-005)

1. Following Scenario 3, end the drill.
2. **Expected**: the summary shows 1 acknowledged out of however many exercise dispatches were sent during that
   drill (e.g. "1 / 3").

## Scenario 5 — A garbage or missing receipt ID never errors (FR-006)

1. Visit `{SUPABASE_URL}/functions/v1/ack-dispatch?receipt_id=00000000-0000-0000-0000-000000000000` (a
   well-formed but non-existent UUID).
2. **Expected**: the same friendly confirmation-style page loads (HTTP 200), not an application error.
