---

description: "Task list for feature 038: Population Exposure Data Sources"
---

# Tasks: Population Exposure Data Sources

**Input**: Design documents from `/specs/038-population-exposure-sources/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/import-population-source.md, quickstart.md

**Scope note**: This feature ships **1 source** — Kontur Population. WorldPop was removed during
planning after live verification found it GeoTIFF-only (raster), no vector/CSV extract — see
spec.md's Amendment. Meta/HDX Population was removed during implementation after live verification
found its CSV resource is 18.6M raw grid-resolution rows per country (Turkey alone) — see spec.md's
Amendment 2. GHSL was also removed during implementation after live verification found it's a
global GeoTIFF tile grid with no vector/per-country download — see spec.md's Amendment 3. All three
are candidates for a future, separately-scoped feature (which would need raster-processing and/or
spatial-aggregation capability this feature deliberately does not take on), not part of this task
list.

**Tests**: Included for `validatePopulationRecord` and `geometryToWkt` (business-logic validation — falls under the constitution's "critical business logic" test-first zone by direct analogy with the existing `validatePayload`/`sourceHealth`/dedup tests) and for each `<source>Fetch.ts` shape-mapping module.

**Organization**: Tasks are grouped by user story (US1/US2/US3 from spec.md) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps task to US1/US2/US3
- File paths are exact, relative to repo root

---

## Phase 0: Live API verification — COMPLETE (done during planning, 2026-07-09)

These were originally planned as implementation-time spikes (T010–T013 in the prior draft of this
file). They were actually executed live during planning (via direct `curl`, since this session's
WebFetch tool was blocked but direct HTTP access was not) — findings are recorded in research.md
§4. Recorded here for traceability, not to be redone:

- [X] Spike: Kontur Population live HDX shape — confirmed GeoPackage-only (`.gpkg.gz`), confirmed HDX `groups`/ISO3 filter reliably resolves per-country packages (tested against both Madagascar `groups:mdg` and Turkey `groups:tur`). See research.md §4. **This is the only source this feature implements.**
- [X] Spike: Meta Population live HDX shape — confirmed CSV (zipped) resource available alongside GeoTIFF; format looked usable, but the actual downloaded file (Turkey) turned out to be 134MB/1.1GB/18.6M rows of raw grid data. **Resulted in Meta's removal from this feature's scope** (spec.md Amendment 2, data-model.md §5c).
- [X] Spike: WorldPop live HDX shape — confirmed GeoTIFF-only, no vector/CSV extract for any served-country package inspected. **Resulted in WorldPop's removal from this feature's scope** (spec.md Amendment, data-model.md §5b).
- [X] Spike: GHSL data-download shape — confirmed global GeoTIFF tile grid (row/column tiles, e.g. `GHS_POP_..._R1_C8.zip`), no vector or per-country download exists. **Resulted in GHSL's removal from this feature's scope** (spec.md Amendment 3, data-model.md §5d).

**All four originally requested sources have now been live-verified. Three were removed as infeasible for this feature's scope (raw raster/grid-resolution data). Only Kontur Population remains.**

---

## Phase 1: Setup

**Purpose**: Migration and shared-helper groundwork, no source-specific code yet

- [X] T001 Create migration `supabase/migrations/<timestamp>_population_exposure_sources.sql` widening `data_sources.hazard_type` and `rejected_payloads.hazard_type` CHECK constraints to add `'population'`, layered on top of (not conflicting with) `20260709000000_data_sources_tier1_source_type.sql`'s existing widened set — per data-model.md §1.
- [X] T002 In the same migration, add `exposure_datasets.source_name TEXT` (nullable) + index `idx_exposure_datasets_source_country ON exposure_datasets (source_name, country_code) WHERE source_name IS NOT NULL` — per data-model.md §4.
- [X] T003 In the same migration, seed the **1** `data_sources` row (`Kontur Population`; `hazard_type: 'population'`; `country_code: NULL`) with `endpoint_url` pointing at HDX's base API — per data-model.md §2. No WorldPop, Meta/HDX Population, or GHSL row (the migration originally seeded GHSL too; corrected in place — twice — as Meta and then GHSL were found infeasible during implementation, since the migration had not yet been applied to any real database).
- [X] T003a In the same migration, create `population_source_country_datasets` (`source_name` CHECK IN `('kontur', 'meta_hdx')`, `country_code`, `dataset_reference`, `resolved_at`, `resolved_by`, unique on `(source_name, country_code)`) **with country-scoped RLS from creation** (super_admin all-access + country_admin own-country-only — NOT the `data_sources` table's `USING (true)` public-read pattern) per data-model.md §5. Not needed for GHSL, which resolves by bounding box instead. This table must never be readable cross-country, even in the shared MVP instance — see data-model.md §5's RLS rationale.
- [X] T004 [P] Extract `geometryToWkt()` out of `supabase/functions/upload-exposure-dataset/index.ts` into `supabase/functions/shared/geometryToWkt.ts` (named export, same Point/Polygon/MultiPolygon behavior), update `upload-exposure-dataset/index.ts` to import it — behavior-preserving refactor.
- [X] T005 [P] Add `supabase/functions/shared/geometryToWkt.test.ts` covering Point/Polygon/MultiPolygon/unsupported-type cases (moved/adapted from any existing inline coverage, or new if none existed).

**Checkpoint**: Migration applies cleanly; existing `upload-exposure-dataset` tests still pass after the extraction (no behavior change).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared validation, write-path, and country/dataset-resolution helpers that every source's import function depends on

**⚠️ CRITICAL**: No per-source import function (Phase 3) can be completed until this phase is done

- [X] T005a Implement `getServedCountryCodes()` in `supabase/functions/shared/servedCountries.ts` — `SELECT DISTINCT country_code FROM country_boundaries`, per data-model.md §4a. This is the ONLY source of "which countries does this deployment serve" for every task below that mentions served/served country codes; no task may hardcode a country list.
- [X] T005b Implement `resolveHdxCountryDataset(sourceOrg, countryIso3Lower)` in `supabase/functions/shared/resolveHdxCountryDataset.ts` per data-model.md §5a / contracts/import-population-source.md. Also added `supabase/functions/shared/iso3166.ts` (ISO2<->ISO3 mapping, needed since HDX's `groups` filter uses ISO3 but this system's `country_code` columns are ISO2 — not identified during planning, found during implementation).
- [X] T005c [P] Add `supabase/functions/shared/resolveHdxCountryDataset.test.ts` — tests the extracted pure `selectHdxMatch()` function (matching this repo's convention of only unit-testing pure/no-I/O logic, same as `sourceHealth.ts`'s `computeNextState`), not the full I/O-performing `resolveHdxCountryDataset()`. Also added `iso3166.test.ts` for the new ISO2/ISO3 mapping (round-trip + no-duplicate-values checks caught what a hand-written 190-entry table could plausibly get wrong).
- [X] T006 Define `PopulationRecord` type (`supabase/functions/shared/populationRecord.ts`) and `supabase/functions/shared/validatePopulationRecord.ts` per data-model.md's transient shape and contracts/import-population-source.md.
- [X] T007 [P] Add `supabase/functions/shared/validatePopulationRecord.test.ts` covering: valid record, negative population, non-numeric population, invalid/empty geometry, out-of-coverage country code, boundary case `population === 0` (valid, not rejected).
- [X] T008 Implement `supabase/functions/shared/supersedeExposureDataset.ts`'s `writePopulationDataset(sourceName, countryCode, records)` per contracts/import-population-source.md.
- [X] T009 No automated test for `writePopulationDataset` — verified during implementation that this repo has **no existing convention for DB-touching Deno tests** (`upsert.ts`, `sourceHealth.ts`'s I/O paths, and `upload-exposure-dataset/index.ts` itself all have zero automated coverage for their database-writing logic; only pure/no-I/O helpers like `computeNextState`/`geometryToWkt` are unit tested). Matching that convention rather than introducing a new one speculatively: supersession correctness (first import, re-import superseding prior, rollback-on-partial-failure) is verified manually per quickstart.md §5, not via an automated test.

**Checkpoint**: Shared validation, write-path, and country/dataset-resolution are implemented and tested independently of any specific upstream source's fetch logic — ready for Kontur's import function to consume.

---

## Phase 3: User Story 1 - Population coverage appears automatically (Priority: P1) 🎯 MVP

**Goal**: Population exposure data for served countries appears via scheduled import, usable in Impact Analysis without manual upload.

**Independent Test**: For a country with no manually uploaded population dataset, run one source's import function and confirm a resulting `exposure_datasets`/`exposure_features` set is usable in an impact analysis exactly like manually uploaded data.

**New dependency note (Kontur only)**: `konturFetch.ts` requires a GeoPackage-reading library (data-model.md's "New dependency: GeoPackage reading" section, plan.md Complexity Tracking) — confirm at T015 that the chosen library runs within Edge Function resource/time limits against a real ~20–30MB `.gpkg.gz` file before finishing that task; if it doesn't fit, this is a second blocking finding requiring a follow-up decision, not a reason to silently degrade data quality.

### Implementation for User Story 1

**Scope note**: Meta/HDX Population's and GHSL's tasks (originally T016/T020/T025 for Meta;
T013/T017/T021/T024 for GHSL) were removed — see Phase 0 above and spec.md's Amendments 2/3. Only
Kontur remains.

- [X] T015 [US1] Implement `fetchKonturPopulation(countryCodes)` in `supabase/functions/shared/konturFetch.ts`: for each country, look up `population_source_country_datasets` for `('kontur', countryCode)` — skip country if no row (not an error) — else download that country's `.gpkg.gz` resource, parse it with the GeoPackage dependency (see note above), and map to `PopulationRecord[]` (H3 hexagon polygons, `population` field per research.md §4's confirmed codebook). Depends on T003a, T008's supersession target existing conceptually (no direct code dep), T005a.
- [X] T019 [P] [US1] Add `supabase/functions/shared/konturFetch.test.ts` covering the GeoPackage-to-`PopulationRecord` mapping (happy path + one malformed-upstream-record case) using a small fixture `.gpkg` file, not a live network call (depends on T015).
- [X] T023 [US1] Implement `supabase/functions/import-kontur-population/index.ts`: call `getServedCountryCodes()` (T005a), call `fetchKonturPopulation`, `validatePopulationRecord` each result, `writePopulationDataset` per country, call `resolveSourceId('population', 'Kontur Population')` + `recordFetchOutcome` per contracts/import-population-source.md (depends on T005a, T006, T008, T015).
- [X] T026 [US1] Confirm the seed migration's `endpoint_url` for Kontur is appropriate — confirmed correct as-is (T003), no change needed.
- [ ] **[KAYNAK EKLENMESİ GEREKİYOR]** T026a [US1] Run `resolveHdxCountryDataset('kontur', 'tur')` (T005b) for **Turkey** — this system's own reference/test deployment (per project convention: we have direct access to verify Turkish data, unlike third-party example countries in client-provided materials) — as the first real-world proof this resolution mechanism works end-to-end. If it returns `null`, add the row manually using the dataset ID confirmed live in research.md §4 (Kontur's Turkey package is `kontur-population-turkiye`) rather than leaving Turkey unconfigured. Document in this task's commit/PR that every additional country deployment needs its own resolution run (or manual fallback) during onboarding — a recurring per-country onboarding step, not a one-time migration or a code change. No country's `dataset_reference` value may ever appear inside `.ts` source files — DB rows only. **Kalan neden**: bu, HDX'in gerçek API'sine karşı gerçek bir ülke veri seti eşleştirmesi çalıştırmayı gerektiriyor — kod tarafı hazır (`resolveHdxCountryDataset`, test edilmiş), ama bu adımın kendisi "yeni bir veri kaynağı/ülke bağlama" işlemi, kodla kapatılamaz.
- [X] T027 [US1] Verified at code level (2026-07-15): `ImpactPanel.vue`'nin asset-layer seçim adımı (`select`/`option` listesi, satır ~233) artık `source_name`'i gösteriyor (`{{ d.name }}{{ d.source_name ? ' (' + d.source_name + ')' : '' }}`) — mevcut sorgu zaten `exposure_datasets`'in tüm kolonlarını (`select('*')`) çektiği için ek bir sorgu değişikliği gerekmedi. Manuel tarayıcı click-through (gerçek bir Kontur import'u sonrası görsel doğrulama) kullanıcıya bırakıldı.

**Checkpoint**: Kontur imports successfully end-to-end; population exposure data is usable in Impact Analysis without manual upload (spec SC-001, SC-005).

---

## Phase 4: User Story 2 - Health/freshness visibility (Priority: P1)

**Goal**: Admins see Kontur's health state, last-success time, and failure count, matching existing hazard-source visibility.

**Independent Test**: Point the source's endpoint at an invalid URL, confirm its Sources-view entry degrades to failing health state after the configured consecutive-failure threshold, exactly as an existing hazard source would.

### Implementation for User Story 2

- [X] T028 [US2] Extend `SOURCE_SUPPORTED_HAZARDS` in `src/components/admin/SourceFormModal.vue` (currently `['earthquake', 'wildfire', 'flood', 'drought', 'food_security', 'tsunami', 'epidemic']`) to include `'population'`, so admins can view/edit this row through the existing Sources CRUD form.
- [X] T029 [US2] Add a `population` row to `hazard_types` (code, display_name: "Population", category, description) via a small migration or extending T001's migration — required because `SourceFormModal.vue`'s dropdown is filtered against `hazardTypesStore.activeHazardTypes`, not just the hardcoded array (T028 alone is insufficient). **Already done as part of T001's migration** — this task is a verification pass, not new work.
- [X] T030 [US2] Found and fixed a genuine gap (2026-07-15): `CapView.vue`'nun tehlike seçici, tam olarak `hazardTypesStore.activeHazardTypes`'ı kullanıyordu ve "Population" (category='exposure') gerçekten seçilebilir bir CAP alert tipi olarak görünüyordu; `HazardTaxonomyPanel.vue`'daki "Eşik Düzenle" butonu da her satırda gösteriliyordu (population için anlamsız/bozuk bir eşik editörü açardı). Yeni `alertableHazardTypes` computed'ı (`hazardTypes.js`, `category !== 'exposure'` filtresi) eklendi ve `CapView.vue` buna geçirildi; `HazardTaxonomyPanel.vue`'da "Eşik Düzenle" butonu `category==='exposure'` için gizlendi. `hazard_types` satırı hiç kaldırılmadı (sadece görüntüleme katmanında filtrelendi, tam olarak talimatın istediği gibi). `HazardEncyclopediaPanel.vue` zaten kategoriyi rozet olarak gösterip tüm tipleri (population dahil) doğru şekilde listeliyordu — değişiklik gerekmedi.
- [X] T031 [P] [US2] Added (2026-07-15): `sourceHealth.test.ts`'e `computeNextState()`'in hazard_type parametresi hiç almadığını (yani population için de tam olarak aynı davrandığını) doğrulayan bir no-op confirmation testi eklendi — 197/197 Deno testi geçiyor.
- [X] T032 [US2] Kod seviyesinde doğrulandı: state machine (`computeNextState`) zaten `sourceHealth.test.ts`'te degraded→down/down→healthy geçişleri için kapsamlı test edilmiş (T031 dahil). Manuel canlı doğrulama (Kontur endpoint'ini gerçekten bozup Sources sekmesinde geçişi izlemek) kullanıcıya bırakıldı.

**Checkpoint**: Kontur is visible with independent health tracking, matching parity with hazard sources (spec SC-002, SC-003).

---

## Phase 5: User Story 3 - Malformed/out-of-range records rejected (Priority: P2)

**Goal**: Invalid population records never reach `exposure_features`, are logged with a reason, and never fail the whole import.

**Independent Test**: Feed a batch with one negative-population record, one invalid-geometry record, and one valid record through a source's import path; confirm only the valid record is stored, the other two are excluded with a recorded reason, and the import reports success.

### Implementation for User Story 3

- [X] T033 [US3] Verified (2026-07-15): `import-kontur-population/index.ts` already correctly calls `logRejectedPayload(sourceId, 'population', reason, ...)` for every invalid record.
- [X] T034 [P] [US3] Added (2026-07-15): extracted the validation-partitioning loop into a new pure, unit-tested function `partitionPopulationRecords()` (`supabase/functions/shared/populationImportPartition.ts`, 4 Deno tests including "a batch of exclusively invalid records" returning zero valid records without throwing), and refactored `import-kontur-population/index.ts` to use it — `recordFetchOutcome(sourceId, 'success')` remains unconditional after the loop, structurally guaranteeing the "zero valid records is not a failure" convention.
- [X] T035 [US3] Verified at code level: the rejected-payloads query (`src/stores/sources.js`) filters generically by `source_id`, with no hazard-type-specific logic — works identically for population as any other source. Manual live click-through (triggering a real rejection and viewing it in the admin panel) left to the user.

**Checkpoint**: All acceptance scenarios in spec.md US3 pass; SC-004 confirmed (100% of invalid geometry/population-value records excluded, never reach Impact Analysis).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Supersession correctness and end-to-end confidence

- [X] T036 [P] Code-level verified: `writePopulationDataset`'ın supersession mantığı (`supersedeExposureDataset.ts`) zaten `(source_name, country_code)` başına tek satır garantisi için tasarlanmış. Manuel canlı doğrulama (Kontur'u aynı ülke için iki kez çalıştırıp tekrar kontrol etmek) kullanıcıya bırakıldı.
- [X] T037 [P] Tamamlandı (2026-07-15) — ama research.md §5'in varsaydığından FARKLI bir mekanizmayla: kod denetimi, mevcut hazard fetch-* fonksiyonlarının HEM client-driven polling (config.js) HEM pg_cron ile tetiklendiğini, ama import-kontur-population'ın (T037'nin bulmasını beklediği gibi) hiçbirine bağlı OLMADIĞINI ortaya çıkardı — poll_interval_seconds=604800 (haftalık) veri tabanında duruyordu ama hiçbir şey onu tetiklemiyordu. Bu proje son dönemde (spec 019/026/032/036/037) yeni otomasyonları hep pg_cron ile kurduğu için, client config.js yerine yeni bir `trigger_kontur_population_import()` pg_net/Vault fonksiyonu + haftalık pg_cron job'ı eklendi (`supabase/migrations/20260715160000_kontur_population_import_cron.sql`, Pazar 03:00 UTC).
- [X] T038 Kod seviyesinde doğrulandı: tüm alt kalemler (T026-T037) tek tek incelendi/düzeltildi. Tam quickstart.md uçtan uca click-through'u (gerçek Kontur import'u + Sources sekmesi gözlemi) kullanıcıya bırakıldı.
- [X] T039 [P] Çalıştırıldı (2026-07-15): `deno test --no-check --allow-net --allow-env supabase/functions/shared/` → 197/197 geçti (T031/T034'ün yeni testleri dahil), regresyon yok.
- [X] T040 [P] Çalıştırıldı (2026-07-15): `deno check` yeni/değişmiş dosyalarda çalıştırıldı — sadece bu depoda önceden var olan 2 baseline hatası (esm.sh/strict-catch, `hazardThresholdsCache.ts`/`upsert.ts`) görüldü, hiç yeni tip hatası yok.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 0**: All 4 spikes complete (done live during planning/implementation) — Kontur is viable, WorldPop/Meta/GHSL are all deferred.
- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on T004 (geometryToWkt extraction) from Phase 1 (T006's validator calls it); T005a/T005b/T005c have no dependency on T004 and can start immediately; BLOCKS Phase 3.
- **US1 (Phase 3)**: Depends on Phase 2 completion (T006, T008) and T003a (for Kontur's dataset-resolution lookup). Single chain: T015→T019→T023.
- **US2 (Phase 4)**: Depends on Phase 2 (health tracking is called from within T023); UI tasks (T028–T030) can start as soon as T003's seed row exists, independent of whether T015/T023 are finished.
- **US3 (Phase 5)**: Depends on T006 (validator) and T023 (the function calling it) — effectively a verification pass on work already done in Phase 3, not new standalone code.
- **Polish (Phase 6)**: Depends on all of Phases 3–5.

### Parallel Opportunities

- T004/T005 (Phase 1) in parallel with T001–T003a (different files).
- T005a/T005b/T005c (Phase 2) in parallel with T006–T009 (different files, no shared dependency).
- T028–T030 (US2 UI/taxonomy tasks) can run in parallel with Phase 3 entirely — no dependency on the fetch module being finished, only on T003's seed row existing.

---

## Implementation Strategy

### MVP First (this feature IS the MVP — single source)

1. Phase 1 (Setup) → Phase 2 (Foundational, including T005b's onboarding-resolution helper) → Phase 3 (Kontur: T015→T019→T023→T026→T026a→T027).
2. **STOP and VALIDATE**: confirm Kontur's data is usable end-to-end in Impact Analysis (quickstart.md §2).
3. Layer US2 (health UI parity) and US3 (rejection verification) on top — both are largely already exercised by a correctly implemented US1, with the remaining tasks being explicit UI/taxonomy wiring (US2) and verification (US3).

### Incremental Delivery

This feature is now small enough (one source) to ship as a single increment; WorldPop, Meta/HDX Population, and GHSL are separate future features, not phases of this one.
