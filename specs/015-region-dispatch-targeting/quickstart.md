# Quickstart: Region-Scoped Dissemination Targeting

Prerequisites: migration `<new>_cap_drafts_region_code.sql` applied to the dev Supabase instance (see
`tasks.md` for the exact CLI command once generated); `npm run test` passing locally.

## Scenario 1 — Region-scoped alert reaches only the matching region (User Story 1, FR-003/FR-005)

1. In the admin Contacts panel, create two active contacts in the same country (e.g. `TR`): Contact A with
   `region_code = "Istanbul"`, Contact B with `region_code = "Ankara"`. Both opted in to email.
2. Author a CAP draft for that country, set `region_code = "Istanbul"`, complete required fields, approve, and
   broadcast it.
3. Inspect `dispatch_jobs`/`dispatch_receipts` (or the Edge Function's response) for that draft's dispatch job.
4. **Expected**: Contact A receives a dispatch receipt; Contact B does not.

## Scenario 2 — No-region draft behaves exactly as before (FR-002, FR-007)

1. Using the same two contacts from Scenario 1, author and broadcast a second CAP draft for the same country with
   `region_code` left blank.
2. **Expected**: both Contact A and Contact B receive a dispatch receipt — identical to pre-feature behavior.

## Scenario 3 — Contact with no region still receives a region-scoped alert (FR-005, edge case)

1. Create Contact C in the same country with `region_code` left blank.
2. Broadcast a draft with `region_code = "Istanbul"` (as in Scenario 1).
3. **Expected**: Contact C receives a dispatch receipt (unset contact region is never a mismatch).

## Scenario 4 — Case/whitespace tolerance (edge case)

1. Set Contact A's `region_code` to `" istanbul "` (leading/trailing space, lowercase).
2. Broadcast a draft with `region_code = "Istanbul"`.
3. **Expected**: Contact A still receives a dispatch receipt.

## Scenario 5 — Operator can view a previously entered region on reopen (User Story 2, FR-006)

1. Author a draft, set a region value, save (without broadcasting).
2. Navigate away from the draft and reopen it in `CapView.vue`.
3. **Expected**: the region field shows the previously entered value.
