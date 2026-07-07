---
description: "Task list for SOP Repository Sürümleme, Kategori ve Arama (spec 033)"
---

# Tasks: SOP Repository Sürümleme, Kategori ve Arama

**Input**: Design documents from `/specs/033-sop-versioning-search/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: `filterSopDocuments()` Vitest ile mock'suz test edilir (proje convention'ı). Trigger'ın DB-seviyesi davranışı (sürüm oluşturma/oluşturmama) canlıda transactional test ile doğrulanır — ayrı bir otomatik test dosyası gerektirmez (spec 028/029/030'daki convention).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/`, `tests/unit/` at repository root.

---

## Phase 1: Setup

*(none — no new dependencies/project scaffolding needed)*

---

## Phase 2: Foundational (Blocking Prerequisites)

*(none — 2 user story bağımsız çalışabilir; migration'ın parçaları kendi fazlarında, birbirini bloklamadan sıralı olarak aynı dosyaya eklenir)*

---

## Phase 3: User Story 1 - Bir yönetici, SOP'ları kategoriye göre filtreleyip arayabilir (Priority: P1) 🎯 MVP

**Goal**: SOP Repository listesi kategoriye göre filtrelenebilir ve başlığa göre aranabilir.

**Independent Test**: `filterSopDocuments()` birim testleri + canlıda farklı kategorilerde SOP'lar oluşturulup filtre/arama uygulanması (quickstart.md Senaryo 1).

### Implementation for User Story 1

- [X] T001 [US1] Create `supabase/migrations/<timestamp>_sop_versioning_search.sql`: `ALTER TABLE sop_documents ADD COLUMN IF NOT EXISTS category TEXT;` (data-model.md) — bu migration dosyası T005/T006'da da genişletilecek (aynı dosya, sıralı ekler)
- [X] T002 [P] [US1] Create `src/services/sopFilter.js`: `filterSopDocuments(sopDocuments, { category, searchTerm })` saf fonksiyonu — data-model.md'deki mantığa göre (kategori tam eşleşme + boşsa hepsi, arama başlıkta case-insensitive kısmi eşleşme + boşsa hepsi, ikisi birlikte AND)
- [X] T003 [P] [US1] Create `tests/unit/sopFilter.test.js`: (a) sadece kategori filtresi uygulanmış durum, (b) sadece arama terimi uygulanmış durum, (c) her ikisi birlikte, (d) `category`/`searchTerm` boş/undefined → tüm SOP'lar döner, (e) kategorisi null olan bir SOP, kategori filtresi boşken listede kalır
- [X] T004 [US1] In `src/components/admin/SopRepositoryPanel.vue`: kategori dropdown/datalist (mevcut `store.sopDocuments`'tan türetilen benzersiz kategoriler + serbest metin girişi) + arama input'u ekle; `filterSopDocuments()` ile listeyi filtrele (tablo `v-for`'unu filtrelenmiş diziye bağla); `SopDocumentFormModal.vue`'ya (veya doğrudan panel formuna) `category` alanı ekle

**Checkpoint**: User Story 1 fully functional and independently testable — SOP'lar kategoriye göre filtrelenebiliyor ve başlığa göre aranabiliyor.

---

## Phase 4: User Story 2 - Bir yönetici, bir SOP'un önceki sürümlerini görüntüleyebilir (Priority: P2)

**Goal**: İçerik-etkileyen bir SOP güncellemesi önceki hâli kalıcı olarak saklar; bir yönetici geçmiş sürümleri görüntüleyebilir.

**Independent Test**: Bir SOP güncellenir, `sop_document_versions`'a kayıt eklendiği ve `version`'ın arttığı doğrulanır; sadece `is_active` değişimi yeni sürüm oluşturmadığı doğrulanır (quickstart.md Senaryo 2).

### Implementation for User Story 2

- [X] T005 [US2] Aynı migration dosyasında (`<timestamp>_sop_versioning_search.sql`): `ALTER TABLE sop_documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;` + `sop_document_versions` tablosu (`id, sop_document_id, version, title, body_content, reference_url, archived_at`, FK `ON DELETE CASCADE`) — data-model.md; RLS: SELECT policy'leri `sop_documents`'ınkiyle aynı yetkilendirmeyi mirror eder (super_admin VEYA `current_profile_has_capability('sop_repository')` VEYA ilgili SOP `is_active`), hiçbir role INSERT/UPDATE/DELETE policy'si yok
- [X] T006 [US2] Aynı migration dosyasında: `archive_sop_document_version()` `SECURITY DEFINER` trigger fonksiyonu (data-model.md'deki tam SQL) — `title`/`body_content`/`reference_url`'den herhangi biri değiştiğinde `OLD`'u `sop_document_versions`'a kopyalar ve `NEW.version`'ı artırır; sadece `is_active` değişimi hiçbir şey yapmaz (FR-006); `BEFORE UPDATE ON sop_documents` trigger'ı olarak bağlanır
- [X] T007 [US2] In `src/stores/sopDocuments.js`: yeni `fetchSopDocumentVersions(sopDocumentId)` — `sop_document_versions`'ı `sop_document_id` ile filtreleyip `archived_at DESC` sıralı döner (salt-okunur, mevcut `fetchSopDocuments()` deseniyle aynı hata-yönetimi)
- [X] T008 [US2] In `src/components/admin/SopRepositoryPanel.vue`: her SOP satırına "Geçmiş Sürümler" bağlantısı/butonu ekle — tıklanınca `fetchSopDocumentVersions()` çağırıp bir liste/modal gösterir (versiyon numarası, başlık, arşivlenme tarihi); hiç sürüm yoksa "henüz geçmiş sürüm yok" mesajı göster

**Checkpoint**: User Story 2 fully functional and independently testable — SOP güncellemeleri sürümleniyor, geçmiş sürümler görüntülenebiliyor.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T009 [P] Add i18n coverage for new UI text (kategori filtresi/arama etiketleri, "Geçmiş Sürümler" başlığı/boş durum metni, sürüm numarası/arşivlenme tarihi etiketleri) across all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T010 Run `npm run test` and confirm all existing frontend tests pass with no regressions
- [X] T011 Run `npm run build` and confirm a clean build
- [X] T012 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Incident Tracking modülünün MHEWS-FR-0275/MHEWS-FR-0184 gereksinimleri artık kapandı — tamamlanma yüzdesini ve anlatıyı güncelle

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 3)**: No dependencies — can proceed first
- **User Story 2 (Phase 4)**: No dependencies — independent of US1, aynı migration dosyasına ek yapıyor (sıralı, T001'den sonra T005/T006)
- **Polish (Phase 5)**: Depends on both user stories being complete

### Parallel Opportunities

- T002/T003 (US1) T005/T006 (US2, SQL) ile paralel yazılabilir
- T009 (i18n) T010/T011 ile paralel çalışabilir

---

## Implementation Strategy

### MVP First

1. Complete Phase 3: User Story 1 (kategori/arama) — MHEWS-FR-0184'ü kapatır
2. **STOP and VALIDATE**: quickstart.md Senaryo 1

### Incremental Delivery

3. Complete Phase 4: User Story 2 (sürüm geçmişi) — MHEWS-FR-0275'i kapatır
4. **STOP and VALIDATE**: quickstart.md Senaryo 2
5. Complete Phase 5: Polish (i18n/test/build/docs)

---

## Notes

- Tek migration dosyası (`<timestamp>_sop_versioning_search.sql`), T001/T005/T006'da sırayla genişletilir
- `sop_documents`'ın mevcut RLS'i, hazard-tipi eşleştirme mantığı, incident entegrasyonu hiç değişmez (additive)
- Commit only when explicitly requested by the user
