---

description: "Task list for Simulated Hazard Injection for Drills (spec 037)"
---

# Tasks: Tatbikat İçin Simüle Tehlike Enjeksiyonu

**Input**: Design documents from `/specs/037-drill-hazard-injection/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/drill-injected-events.md, quickstart.md

**Tests**: Not included as a separate test-first phase — this feature has no new pure-logic
function comparable to the constitution's named test-first zones (dedup, severity mapping, CAP
XML validation, proximity calculation); the one candidate pure function
(`normalizeInjectedEventForPicker()`, US4) is small enough that its correctness is exercised via
quickstart.md Scenario 4 rather than a dedicated unit suite, consistent with this repo's
"lighter-weight testing at author's discretion" allowance for non-critical logic.

**Organization**: Tasks are grouped by user story (US1–US4) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/`, `tests/unit/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/<timestamp>_drill_injected_events.sql` with a header comment describing scope (simulated hazard injection for active drills, spec 037, new additive table — no existing table/trigger modified)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `drill_injected_events` table and its RLS are shared by every user story —
nothing else can be built until these exist.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [X] T002 In the migration, create `drill_injected_events` table per data-model.md: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `drill_session_id UUID NOT NULL REFERENCES drill_sessions(id) ON DELETE CASCADE`, `country_code VARCHAR(2) NOT NULL`, `hazard_type TEXT NOT NULL REFERENCES hazard_types(code)`, `description TEXT NOT NULL`, `lat DOUBLE PRECISION NOT NULL`, `lng DOUBLE PRECISION NOT NULL`, `severity TEXT NOT NULL`, `created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — idempotent (`CREATE TABLE IF NOT EXISTS`)
- [X] T003 In the same migration, add CHECK constraints: `chk_drill_event_severity CHECK (severity IN ('critical','high','moderate','low','minimal'))`, `chk_drill_event_lat CHECK (lat BETWEEN -90 AND 90)`, `chk_drill_event_lng CHECK (lng BETWEEN -180 AND 180)`, `chk_drill_event_description CHECK (btrim(description) <> '')`
- [X] T004 In the same migration, create two indexes per data-model.md: `idx_drill_injected_events_session ON drill_injected_events (drill_session_id)`, `idx_drill_injected_events_country ON drill_injected_events (country_code)`
- [X] T005 In the same migration, enable RLS and add three policies per data-model.md (mirroring `drill_sessions`'s own EXISTS/profiles-subquery style, research.md Decision 4): `super_admin_drill_events_all` (FOR ALL), `country_admin_drill_events_own` (FOR ALL, `p.role IN ('country_admin','org_admin') AND p.country_code = drill_injected_events.country_code`), `authenticated_read_active_drill_events` (FOR SELECT TO authenticated, `EXISTS (SELECT 1 FROM drill_sessions ds WHERE ds.id = drill_injected_events.drill_session_id AND ds.status = 'active')`)
- [X] T006 In the same migration, attach the existing `log_table_change()` audit trigger function (`AFTER INSERT OR UPDATE OR DELETE`) — reuse, do not duplicate (spec 007 pattern)
- [X] T007 [P] Create `src/stores/drillInjectedEvents.js` with base state (`events` ref, `loading`/`error` refs) — no methods yet (added per-story below)

**Checkpoint**: Table, RLS, and audit trigger exist — nothing calls the store or renders any UI yet.

---

## Phase 3: User Story 1 - Yetkili kullanıcı aktif bir tatbikata simüle bir tehlike olayı enjekte eder (Priority: P1) 🎯 MVP

**Goal**: `country_admin`/`org_admin`/`super_admin`, kendi kapsamındaki `active` bir tatbikata afet
tipi + konum + şiddet + açıklama girerek bir simüle olay ekleyebilir.

**Independent Test**: Aktif bir tatbikatta bir olay enjekte edilir; satırın doğru
`drill_session_id`/`country_code` ile oluştuğu doğrulanır; hiç aktif tatbikat yokken enjeksiyon
formunun sunulmadığı doğrulanır (quickstart.md Senaryo 1).

### Implementation for User Story 1

- [X] T008 [US1] In `src/stores/drillInjectedEvents.js`, add `injectEvent(payload)` (`supabase.from('drill_injected_events').insert({ ...payload, created_by: currentUserId }).select().single()`, pushes to local `events` state on success, surfaces the DB CHECK-constraint/RLS error message on failure)
- [X] T009 [US1] In `src/views/AdminView.vue`, add a small inline "Olay Enjekte Et" sub-form to each `active`-status drill card in the existing drill tab (hazard type select from `hazardTypesStore.activeHazardTypes`, lat/lng number inputs, severity select using the existing `SEVERITIES` value set, description textarea), calling `drillInjectedEventsStore.injectEvent({ drill_session_id: drill.id, country_code: drill.country_code, ... })` — only rendered when `drill.status === 'active'` (FR-001)
- [X] T010 [P] [US1] Add `drillInjection.form.*` i18n keys (form labels, field errors) to all 7 locale files in `src/i18n/locales/`

**Checkpoint**: User Story 1 fully functional and independently testable — an authorized user can
inject a simulated event into an active drill.

---

## Phase 4: User Story 2 - Herhangi bir giriş yapmış kullanıcı, aktif tatbikat sırasında enjekte edilmiş olayları haritada gerçekçi şekilde görür (Priority: P1)

**Goal**: Enjekte olaylar ana haritada, gerçek afet olaylarından ayrı bir katmanda ama her zaman
görünür bir "TATBİKAT" rozetiyle gösterilir.

**Independent Test**: Aktif bir tatbikata bağlı enjekte bir olayla harita açılır; olayın "TATBİKAT"
etiketiyle göründüğü ve bu etiketin hiçbir etkileşimle kaybolmadığı doğrulanır (quickstart.md
Senaryo 2).

### Implementation for User Story 2

- [X] T011 [US2] In `src/stores/drillInjectedEvents.js`, add `fetchForActiveDrill(drillSessionId)` (`supabase.from('drill_injected_events').select('*').eq('drill_session_id', drillSessionId)` — RLS's `authenticated_read_active_drill_events` policy already ensures nothing returns once the drill is `completed`)
- [X] T012 [US2] In `src/components/MapView.vue`, add `updateDrillEventMarkers()`/`clearDrillEventMarkers()` mirroring `updateShelterMarkers()`/`clearShelterMarkers()`'s DOM-Marker+Popup shape (research.md Decision 2) — one marker per row in `drillInjectedEventsStore.events`, popup always includes an unconditional, non-dismissible "🎯 TATBİKAT" badge (research.md Decision 3, mirrors `CapView.vue`'s `draft-exercise-badge`) plus hazard type/severity/description
- [X] T013 [US2] In `src/components/MapView.vue`, wire `onMounted`/watch to call `drillInjectedEventsStore.fetchForActiveDrill()` for the viewer's own country's currently-active drill (if any — query `drill_sessions` for `status='active' AND country_code = auth.countryCode`, super_admin sees any) and re-render markers when the result changes
- [X] T014 [P] [US2] Add `drillInjection.map.*` i18n keys (badge text, popup field labels) to all 7 locale files

**Checkpoint**: User Stories 1 AND 2 both work independently — injected events are visible and
unmistakably marked on the map.

---

## Phase 5: User Story 4 - Enjekte edilmiş bir olay, gerçek dispatch/incident/metriklere hiçbir zaman karışmaz (Priority: P1)

**Goal**: Bir enjekte olay isteğe bağlı olarak bir CAP taslağının tohumu olabilir (ve o taslak
otomatik `is_exercise=true` olur), ama enjekte olaylar gerçek export/sayaç/rapor mantığına asla
dahil edilmez.

**Independent Test**: Bir enjekte olaydan CAP taslağı oluşturulur, `is_exercise=true` olduğu
doğrulanır; gerçek export/rapor mekanizmalarının `drill_injected_events`'i hiç sorgulamadığı kod
incelemesiyle doğrulanır (quickstart.md Senaryo 4).

### Implementation for User Story 4

- [X] T015 [US4] In `src/stores/drillInjectedEvents.js`, add a pure `normalizeForEventPicker(injectedEvent)` function returning `{ id: injectedEvent.id, type: injectedEvent.hazard_type, severity: injectedEvent.severity, title: injectedEvent.description, lat: injectedEvent.lat, lng: injectedEvent.lng }` (research.md Decision 5 — matches the shape `CapView.vue`'s `startFromEvent()` already expects)
- [X] T016 [US4] In `src/views/CapView.vue`, extend the `detectedEvents` computed to also include the active drill's injected events (fetched via `drillInjectedEventsStore`, mapped through `normalizeForEventPicker()`) when the caller's country has an `active` drill — `startFromEvent()` itself is NOT modified (research.md Decision 5)
- [X] T017 [US4] Code-review confirmation (no code change expected): verify `downloadDrillSummary()`/`generate-drill-report` (spec 017/032), disaster-event CSV/JSON/GeoJSON export functions, and false-alarm-rate/incident-report queries (spec 026) do not and should not reference `drill_injected_events` — record this confirmation in a code comment at the top of `src/stores/drillInjectedEvents.js` for future maintainers (FR-006/FR-008)

**Checkpoint**: User Stories 1, 2, and 4 all independently functional — injection, realistic
display, and the real-data isolation guarantee are all in place (still no P2 cleanup-on-end
behavior until US3).

---

## Phase 6: User Story 3 - Tatbikat sona erdiğinde enjekte edilmiş olaylar haritadan kalkar (Priority: P2)

**Goal**: Bir tatbikat `completed` olduğunda, enjekte olayları haritada artık görünmez ama
veritabanında saklı kalır.

**Independent Test**: Enjekte olaylı bir tatbikat durdurulur; haritanın yeniden yüklenmesinin
ardından olayın görünmediği, ama service-role ile sorgulandığında hâlâ mevcut olduğu doğrulanır
(quickstart.md Senaryo 3).

### Implementation for User Story 3

- [X] T018 [US3] Verify (no new code expected — this is the RLS/store design already satisfying FR-005): `authenticated_read_active_drill_events` (T005) filters out any drill whose `status != 'active'`, so `fetchForActiveDrill()` (T011) naturally returns nothing for a `completed` drill; confirm via quickstart.md Scenario 3 that ending a drill (existing `endDrill()` in `AdminView.vue`, unmodified) causes the map layer to clear on next load
- [X] T019 [US3] In `src/stores/drillInjectedEvents.js`, add `removeEvent(id)` (`supabase.from('drill_injected_events').delete().eq('id', id)`) so an authorized user can manually clear a mistaken injection before a drill ends (FR-009), and wire a small "Kaldır" action next to each injected event listed in the `AdminView.vue` drill card sub-form (T009)
- [X] T020 [P] [US3] Add `drillInjection.remove.*` i18n keys (remove action label/confirmation) to all 7 locale files

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T021 Run `npm run test` (Vitest) and `deno test supabase/functions/shared/` and confirm all existing suites pass with zero regressions (no new Deno-side code in this feature)
- [X] T022 Run `npm run build` and confirm a clean build with no new console errors/warnings beyond the existing known chunk-size warnings
- [X] T023 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: mark spec 037/Preparedness module progress (its last remaining "ayrı, daha büyük bir iterasyon" item is now closed), update the overall totals row
- [X] T024 Migration `20260713120000_drill_injected_events.sql` pushed to production (user-approved, first attempt hit a transient "unexpected EOF" network error mid-push — retried successfully, confirmed idempotent via `IF NOT EXISTS`/`DROP POLICY IF EXISTS`). No Edge Function in this feature, so no deploy step beyond the migration. `npx supabase migration list --linked` confirms `20260713120000` now matches on remote. Interactive browser verification of quickstart.md Scenarios 1-4 (injection UI, map badge, drill-end cleanup, CapView picker) is left for the user to click through under different role accounts.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3–6)**: All depend on Foundational; US1 has no dependency on other stories; US2 depends on US1 having produced at least one row to display (its own map-layer code is independently testable given any row, including one inserted directly for test purposes); US4 depends on US1 (needs an injected event to seed a draft) but not on US2; US3 depends on US1/US2 (needs a visible injected event to verify it disappears)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### Within Each User Story

- Store methods before components that call them
- i18n keys can be added in parallel with their story's UI work (marked [P])

### Parallel Opportunities

- T007 (Foundational store skeleton) has no file conflicts with T002-T006 (migration) — can run in parallel
- Within each user story, i18n tasks marked [P] run in parallel with implementation
- US2 and US4 can be built in parallel by different developers once US1 exists (both only read rows US1 already produces)

---

## Parallel Example: Foundational Phase

```bash
Task: "Create drill_injected_events table + RLS + audit trigger in the migration"
Task: "Create src/stores/drillInjectedEvents.js with base state"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 + 4)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (injection)
4. Complete Phase 4: User Story 2 (realistic map display + badge) — without this, injected events
   have no visible effect, so the drill isn't actually more realistic yet
