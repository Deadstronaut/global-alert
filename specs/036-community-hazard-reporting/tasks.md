---

description: "Task list for Community Hazard Reporting (spec 036)"
---

# Tasks: Vatandaş Kaynaklı Afet Bildirimi (Community Hazard Reporting)

**Input**: Design documents from `/specs/036-community-hazard-reporting/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/community-reports.md,
quickstart.md

**Tests**: Included — the `resolveCountryCode()` Deno port (research.md Decision 1) MUST behave
identically to the existing `src/utils/geoCountry.js`/`server/src/processors/geoCountry.js`
implementations it mirrors, and the `guard_community_report_transition()` DB trigger's pure-logic
twin is the kind of state-machine correctness the constitution's test-first zones target
(mirrors `isValidJobTransition`/`isValidReceiptTransition` in `dispatchStateMachine.test.ts`,
spec 009). Frontend photo/field validation is exercised via a pure function, per project
convention (e.g. `occupancyPercentage()`, spec 021).

**Organization**: Tasks are grouped by user story (US1–US5) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/`, `supabase/functions/`,
`tests/unit/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/<timestamp>_community_reports.sql` with a header comment describing scope (community hazard reporting, spec 036, new additive table + Storage bucket — no existing table/policy modified)
- [X] T002 [P] Create `supabase/functions/submit-community-report/` directory with an empty `index.ts` (Deno Edge Function, `verify_jwt=false` per `supabase/config.toml`, mirroring `ack-dispatch`/`unsubscribe`'s anon-callable config entry)
- [X] T003 [P] Create `supabase/functions/shared/geoCountry.ts` and `supabase/functions/shared/geoCountry.test.ts` as empty files (filled in Phase 2)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `community_reports` table, its guard trigger, RLS, Storage bucket, and the
server-side country-resolution module are shared by every user story — nothing else can be built
until these exist.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [X] T004 In the migration, create `community_reports` table per data-model.md: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `hazard_type TEXT NOT NULL REFERENCES hazard_types(code)`, `description TEXT NOT NULL`, `lat DOUBLE PRECISION NOT NULL`, `lng DOUBLE PRECISION NOT NULL`, `country_code VARCHAR(2)`, `photo_path TEXT`, `status TEXT NOT NULL DEFAULT 'pending'`, `rejection_reason TEXT`, `assigned_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL`, `linked_incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL`, `moderated_by UUID REFERENCES profiles(id) ON DELETE SET NULL`, `moderated_at TIMESTAMPTZ`, `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — idempotent (`CREATE TABLE IF NOT EXISTS`)
- [X] T005 In the same migration, add CHECK constraints: `chk_community_report_status CHECK (status IN ('pending','approved','rejected','archived'))` (FR-003), `chk_community_report_lat CHECK (lat BETWEEN -90 AND 90)`, `chk_community_report_lng CHECK (lng BETWEEN -180 AND 180)` (FR-002), `chk_community_report_description CHECK (btrim(description) <> '')` (FR-002)
- [X] T006 In the same migration, create `guard_community_report_transition()` PL/pgSQL function + `BEFORE UPDATE OF status` trigger mirroring `guard_incident_transition()`/`guard_cap_draft_transition()`'s shape: reject `OLD.status = NEW.status`; allow only `pending→approved`, `pending→rejected`, `approved→archived`, `rejected→archived` (FR-003); raise `reason_required` if `NEW.status = 'rejected'` and `rejection_reason` is null/blank (FR-007)
- [X] T007 In the same migration, attach the existing `set_updated_at()` trigger function (`BEFORE UPDATE`) and the existing `log_table_change()` audit trigger function (`AFTER INSERT OR UPDATE OR DELETE`) — reuse, do not duplicate (spec 007 pattern)
- [X] T008 In the same migration, enable RLS and add four policies per data-model.md: `super_admin_community_reports_all` (`current_profile_role() = 'super_admin'`, FOR ALL), `country_admin_community_reports_moderate` (`current_profile_role() = 'country_admin' AND country_code = current_profile_country_code()`, SELECT + UPDATE — covers approve/reject/assign per FR-006/FR-015), `authenticated_read_approved_community_reports` (`TO authenticated USING (status = 'approved')`, SELECT, FR-008), `org_admin_read_assigned_community_reports` (`current_profile_role() = 'org_admin' AND status = 'approved' AND assigned_org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())`, SELECT only — FR-016/FR-017) — no INSERT policy for any client role (research.md Decision 2)
- [X] T009 In the same migration, create the `community-report-photos` Storage bucket (`INSERT INTO storage.buckets (id, name, public) VALUES ('community-report-photos', 'community-report-photos', true) ON CONFLICT DO NOTHING`) and a `storage.objects` RLS policy allowing public SELECT on that bucket only (no INSERT/UPDATE/DELETE policy for `anon`/`authenticated` — writes happen exclusively via the Edge Function's service-role client, research.md Decision 3)
- [X] T010 [P] Implement `resolveCountryCode(lat, lng)` in `supabase/functions/shared/geoCountry.ts` — Deno port of `src/utils/geoCountry.js`, same bbox smallest-area-wins logic, reading a bundled copy of `src/configs/countries.json` (research.md Decision 1)
- [X] T011 [P] Write `supabase/functions/shared/geoCountry.test.ts` (`deno test`) asserting `resolveCountryCode()` parity with known cases from `src/utils/geoCountry.js` (a point clearly inside one country, a point in a known bbox-overlap region resolving to the smallest-area match, an out-of-bounds/no-match point returning `null`)
- [X] T012 [P] Create `src/stores/communityReports.js` with base state (`reports`, `moderationQueue`, `assignedToMyOrg`, `loading`, `error` refs) — no methods yet (added per-story below)

**Checkpoint**: Table, guard trigger, RLS, Storage bucket, and the tested country-resolution
module exist — nothing calls the Edge Function or renders any UI yet.

---

## Phase 3: User Story 1 - Vatandaş, giriş yapmadan bir afet/tehlike bildirimi gönderebilir (Priority: P1) 🎯 MVP

**Goal**: Kimliksiz bir ziyaretçi, afet tipi + açıklama + konum (+ isteğe bağlı fotoğraf) girip
bir `PENDING` `community_reports` satırı oluşturabilir; ülke kodu server-side belirlenir.

**Independent Test**: `/report` sayfasından fotoğrafsız bir bildirim gönderilir; satırın
`status='pending'` ve doğru `country_code` ile oluştuğu doğrulanır (quickstart.md Senaryo 1).

### Tests for User Story 1

- [X] T013 [P] [US1] Write `supabase/functions/shared/communityReportValidation.test.ts` (`deno test`) for a new pure `validateReportPayload(payload)` function: eksik `hazardType`/`description`/`lat`/`lng` her biri ayrı ayrı reddedilir; `lat`/`lng` aralık dışı reddedilir; geçerli payload kabul edilir; geçersiz `photo` MIME tipi veya >5MB boyut reddedilir (FR-002/FR-013)

### Implementation for User Story 1

- [X] T014 [US1] Implement `validateReportPayload(payload)` in `supabase/functions/shared/communityReportValidation.ts` per T013's cases (pure function, no I/O)
- [X] T015 [US1] Implement `supabase/functions/submit-community-report/index.ts`: parse request body, call `validateReportPayload()` (T014), call `resolveCountryCode()` (T010) to derive `country_code`, upload `photo` (if present) to the `community-report-photos` bucket under a `crypto.randomUUID()`-based path via the service-role client, `INSERT INTO community_reports` (service-role, bypassing RLS per research.md Decision 2) with `status='pending'`, return `{ id, status }` on success or a 400 with the specific validation error on failure
- [X] T016 [US1] In `src/stores/communityReports.js`, add `submitReport(payload)` calling `supabase.functions.invoke('submit-community-report', { body: payload })` (per data-model.md's Frontend section — `functions.invoke`, not the `disasterService.js` raw-`fetch` pattern)
- [X] T017 [US1] Create `src/components/CommunityReportForm.vue`: hazard type select (from `hazardTypesStore`, already existing), description textarea, a map-click or geolocation-based lat/lng picker, optional single photo file input (client-side MIME/size hint before submit), calls `submitReport()`, shows a "bildiriminiz incelemeye alındı" confirmation on success and field-specific errors on failure (FR-001/FR-002)
- [X] T018 [US1] Create `src/views/ReportHazardView.vue` mounting `CommunityReportForm.vue`, mirroring `ShelterInfoView.vue`'s minimal wrapper shape
- [X] T019 [US1] In `src/router/index.js`, add a public `/report` route (no `meta.roles`, no auth guard) rendering `ReportHazardView.vue`, mirroring the existing `/shelters`/`/hazards` routes
- [X] T020 [US1] Add a sidebar/nav link to `/report` in `src/components/SidebarPanel.vue` (or the public-facing equivalent used by `/shelters`/`/hazards`), discoverable without login
- [X] T021 [P] [US1] Add `communityReport.*` i18n keys (form labels, field errors, submit confirmation) to all 7 locale files in `src/i18n/locales/`

**Checkpoint**: User Story 1 fully functional and independently testable — an anonymous visitor
can submit a report and it lands as `pending` with a server-resolved country code.

---

## Phase 4: User Story 2 - Yetkili kullanıcı bekleyen bildirimleri inceleyip onaylar/reddeder (Priority: P1)

**Goal**: `country_admin`/`super_admin` kendi ülkesindeki bekleyen bildirimleri görebilir, onaylayıp
(isteğe bağlı organizasyona atayabilir) veya gerekçeyle reddedebilir.

**Independent Test**: `PENDING` bir bildirim, bir `country_admin` hesabıyla onaylanır (bir
organizasyona atanarak) ve ayrı bir bildirim gerekçesiz reddedilmeye çalışılıp engellenir, sonra
gerekçeyle reddedilir (quickstart.md Senaryo 3).

### Implementation for User Story 2

- [X] T022 [US2] In `src/stores/communityReports.js`, add `fetchModerationQueue()` (`supabase.from('community_reports').select('*').eq('status', 'pending').order('created_at')` — RLS scopes to caller's country automatically)
- [X] T023 [US2] In `src/stores/communityReports.js`, add `approveReport(id, { assignedOrgId })` (`update({ status: 'approved', assigned_org_id: assignedOrgId ?? null, moderated_by: currentUserId, moderated_at: now })`) and `rejectReport(id, rejectionReason)` (`update({ status: 'rejected', rejection_reason: rejectionReason, moderated_by: currentUserId, moderated_at: now })`) — both surface the guard trigger's `reason_required`/`invalid_community_report_transition` errors to the caller
- [X] T024 [US2] In `src/stores/communityReports.js`, add `fetchAssignableOrganizations()` reusing the existing `organizations` read pattern (already used by `ContactFormModal.vue`/`ShelterFormModal.vue`'s org dropdown), scoped to the caller's own country for `country_admin`
- [X] T025 [US2] Create `src/components/admin/CommunityReportsPanel.vue`: pending-queue list (description, hazard type, location, photo thumbnail if present, submitted-at), per-row "Onayla" (with an optional organization dropdown, T024) and "Reddet" (requires a non-empty reason, client-side hint mirroring `cap_drafts`' reject-with-reason modal) actions
- [X] T026 [US2] Add a "Vatandaş Bildirimleri" tab to `src/views/AdminView.vue` mounting `CommunityReportsPanel.vue`, visible to `country_admin`/`super_admin` only (existing tab-visibility pattern, e.g. Audit tab's super_admin-only gating)
- [X] T027 [P] [US2] Add `communityReportModeration.*` i18n keys (queue labels, approve/reject actions, reason-required error, organization-assignment label) to all 7 locale files

**Checkpoint**: User Stories 1 AND 2 both work independently — reports can be submitted and
moderated end-to-end (still invisible on the map until US3).

---

## Phase 5: User Story 3 - Onaylanmış bildirimler haritada kümelenmiş işaretçiler olarak görünür (Priority: P2)

**Goal**: Giriş yapmış herhangi bir kullanıcı, onaylı bildirimleri ana haritada, afet olaylarından
ayrı, kümelenmiş bir katmanda görebilir.

**Independent Test**: Onaylı bir bildirimle harita açılır, işaretçi/küme görünür, tıklanınca
detaylar açılır, katman kontrolünden gizlenip tekrar gösterilebilir (quickstart.md Senaryo 4).

### Implementation for User Story 3

- [X] T028 [US3] In `src/stores/communityReports.js`, add `fetchApproved()` (`supabase.from('community_reports').select('*').eq('status', 'approved')`)
- [X] T029 [US3] In `src/stores/ui.js`, add `showCommunityReports` boolean (default `true`) + `toggleCommunityReports()`, mirroring `showShelters`/`toggleShelters()` (spec 027)
- [X] T030 [US3] In `src/components/MapView.vue`, add a new MapLibre GeoJSON source with `cluster: true` (research.md Decision 6) built from `communityReportsStore.fetchApproved()`'s results, plus `cluster-count`/unclustered-point layers styled distinctly from disaster-event markers
- [X] T031 [US3] In `src/components/MapView.vue`, add click handlers: clicking a cluster zooms/expands it (MapLibre's standard `getClusterExpansionZoom` pattern), clicking an individual point opens a popup with hazard type, description, submitted-at, and photo (if `photo_path` present, rendered from the public Storage URL)
- [X] T032 [US3] In `src/components/MapView.vue`, wire the new layer's visibility to `uiStore.showCommunityReports`, and add its toggle control alongside the existing shelter/disaster-layer toggles
- [X] T033 [P] [US3] Add `communityReportMap.*` i18n keys (layer toggle label, popup field labels) to all 7 locale files

**Checkpoint**: User Stories 1–3 all work independently — approved reports are now visible and
clustered on the map for every signed-in user.

---

## Phase 6: User Story 4 - Yetkili kullanıcı onaylanmış bir bildirimi mevcut bir olaya (incident) bağlar (Priority: P3)

**Goal**: `country_admin`/`super_admin`, onaylı bir bildirimi mevcut bir incident'a bağlayabilir;
bağlantı audit_log'a düşer ve incident detayında görünür.

**Independent Test**: Onaylı bir bildirim bir incident'a bağlanır; incident detayında bildirimin
listelendiği ve audit_log'da bağlama olayının kayıtlı olduğu doğrulanır (quickstart.md Senaryo 5).

### Implementation for User Story 4

- [X] T034 [US4] In `src/stores/communityReports.js`, add `linkToIncident(reportId, incidentId)` (`supabase.from('community_reports').update({ linked_incident_id: incidentId }).eq('id', reportId)` — re-linking simply overwrites the existing FK value, FR-012)
- [X] T035 [US4] In `src/components/admin/CommunityReportsPanel.vue` (from T025), add an incident-picker action on `approved` rows (reuses the existing incidents list already available to `IncidentsView.vue`, scoped to the caller's own country/org)
- [X] T036 [US4] In `src/views/IncidentsView.vue` (or its incident-detail sub-component), add a read-only "İlgili Vatandaş Bildirimleri" section listing `community_reports` rows where `linked_incident_id` matches the open incident
- [X] T037 [P] [US4] Add `communityReportIncidentLink.*` i18n keys to all 7 locale files

**Checkpoint**: User Stories 1–4 all independently functional.

---

## Phase 7: User Story 5 - Kendisine atanmış bildirimi org_admin kendi görünümünde görür (Priority: P3)

**Goal**: Bir `org_admin`, kendi organizasyonuna atanmış ve onaylı bildirimleri salt-okunur olarak
görebilir; onay/red/atama aksiyonu görmez.

**Independent Test**: Bir bildirim bir organizasyona atanıp onaylandıktan sonra, o organizasyonun
`org_admin` hesabıyla giriş yapılıp bildirimin salt-okunur göründüğü, başka bir organizasyonun
`org_admin`'ine görünmediği doğrulanır (quickstart.md Senaryo 3'ün devamı).

### Implementation for User Story 5

- [X] T038 [US5] In `src/stores/communityReports.js`, add `fetchAssignedToMyOrg()` (`supabase.from('community_reports').select('*').eq('status', 'approved').eq('assigned_org_id', myOrgId)` — RLS (T008's `org_admin_read_assigned_community_reports` policy) already narrows this to the caller's own organization)
- [X] T039 [US5] Create `src/components/admin/AssignedCommunityReportsPanel.vue`: read-only list (no approve/reject/assign/link controls rendered) of `fetchAssignedToMyOrg()`'s results
- [X] T040 [US5] Add a "Bana Atanan Bildirimler" tab to `src/views/AdminView.vue`, visible to `org_admin` only, mounting `AssignedCommunityReportsPanel.vue` (distinct from US2's country_admin/super_admin-only moderation tab)
- [X] T041 [P] [US5] Add `communityReportAssigned.*` i18n keys to all 7 locale files

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T042 Run `npm run test` (Vitest) and `deno test supabase/functions/shared/` and confirm all new suites (T011, T013) plus all existing suites pass with zero regressions
- [X] T043 Run `npm run build` and confirm a clean build with no new console errors/warnings beyond the existing known chunk-size warnings
- [X] T044 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: mark spec 036/Dissemination module progress, note what remains out of scope (real NLP/LLM categorization, audio attachments, scheduled cluster-summary generation, live SSE ticker — Assumptions/research.md), update the overall totals row
- [X] T045 Migration `20260712120000_community_reports.sql` pushed to production (user-approved) and `submit-community-report` deployed. Scenario 1 verified live end-to-end: an unauthenticated POST to the deployed function created a `pending` row with `country_code` correctly resolved server-side to `'tr'` for a Turkey coordinate (confirmed via service-role read, then the test row was deleted). Scenarios 2-6 (moderation queue, map layer, incident linking, org_admin assigned view) require interactive browser sessions under different roles (country_admin/org_admin/viewer) and are left for the user to click through per quickstart.md.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3–7)**: All depend on Foundational; US1 has no dependency on other stories; US2 depends on US1's data existing to moderate (but its own code — queue/approve/reject — is independently testable given any `pending` row, including one inserted directly for test purposes); US3 depends on US2 having produced `approved` rows to display (same caveat); US4 depends on US2 (needs an `approved` row) and an existing incident; US5 depends on US2 (needs a row with `assigned_org_id` set)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### Within Each User Story

- Tests (where included) before implementation (US1's T013 before T014)
- Store methods before components that call them
- Components before route/nav wiring
- i18n keys can be added in parallel with their story's UI work (marked [P])

### Parallel Opportunities

- T002/T003 (Setup) run in parallel
- T010/T011/T012 (Foundational) run in parallel — different files
- Within each user story, i18n tasks marked [P] run in parallel with implementation
- US3, US4, US5 can be built in parallel by different developers once US2 exists (all three only read `approved` rows that US2 already produces)

---

## Parallel Example: Foundational Phase

```bash
Task: "Implement resolveCountryCode(lat, lng) in supabase/functions/shared/geoCountry.ts"
Task: "Write supabase/functions/shared/geoCountry.test.ts parity tests"
Task: "Create src/stores/communityReports.js with base state"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (submission)
4. Complete Phase 4: User Story 2 (moderation) — without moderation, submitted reports have
   nowhere to go and FR-004's invisibility guarantee can't be demonstrated end-to-end
5. **STOP and VALIDATE**: Run quickstart.md Scenarios 1–3
6. Deploy/demo if ready (pending user go-ahead on migration/Edge Function deploy, T045)

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 + US2 → Test independently → Deploy/Demo (MVP — submission + moderation, no map visibility yet)
3. Add US3 → Test independently → Deploy/Demo (map layer)
4. Add US4 → Test independently → Deploy/Demo (incident linking)
5. Add US5 → Test independently → Deploy/Demo (org_admin assigned view)
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No existing table, RLS policy, Edge Function, or frontend component is modified — this feature
  is entirely additive (per plan.md's Structure Decision)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
