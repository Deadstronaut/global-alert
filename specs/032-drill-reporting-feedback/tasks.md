---
description: "Task list for Tatbikat Raporlama ve Geri Bildirim Döngüsü (spec 032)"
---

# Tasks: Tatbikat Raporlama ve Geri Bildirim Döngüsü

**Input**: Design documents from `/specs/032-drill-reporting-feedback/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: `computeDrillReportSummary()` Deno tarafında `.test.ts` ile test edilir (proje convention'ı, `incidentReportSummary.test.ts` deseni). Frontend tarafında yeni saf fonksiyon yok (export flatten mantığı doğrudan component içinde, mevcut `downloadComplianceReport()`/`downloadIncidentReport()` deseniyle aynı — ayrı test gerektirmiyor).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/functions/`, `supabase/migrations/` at repository root.

---

## Phase 1: Setup

*(none — no new dependencies/project scaffolding needed)*

---

## Phase 2: Foundational (Blocking Prerequisites)

*(none — 3 user story bağımsız çalışabilir; migration'ın parçaları US2/US3'ün kendi fazlarında, birbirini bloklamadan sıralı olarak aynı dosyaya eklenir)*

---

## Phase 3: User Story 1 - Bir yönetici, tek bir tatbikatın özetini dışa aktarabilir (Priority: P1) 🎯 MVP

**Goal**: Tamamlanmış bir tatbikatın özeti (süre, uyarı sayısı, tepki süresi, onay oranı) CSV/JSON olarak indirilebilir.

**Independent Test**: Tamamlanmış bir tatbikat için "Özeti Dışa Aktar" tetiklenir, indirilen dosyanın tüm alanları (veri yoksa "veri yok" ile) içerdiği doğrulanır (quickstart.md Senaryo 1).

### Implementation for User Story 1

- [X] T001 [US1] In `src/views/AdminView.vue`: mevcut `downloadComplianceReport()`/`downloadIncidentReport()` desenini izleyen yeni bir `downloadDrillSummary(drill, format)` fonksiyonu ekle — `drill.summary`'yi (`duration_min`, `alerts_issued`, `response_time_seconds` — null ise `'veri yok'` string'i, `ack_rate` — null ise `'veri yok'`, doluysa `acknowledged/sent`) flat satırlara çevirip mevcut `rowsToCsv`/`rowsToJson`/`triggerDownload` ile indirir (dosya adı: `drill-summary-${drill.id}.csv`/`.json`)
- [X] T002 [US1] In `src/views/AdminView.vue`'nun `drill-card` şablonunda (~satır 1267 civarı, mevcut `d.summary` gösterimi): `d.status === 'completed'` olan kartlara "Özeti Dışa Aktar" (CSV/JSON) butonları ekle, `downloadDrillSummary(d, 'csv'/'json')` çağırır

**Checkpoint**: User Story 1 fully functional and independently testable — herhangi bir tamamlanmış tatbikatın özeti dışa aktarılabiliyor.

---

## Phase 4: User Story 2 - Bir yönetici, belirli bir yıl için tüm tatbikatların toplu performans raporunu görebilir (Priority: P2)

**Goal**: Yıl bazında toplulaştırılmış bir tatbikat performans raporu otomatik üretilir ve dışa aktarılabilir.

**Independent Test**: `computeDrillReportSummary()` birim testleri + canlıda `generate-drill-report` çağrıldığında bir `drill_reports` kaydı oluştuğu, tekrar çağrıldığında ikinci kayıt oluşmadığı doğrulanır (quickstart.md Senaryo 2).

### Implementation for User Story 2