5. Complete Phase 5: User Story 4 (isolation guarantee) — this is the feature's safety property;
   shipping without it would be a real false-alarm risk, so it's bundled into the MVP despite being
   phase 5 in file order (its own priority in spec.md is P1, same as US1/US2)
6. **STOP and VALIDATE**: Run quickstart.md Scenarios 1, 2, 4
7. Deploy/demo if ready (pending user go-ahead on migration deploy, T024)

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 + US2 + US4 → Test independently → Deploy/Demo (MVP — the three P1 stories)
3. Add US3 (P2) → Test independently → Deploy/Demo (cleanup-on-end polish)
4. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No existing table, RLS policy, trigger, or frontend component is modified — this feature is
  entirely additive (per plan.md's Structure Decision)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently

---

## Addendum (2026-07-15): Scheduled multi-step scenario sequences

Closes the item previously deferred as "zamanlanmış/çok adımlı senaryo dizileri" (originally
YAGNI'd — no concrete need yet). New, additive `drill_scenario_steps` table
(`supabase/migrations/20260715120000_drill_scenario_sequences.sql`): an ordered plan of
hazard-injection steps per drill, each with a `delay_minutes` offset from `drill_sessions.started_at`.
A per-minute `pg_cron` job (`process_drill_scenario_steps()`, SECURITY DEFINER) fires each due step
by INSERTing into the existing `drill_injected_events` table exactly as a manual injection would —
`drill_injected_events` itself, its RLS, and the map-marker/CapView code paths built for US1–US4
above are completely unchanged. Steps are readable/writable only by the same admin roles that can
already inject events manually (super_admin/country_admin/org_admin) — unlike
`drill_injected_events`'s "visible while active" policy, steps are intentionally **not** exposed to
plain `authenticated` (viewer) users, since a step is a future/planned event and revealing it ahead
of time would spoil the drill. New `src/stores/drillScenarioSteps.js` (+ `nextStepOrder()` pure
function, unit-tested in `tests/unit/drillScenarioSteps.test.js`) and a "Scheduled Scenario
Sequence" builder UI in `AdminView.vue`'s existing drill-injection panel, with i18n coverage across
all 7 locales. Migration deploy to production pending user go-ahead, same as every other migration
in this project.
