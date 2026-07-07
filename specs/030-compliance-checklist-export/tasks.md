---
description: "Task list for Uyumluluk Kontrol Listesi Export'u ve Şablon Versiyonlama (spec 030)"
---

# Tasks: Uyumluluk Kontrol Listesi Export'u ve Şablon Versiyonlama

**Input**: Design documents from `/specs/030-compliance-checklist-export/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: `buildComplianceChecklist()` saf fonksiyonu Vitest ile mock'suz test edilir (research.md Decision 4); AdminView.vue'daki UI entegrasyonu için ayrı test yok (proje convention'ı).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `tests/unit/` at repository root. Bu spec migration İÇERMEZ.

---

## Phase 1: Setup

*(none — no new dependencies/project scaffolding needed)*

---

## Phase 2: Foundational (Blocking Prerequisites)

*(none — User Story 1 and User Story 2 land in the same file (`complianceChecklist.js`) but User Story 1 does not depend on User Story 2 being complete first; TEMPLATE_VERSION constant is trivial and can be added alongside US1)*

---

## Phase 3: User Story 1 - Bir Super Admin, haftalık uyumluluk raporunu madde-madde kontrol listesi olarak dışa aktarır (Priority: P1) 🎯 MVP

**Goal**: Mevcut bir `compliance_reports` kaydından, PRD'nin checklist kriterlerine karşılık gelen 4 maddelik, karşılandı/karşılanmadı durumlu bir kontrol listesi export edilebilir.

**Independent Test**: Bir `compliance_reports` kaydı ve dönem içi dead-letter verisiyle `buildComplianceChecklist()` çağrılır; 4 kriterin doğru durumda (met/unmet) döndüğü doğrulanır; AdminView.vue'da "Kontrol Listesi" butonu tıklanıp indirilen dosyanın bu 4 maddeyi içerdiği doğrulanır (quickstart.md Senaryo 2).

### Implementation for User Story 1

- [X] T001 [US1] Create `src/services/complianceChecklist.js`: `export const TEMPLATE_VERSION = 'v1'` sabiti + `buildComplianceChecklist(report, deadLetterRowsInPeriod)` saf fonksiyonu — data-model.md'deki 4 kriteri (`report_generated_on_time`, `hash_chain_integrity`, `no_pending_dead_letter`, `completeness_constraint_enforced`) research.md Decision 1/2'deki mantığa göre hesaplayıp `{ templateVersion, periodStart, periodEnd, items: [{criterion, status, evidence}] }` döndürür; `report`/`report.summary` eksikse ilgili maddeyi `'unknown'` olarak işaretler (hata fırlatmaz)
- [X] T002 [P] [US1] Create `tests/unit/complianceChecklist.test.js`: `buildComplianceChecklist()` için mock'suz Vitest testleri — (a) tüm kriterler met olan normal durum, (b) `integrity_ok: false` → hash kriterinin unmet olması, (c) dönem içi 1+ dead-letter satırı → ilgili kriterin unmet olması, (d) `generated_at` period_end'den 2 günden fazla sonra → zamanında-üretim kriterinin unmet olması, (e) `report.summary` eksik/null → ilgili maddelerin `'unknown'` olması (hata fırlatılmaması)
- [X] T003 [US1] In `src/views/AdminView.vue`'nun "Geçmiş Raporlar" alt bölümünde (mevcut `downloadComplianceReport()`'un yanına, ~satır 662): `complianceChecklist.js`'den `buildComplianceChecklist`/`TEMPLATE_VERSION` import et; her rapor satırına yeni bir "Kontrol Listesi" export butonu ekle — tıklandığında o rapor için (a) `audit_log_dead_letter`'dan `failed_at` `period_start`/`period_end` aralığında olan satırları çeken salt-okunur bir sorgu yap, (b) `buildComplianceChecklist(report, thoseRows)` çağır, (c) `items` dizisini `rowsToCsv`/`rowsToJson` ile uyumlu flat satırlara çevirip mevcut `triggerDownload` ile indir (dosya adı: `compliance-checklist-${stamp}.csv`/`.json`). **Not (analiz bulgusu E1)**: bu buton yeni bir yetkilendirme yolu AÇMAZ — Super Admin-only erişim tamamen mevcut `/admin` route guard'ı + `compliance_reports`/`audit_log_dead_letter`'ın zaten var olan `super_admin`-only RLS policy'lerine dayanır (FR-005 böylece örtük olarak karşılanır).

**Checkpoint**: User Story 1 fully functional and independently testable — bir Super Admin herhangi bir uyumluluk raporunu kontrol listesi formatında dışa aktarabilir.

---

## Phase 4: User Story 2 - Bir export'un hangi şablon sürümüyle üretildiği her zaman belli olur (Priority: P2)

**Goal**: Kontrol listesi export'u dahil TÜM uyumluluk export'ları (mevcut CSV/JSON dahil) üretildiği andaki şablon sürüm numarasını taşır.

**Independent Test**: Herhangi bir export (kontrol listesi veya mevcut CSV/JSON) üretilir; çıktının `template_version: v1` alanını içerdiği doğrulanır (quickstart.md Senaryo 3).

### Implementation for User Story 2

- [X] T004 [US2] In `src/views/AdminView.vue`'nun mevcut `downloadComplianceReport()` fonksiyonunda (~satır 662-679): `complianceChecklist.js`'den `TEMPLATE_VERSION` import et, `flatRows`'un her satırına `template_version: TEMPLATE_VERSION` alanı ekle (mevcut satır şekli/kolonları bozulmadan, sadece ek bir alan)
- [X] T005 [US2] T003'te eklenen kontrol listesi export'unun flat satırlarına da `template_version: TEMPLATE_VERSION` alanının dahil edildiğini doğrula (zaten `buildComplianceChecklist()`'in döndürdüğü `templateVersion` alanından geliyor olmalı — T001'i gerekirse güncelle)

**Checkpoint**: User Story 2 fully functional and independently testable — tüm uyumluluk export'ları hangi şablon sürümüyle üretildiğini açıkça gösteriyor.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T006 [P] Add i18n coverage for the new "Kontrol Listesi" export button label across all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh) — key: `audit.reports.checklistExport` (veya benzeri, mevcut `audit.reports.*` namespace'ine uygun)
- [X] T007 Run `npm run test` and confirm all existing frontend tests pass with no regressions
- [X] T008 Run `npm run build` and confirm a clean build
- [X] T009 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Audit & Compliance modülünün MHEWS-FR-0067/MHEWS-FR-0071 gereksinimleri artık kapandı — tamamlanma yüzdesini ve anlatıyı güncelle

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 3)**: No dependencies — can proceed first
- **User Story 2 (Phase 4)**: Depends on T001 (`complianceChecklist.js`'in var olması) ve T003 (mevcut `downloadComplianceReport()`'un konumu) — aynı dosyalara ek yapıyor, US1'den sonra gelmeli
- **Polish (Phase 5)**: Depends on both user stories being complete

### Parallel Opportunities

- T002 (test dosyası) T001 ile paralel yazılabilir (aynı anda taslak halinde), ama çalıştırılabilmesi için T001'in tamamlanmış olması gerekir
- T006 (i18n) T007/T008 ile paralel çalışabilir

---

## Implementation Strategy

### MVP First

1. Complete Phase 3: User Story 1 (checklist export) — bu tek başına MHEWS-FR-0067'yi kapatır
2. **STOP and VALIDATE**: quickstart.md Senaryo 1-2

### Incremental Delivery

3. Complete Phase 4: User Story 2 (şablon versiyonu) — MHEWS-FR-0071'i kapatır
4. **STOP and VALIDATE**: quickstart.md Senaryo 3
5. Complete Phase 5: Polish (i18n/test/build/docs)

---

## Notes

- Migration YOK — bu spec tamamen frontend/service-layer (research.md/plan.md'de netleştirildi)
- `compliance_reports`/`audit_log`/`audit_log_dead_letter` şemasına hiçbir değişiklik yapılmaz
- Commit only when explicitly requested by the user
