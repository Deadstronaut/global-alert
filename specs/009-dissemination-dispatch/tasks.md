# Tasks: Dissemination & Contact Directory

**Input**: Design documents from `specs/009-dissemination-dispatch/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/dispatch-alert.md, contracts/contacts-crud.md, quickstart.md

**Context**: Greenfield feature — 3 new tables (`contacts`, `dispatch_jobs`, `dispatch_receipts`), 1 new Edge Function (`dispatch-alert`, two invocation modes), no changes to existing `cap_drafts` rows/columns (only an additive trigger observing its `status` column).

## Phase 1: Setup

- [X] T001 Create migration file `supabase/migrations/20260707120000_contacts.sql` with the standard header comment (purpose, covered FRs).
- [X] T002 Create migration file `supabase/migrations/20260707120100_dispatch_jobs_and_receipts.sql` with the standard header comment.
- [X] T003 Create migration file `supabase/migrations/20260707120200_cap_broadcast_dispatch_trigger.sql` with the standard header comment, including `CREATE EXTENSION IF NOT EXISTS pg_net;`.

## Phase 2: Foundational (blocking prerequisites)

- [X] T004 In `20260707120000_contacts.sql`, create the `contacts` table per data-model.md (all columns, the `email IS NOT NULL OR whatsapp_number IS NOT NULL` check, the E.164 `whatsapp_number` check, the unique index on `(lower(email), country_code)` where `email IS NOT NULL`).
- [X] T005 In the same migration, add RLS: `super_admin_contacts_all` (FOR ALL, any country — includes DELETE), and `country_admin_contacts_own`/`org_admin_contacts_own` as **FOR SELECT, INSERT, UPDATE only** (three separate policy clauses, NOT `FOR ALL`) scoped to `country_code`/`org_id` — country_admin/org_admin MUST NOT be able to hard-delete a contact (FR-004; only `super_admin` can). No anon/public policy.
- [X] T006 In the same migration, attach the standard `set_updated_at()` and `log_table_change()` triggers to `contacts`.
- [X] T007 In `20260707120100_dispatch_jobs_and_receipts.sql`, create the `dispatch_jobs` table per data-model.md (status check constraint, indexes on `cap_draft_id` and `(status, created_at DESC)`).
- [X] T008 In the same migration, create the `dispatch_receipts` table per data-model.md (status check constraint, indexes on `(dispatch_job_id, status)` and `(contact_id)`).
- [X] T009 In the same migration, create a `guard_dispatch_transition()` trigger function enforcing the valid-transition sets from data-model.md for both tables' `status` columns (raise an exception on an invalid transition, mirroring `guard_cap_draft_transition()`'s style), and attach it as a `BEFORE UPDATE` trigger on both `dispatch_jobs` and `dispatch_receipts`.
- [X] T010 In the same migration, add RLS: `super_admin_dispatch_all` (FOR ALL, both tables, any country), `country_admin_dispatch_own`/`org_admin_dispatch_own` (FOR SELECT, both tables, joined through `dispatch_jobs.cap_draft_id → cap_drafts.country_code`/`org_id`). No `viewer` policy, and no separate "Auditor" role/policy — `profiles.role` only contains `super_admin`/`country_admin`/`org_admin`/`viewer` (spec 007 precedent: cross-tenant compliance visibility is a `super_admin` capability, not a fourth role). Deliberately do NOT add any INSERT/UPDATE/DELETE policy for non-service-role callers, so only the service-role-authenticated `dispatch-alert` function can write (RLS default-deny).
- [X] T011 In the same migration, attach `log_table_change()` audit triggers to both `dispatch_jobs` and `dispatch_receipts`.
- [X] T012 Create `supabase/functions/shared/dispatchStateMachine.ts` exporting a pure function `isValidJobTransition(from, to)` and `isValidReceiptTransition(from, to)` mirroring the same rules encoded in T009, so the Edge Function and the migration's guard trigger agree by construction (research.md §6).
- [X] T013 [P] Create `supabase/functions/shared/dispatchStateMachine.test.ts` (`Deno.test`, matching `sourceHealth.test.ts`'s convention) covering every valid and at least one invalid transition per state machine.
- [X] T014 Create `supabase/functions/shared/dispatchMatching.ts` exporting a pure function `matchesContact(contact, capDraft)` implementing the predicate from research.md §4 (active + opt-in + country match + hazard-type-filter-or-null match), for one channel at a time (`channel` param).
- [X] T015 [P] Create `supabase/functions/shared/dispatchMatching.test.ts` (`Deno.test`) covering: matching contact, wrong country, wrong hazard type (non-null filter), null hazard filter matches any type, opted-out contact excluded, inactive contact excluded.

**Checkpoint**: Schema (3 tables, RLS, audit, state-machine guards) and pure matching/state-machine logic are ready and tested — Edge Function and UI work can begin.

---

## Phase 3: User Story 1 - Automatic email dispatch on CAP broadcast (Priority: P1)

**Goal**: The moment a CAP draft reaches `broadcast`, matching contacts automatically receive an email, with per-recipient failure isolation.

**Independent Test**: Seed contacts across two countries/hazard filters, move one CAP draft to `broadcast`, confirm only matching contacts receive email and a `dispatch_jobs`/`dispatch_receipts` row set is created correctly (quickstart.md Scenarios 3, 4, 6).

- [X] T016 [US1] In `20260707120200_cap_broadcast_dispatch_trigger.sql`, create function `notify_dispatch_on_broadcast()` that calls `net.http_post` against the deployed `dispatch-alert` function URL with `{ draft_id: NEW.id }` and the service-role key in the Authorization header (URL/key read from Postgres config vars set via `ALTER DATABASE ... SET`, not hardcoded).
- [X] T017 [US1] In the same migration, attach `notify_dispatch_on_broadcast()` as an `AFTER UPDATE OF status ON cap_drafts` trigger, firing `WHEN (NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status)`.
- [X] T018 [US1] Create `supabase/functions/shared/emailProviders/resend.ts` exporting `sendEmail({ to, subject, html })` calling Resend's REST API via `fetch`, reading `RESEND_API_KEY` from env, returning `{ ok, providerMessageId, error }`.
- [X] T019 [US1] [P] Create `supabase/functions/shared/emailProviders/sendgrid.ts` with the same `sendEmail()` signature calling SendGrid's REST API, as the documented swap target (not wired in by default, but present per research.md §2).
- [X] T020 [US1] Create `supabase/functions/shared/emailProviders/index.ts` exporting `getEmailAdapter()` which reads `EMAIL_PROVIDER` env var (`resend` default) and returns the matching adapter's `sendEmail`.
- [X] T021 [US1] Create `supabase/functions/dispatch-alert/index.ts` implementing Mode A per contracts/dispatch-alert.md: load the `cap_drafts` row by `draft_id`; if not `status = 'broadcast'`, return `{ skipped: true, reason: 'not_broadcast' }`; else create a `dispatch_jobs` row and transition `queued → running`.
- [X] T022 [US1] In the same file, query `contacts` using the `dispatchMatching.ts` predicate (T014) for both channels, set `matched_contact_count`, and handle the zero-match case by completing the job immediately with no receipts (contracts/dispatch-alert.md step 4).
- [X] T023 [US1] In the same file, for each email-matching contact: create a `dispatch_receipts` row (`channel: 'email'`, `queued`), call `getEmailAdapter().sendEmail(...)`, update the receipt to `sent` or `failed` based on the result — wrapped so one contact's exception does not stop the loop (FR-010).
- [X] T024 [US1] In the same file, for each WhatsApp-matching contact: create a `dispatch_receipts` row (`channel: 'whatsapp'`, `is_mock: true`), synchronously transition it `queued → sent → delivered` (research.md §3, no real API call).
- [X] T025 [US1] In the same file, after processing all contacts, set `dispatch_jobs.status = 'completed'`, unless the email adapter reported a provider-wide failure (e.g. auth/network error distinct from a per-recipient rejection) in which case set `status = 'failed'` with `failure_reason`.
- [X] T026 [US1] [P] Document the required Edge Function secrets (`EMAIL_PROVIDER`, `RESEND_API_KEY`, and the `pg_net` trigger's target URL/service-role config vars) in a new `supabase/functions/dispatch-alert/README.md`.

**Checkpoint**: Broadcasting a CAP draft results in real email dispatch to correctly-scoped, opted-in contacts, tolerating individual failures.

---

## Phase 4: User Story 2 - Manage the contact directory (Priority: P1)

**Goal**: Tenant Admins can CRUD and bulk-import contacts, correctly scoped to their own country/org.

**Independent Test**: As a country_admin, create a contact manually and via CSV import; confirm both are correctly scoped and a different country's admin cannot see them (quickstart.md Scenarios 1, 2).

- [X] T027 [US2] Create `src/stores/contacts.js` (Pinia store) with `list`, `loadContacts()` (scoped query, RLS does the real enforcement), `createContact()`, `updateContact()`, `deactivateContact()` — mirroring the existing sources/boundary store shape.
- [X] T028 [US2] Create `src/components/admin/ContactFormModal.vue`: fields for full_name, email, whatsapp_number, preferred_language, region_code, hazard_type_filter, email_opt_in, whatsapp_opt_in, and a country selector that is a full dropdown for `auth.isSuperAdmin` and a disabled field showing `auth.countryCode` otherwise (same pattern as `BoundaryUploadForm.vue`'s country field).
- [X] T029 [US2] Create `src/components/admin/ContactsPanel.vue`: table of contacts (name, email, whatsapp, country, opt-in badges, active/inactive), "add contact" button opening `ContactFormModal.vue`, and a deactivate action (not delete) per row.
- [X] T030 [US2] Add a contacts field-map preset to `src/utils/fileParsers.js` usage in a new CSV-import section of `ContactsPanel.vue`, reusing `parseDataFile`/the `FileImportForm.vue` chunked-upsert-with-per-row-error pattern, mapped to `contacts` columns (full_name, email, whatsapp_number, preferred_language, country_code, region_code, hazard_type_filter).
- [X] T031 [US2] In the same import flow, surface the unique-constraint violation (duplicate email+country) as a clear per-row "already exists" error rather than a raw Postgres error string.
- [X] T032 [US2] Add an "İletişim Rehberi" tab to `src/views/AdminView.vue` (mounting `ContactsPanel.vue`), gated the same way as the existing Sources/Boundary tabs (`v-if="canAdmin"` / `super_admin`/`country_admin`/`org_admin`).

**Checkpoint**: Contact directory is fully manageable via the admin UI, correctly RBAC-scoped, with working bulk import.

---

## Phase 5: User Story 3 - Monitor dispatch status and retry failures (Priority: P2)

**Goal**: Operators/Approvers see dispatch outcomes, scoped by the same super_admin/country_admin/org_admin tiering as everywhere else, and can retry failed receipts within their own scope.

**Independent Test**: Trigger a dispatch with one intentionally-failing contact, confirm the panel shows the correct per-receipt outcome, retry re-attempts only the failed one, and a `viewer`-role session (or a country_admin from a different country) cannot access the panel/retry at all (quickstart.md Scenario 5).

- [X] T033 [US3] Create `supabase/functions/shared/dispatchRetryAuthorization.ts` exporting `canRetryDispatchJob(callerProfile, jobCountryCode, jobOrgId)` — true for `super_admin`, or `country_admin`/`org_admin` whose own `country_code`/`org_id` matches the job's, false otherwise (mirrors `suspendAuthorization.ts`'s shape; no "auditor" role exists in this system — see data-model.md's note).
- [X] T034 [US3] [P] Create `supabase/functions/shared/dispatchRetryAuthorization.test.ts` (`Deno.test`) covering each role/scope combination (super_admin any scope; country_admin/org_admin own scope allowed, other scope denied; viewer always denied).
- [X] T035 [US3] Extend `supabase/functions/dispatch-alert/index.ts` with Mode B per contracts/dispatch-alert.md: when the request body has `job_id` instead of `draft_id`, look up the job + its draft's `country_code`/`org_id`, call `canRetryDispatchJob()` and return HTTP 403 (plus an `audit_log` entry) if unauthorized.
- [X] T036 [US3] In the same Mode B path, select the job's `failed`/`bounced` receipts, increment `retry_count`, reset to `queued`, and re-run the same per-channel send logic as T023/T024 (extract that logic into a shared helper used by both modes to avoid duplication).
- [X] T037 [US3] Create `src/components/admin/DispatchPanel.vue`: list recent `dispatch_jobs` (linked CAP alert headline, status, per-channel sent/delivered/failed/bounced counts from their receipts, scoped by RLS to the caller's own country/org unless super_admin), with a "Retry" button per job.
- [X] T038 [US3] Add a "Dispatch" tab to `src/views/AdminView.vue` mounting `DispatchPanel.vue`, gated the same way as the existing Sources/Boundary/Contacts tabs (`v-if="canAdmin"` — `super_admin`/`country_admin`/`org_admin` only; `viewer` has no access to this tab at all, consistent with T010's RLS).

**Checkpoint**: Dispatch outcomes are visible and actionable; retry works correctly scoped; `viewer` role and out-of-scope country_admin/org_admin sessions are denied.

---

## Phase 6: User Story 4 - Public Alert Portal (Priority: P3)

**Goal**: An unauthenticated visitor can see all currently active, broadcast alerts.

**Independent Test**: Compare a future-expiry vs. past-expiry broadcast alert's visibility to an unauthenticated session (quickstart.md Scenario 7).

- [X] T039 [US4] Create `src/views/PublicPortalView.vue` querying `cap_drafts` for `status = 'broadcast' AND expires_at > now()` (the existing `viewer_cap_read_public` RLS policy already permits anon SELECT on `broadcast` rows — confirmed in data-model.md/research.md, no new RLS policy needed), rendering headline, severity, area_desc, and effective_at/expires_at per alert.
- [X] T040 [US4] Add a new public route (e.g. `/portal`) to `src/router/index.js` with `meta: { public: true }`, pointing at `PublicPortalView.vue`.

**Checkpoint**: Unauthenticated visitors can view active alerts without logging in; expired/non-broadcast alerts are correctly excluded.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T041 [P] Add a `contacts` + `dispatch` + `portal` i18n key block to `src/i18n/locales/tr.json` covering all new UI text (form fields, table headers, empty states, retry button, portal labels).
- [X] T042 [P] Add the same i18n key blocks (translated) to `src/i18n/locales/en.json`.
- [X] T043 [P] Add the same i18n key blocks (translated) to `src/i18n/locales/es.json`.
- [X] T044 [P] Add the same i18n key blocks (translated) to `src/i18n/locales/fr.json`.
- [X] T045 [P] Add the same i18n key blocks (translated) to `src/i18n/locales/ru.json`.
- [X] T046 [P] Add the same i18n key blocks (translated) to `src/i18n/locales/ar.json`.
- [X] T047 [P] Add the same i18n key blocks (translated) to `src/i18n/locales/zh.json`.
- [X] T048 Wire all new UI text (`ContactsPanel.vue`, `ContactFormModal.vue`, `DispatchPanel.vue`, `PublicPortalView.vue`) through `t('contacts...'/'dispatch...'/'portal...')` using the keys from T041-T047.
- [X] T049 Run `npm run test` and `deno test supabase/functions/shared/` and confirm all new suites (T013, T015, T034) plus all existing suites pass with zero regressions.
- [X] T050 Run `npm run build` and confirm a clean build with no new console errors/warnings beyond the existing known chunk-size warnings.
- [ ] **BLOCKED (needs user go-ahead)** T051 Manually verify quickstart.md scenarios 1-7 against a local/staging Supabase instance with the migrations applied and `dispatch-alert` deployed. Not run in this session: applying `20260707120000_contacts.sql`/`20260707120100_dispatch_jobs_and_receipts.sql`/`20260707120200_cap_broadcast_dispatch_trigger.sql` and deploying `dispatch-alert` are live changes to shared infrastructure — deferred until explicitly approved, consistent with this repo's existing migration-verification practice (specs 001/006/007/008). `npm run test` (Vitest, 60/60) and `deno test supabase/functions/shared/` (80/80) plus `npm run build` were verified locally (no compile/test errors).
- [X] T052 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: mark spec 009/Dissemination's completion status, note what remains out of scope (real WhatsApp API, polygon geofencing, community reporting, shelter management — Assumptions/research.md), and update the overall totals row.

## Dependencies

- Phase 1 (T001-T003) → Phase 2 (T004-T015) → all user story phases.
- Phase 2 is a hard blocker: schema, RLS, audit triggers, and the pure matching/state-machine logic are relied on by every subsequent story.
- US1 (Phase 3) has no dependency on US2/US3/US4 for its own correctness, but its *quickstart* test needs contacts to exist — seed test contacts directly via SQL/US2's UI, whichever is built first.
- US2 (Phase 4) has no dependency on US1/US3/US4 — could be built fully in parallel by a different contributor once Phase 2 lands.
- US3 (Phase 5) depends on US1 (T021-T025) existing — it monitors/retries jobs that US1 creates.
- US4 (Phase 6) has no dependency on US1/US2/US3 beyond `cap_drafts` already reaching `broadcast` through the existing spec 006 flow — could be built in parallel.
- Phase 7 (Polish) depends on all prior phases being functionally complete.

## Parallel Execution Examples

- T013 and T015 (state-machine and matching tests) can run in parallel once T012/T014 land.
- US2 (Phase 4) can be built entirely in parallel with US1 (Phase 3) by a different contributor once Phase 2 is done — they touch disjoint files.
- US4 (Phase 6) can be built in parallel with US1/US2/US3 by a different contributor at any point after Phase 2.
- T041-T047 (the 7 locale files) are fully parallelizable.
- T018/T019 (Resend/SendGrid adapters) are parallelizable — independent files sharing only a common function signature.

## Implementation Strategy

**MVP scope**: Phase 1 + Phase 2 + Phase 3 (US1) — this closes the actual gap the whole spec exists for ("alerts are authored but never sent"). Phase 4 (US2, contact management UI) is required in practice for US1 to have real recipients, but could initially be seeded via direct SQL/Supabase Studio for a first end-to-end proof before building the full admin UI. Phase 5 (retry/monitoring) and Phase 6 (public portal) are valuable but independently deferrable increments. Phase 7 (i18n) should ship alongside whichever user stories ship, not be deferred indefinitely, per Constitution Principle VI.