- [X] T003 [US2] Create `supabase/migrations/<timestamp>_drill_reporting_feedback.sql`: `drill_reports` tablosu (`id, period_start, period_end, summary JSONB, generated_at`, `CHECK(period_end > period_start)`, `UNIQUE(period_start, period_end)`) — data-model.md, `incident_reports`'un birebir yapısal ikizi; RLS `super_admin_read_drill_reports` (SELECT only, INSERT/UPDATE/DELETE policy yok)
- [X] T004 [P] [US2] Create `supabase/functions/shared/drillReportSummary.ts`: `computeDrillReportSummary(drills)` saf fonksiyonu — data-model.md'deki imzaya göre `total_drills`, `avg_response_time_seconds` (null olanları hariç tutarak, research.md Decision 3), `avg_ack_rate` (aynı mantık), `by_scenario_type`
- [X] T005 [P] [US2] Create `supabase/functions/shared/drillReportSummary.test.ts`: (a) normal durum — birden fazla tatbikat, tüm metrikler doğru hesaplanıyor, (b) tüm tatbikatlarda `response_time_seconds=null` → `avg_response_time_seconds=null`, (c) tüm tatbikatlarda `ack_rate=null` → `avg_ack_rate=null`, (d) karışık (bazıları null bazıları dolu) → sadece dolu olanlar ortalamaya dahil, (e) `by_scenario_type` doğru grupluyor, `scenario_type=null` olanlar `'unknown'` altında toplanıyor, (f) boş dizi → `total_drills=0`, tüm ortalamalar `null`
- [X] T006 [US2] Create `supabase/functions/generate-drill-report/index.ts`: `generate-incident-report/index.ts`'in birebir yapısal ikizi — `mostRecentElapsedYear()` aynı, `drill_sessions`'tan `status='completed' AND ended_at` yıl aralığında olanları çeker, `computeDrillReportSummary()` ile toplulaştırır, `drill_reports`'a `ON CONFLICT (period_start, period_end) DO NOTHING` ile upsert eder (contracts/generate-drill-report.md)
- [X] T007 [US2] Aynı migration dosyasında (`<timestamp>_drill_reporting_feedback.sql`): `trigger_drill_report_generation()` fonksiyonu (spec 019/026 deseninin kopyası, `pg_net.http_post()` ile `generate-drill-report`'u çağırır) + `pg_cron.schedule('generate-drill-report-yearly', '10 0 1 1 *', ...)` kaydı
- [X] T008 [US2] In `src/views/AdminView.vue`: mevcut `loadIncidentReports()`'un yanına `drillReports`/`drillReportsLoading` ref'leri + `loadDrillReports()` fonksiyonu (salt-okunur `drill_reports` select), yeni "Yıllık Tatbikat Raporları" alt bölümü (mevcut "Yıllık Olay Raporları" alt bölümünün yanına, ~satır 1611 civarı). **Not (analiz bulgusu F1)**: yıllık rapor özeti (`total_drills`/`avg_response_time_seconds`/`avg_ack_rate`/`by_scenario_type`) tekil tatbikat özetinden (T001'in `duration_min`/`alerts_issued`/vb.) yapısal olarak farklı — T001'in flatten FONKSİYONU değil, sadece aynı `rowsToCsv`/`rowsToJson`/`triggerDownload` ÇAĞRI DESENİ (mevcut `downloadComplianceReport()`/`downloadIncidentReport()` deseniyle aynı) burada da kullanılır; bu rapor tipi için ayrı bir `downloadDrillReport(report, format)` flatten fonksiyonu yazılır

**Checkpoint**: User Story 2 fully functional and independently testable — yıllık tatbikat performans raporu otomatik üretiliyor ve dışa aktarılabiliyor.

---

## Phase 5: User Story 3 - Bir yönetici, tatbikat sonrası ders çıkarımını kaydedip isteğe bağlı bir eşik değişikliği önerisine bağlayabilir (Priority: P3)

**Goal**: Tamamlanmış bir tatbikata serbest metin bir ders-çıkarımı notu + isteğe bağlı afet tipi ilişkilendirmesi eklenebilir, ilişkilendirilirse eşik düzenleyicisine bir bağlantı gösterilir.

**Independent Test**: Bir nota afet tipi ilişkilendirilir, tatbikat özetinde göründüğü ve eşik düzenleyicisine giden bağlantının çalıştığı doğrulanır (quickstart.md Senaryo 3).

### Implementation for User Story 3

- [X] T009 [US3] Aynı migration dosyasında (`<timestamp>_drill_reporting_feedback.sql`): `ALTER TABLE drill_sessions ADD COLUMN IF NOT EXISTS lessons_learned TEXT;` ve `ALTER TABLE drill_sessions ADD COLUMN IF NOT EXISTS related_hazard_type TEXT REFERENCES hazard_types(code) ON DELETE SET NULL;` (data-model.md)
- [X] T010 [US3] In `src/views/AdminView.vue`'nun `drill-card` şablonunda: `d.status === 'completed'` olan kartlara bir `lessons_learned` textarea + mevcut `hazardTypesStore`'dan beslenen bir `related_hazard_type` dropdown (isteğe bağlı, boş bırakılabilir) + "Kaydet" butonu ekle — kaydetme `supabase.from('drill_sessions').update({ lessons_learned, related_hazard_type }).eq('id', d.id)` ile yapılır (mevcut `drills`/`endDrill` deseniyle aynı, store'suz doğrudan-client çağrısı). **Not (analiz bulgusu E1/E2)**: bu güncelleme yeni bir yetkilendirme yolu AÇMAZ ve yeni bir loglama mekanizması GEREKTİRMEZ — `drill_sessions`'ın mevcut `super_admin_drill_all`/`country_admin_drill_own` RLS policy'leri bu kolonları da otomatik kapsıyor (FR-009), mevcut `audit_drill_sessions` trigger'ı (`log_table_change()`) bu UPDATE'i otomatik logluyor (FR-008).
- [X] T011 [US3] Aynı şablonda: `d.related_hazard_type` doluysa, "Eşik Düzenleyiciye Git" bağlantısı göster — tıklanınca `tab.value = 'hazardTaxonomy'` yapar (aynı sayfa içi sekme geçişi, route değişikliği yok)

**Checkpoint**: User Story 3 fully functional and independently testable — ders-çıkarımı notları kaydediliyor, eşik düzenleyicisine bağlantı çalışıyor, audit_log otomatik loglanıyor (yeni kod gerektirmeden, mevcut `audit_drill_sessions` trigger'ı).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T012 [P] Add i18n coverage for new UI text ("Özeti Dışa Aktar" butonu, "Yıllık Tatbikat Raporları" başlığı/boş durum metni, ders-çıkarımı textarea etiketi, "Eşik Düzenleyiciye Git" bağlantı metni) across all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T013 Run `npm run test` and confirm all existing frontend tests pass with no regressions
- [X] T014 Run `npm run build` and confirm a clean build
- [X] T015 (Opsiyonel, Deno kuruluysa) Run `deno test supabase/functions/shared/drillReportSummary.test.ts` and confirm all pass
- [X] T016 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Preparedness, Drill & Response modülünün MHEWS-SD-DRILL-02/MHEWS-FR-0033/"After-Action Feedback Loop" gereksinimleri artık kapandı — tamamlanma yüzdesini ve anlatıyı güncelle

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 3)**: No dependencies — can proceed first
- **User Story 2 (Phase 4)**: No dependencies — independent of US1, though its export button (T008) reuses the flatten pattern established in T001
- **User Story 3 (Phase 5)**: No dependencies — tamamen ayrı kolonlar/UI, migration'daki ekleme hariç bağımsız
- **Polish (Phase 6)**: Depends on all user stories being complete

### Parallel Opportunities

- T004/T005 (US2, drillReportSummary) T001/T002 (US1) ile paralel yazılabilir
- T009-T011 (US3) diğer tüm task'larla paralel yazılabilir (farklı kolonlar/UI bölümü)
- T012 (i18n) T013/T014/T015 ile paralel çalışabilir

---

## Implementation Strategy

### MVP First

1. Complete Phase 3: User Story 1 (tekil export) — MHEWS-SD-DRILL-02'yi kapatır
2. **STOP and VALIDATE**: quickstart.md Senaryo 1

### Incremental Delivery

3. Complete Phase 4: User Story 2 (yıllık rapor) — MHEWS-FR-0033'ü kapatır
4. **STOP and VALIDATE**: quickstart.md Senaryo 2
5. Complete Phase 5: User Story 3 (ders-çıkarımı) — "After-Action Feedback Loop"u kapatır
6. **STOP and VALIDATE**: quickstart.md Senaryo 3
7. Complete Phase 6: Polish (i18n/test/build/docs)

---

## Notes

- Tek migration dosyası (`<timestamp>_drill_reporting_feedback.sql`), T003/T007/T009'da sırayla genişletilir
- `drill_sessions`'ın mevcut RLS'i, state machine'i, audit trigger'ı hiç değişmez (additive)
- Commit only when explicitly requested by the user
