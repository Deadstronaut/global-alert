---
description: "Task list for Audit & Compliance Gaps (spec 035)"
---

# Tasks: Audit & Compliance Gaps

**Input**: Design documents from `/specs/035-audit-compliance-retention/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: `buildEvidencePackageManifest()`/`computeRetentionExpiry()` Vitest ile mock'suz test edilir (proje convention'ı). DB fonksiyonlarının davranışı (retention enforcement, controlled deletion, security event logging) canlıda transactional test ile doğrulanır — ayrı bir otomatik test dosyası gerektirmez (spec 008/028/029/030 convention'ı).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/`, `tests/unit/` at repository root.

---

## Phase 1: Setup

- [X] T001 Run `npm install jszip` (new client-side dependency for US2's evidence package ZIP export)

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T002 Create `supabase/migrations/<timestamp>_audit_compliance_gaps.sql`: `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS event_category TEXT NOT NULL DEFAULT 'data_change';` + `ADD COLUMN IF NOT EXISTS justification TEXT;` + `ALTER TABLE audit_log ADD CONSTRAINT IF NOT EXISTS chk_audit_event_category CHECK (event_category IN ('data_change','security_event'));` (data-model.md) — bu migration dosyası sonraki tüm task'larda genişletilecek (aynı dosya, sıralı ekler); mevcut satırlar `event_category='data_change'` olarak geriye dönük uyumlu kalır

**Checkpoint**: Şema hazır — US3/US4 bu kolonlara bağımlı, önce tamamlanmalı.

---

## Phase 3: User Story 1 - Yapılandırılabilir veri saklama politikası (Priority: P1) 🎯 MVP

**Goal**: Super_admin, kategori bazlı saklama süresi ve eylemi (arşivle/sil) yapılandırabilir; süresi dolan kayıtlar otomatik işlenir.

**Independent Test**: quickstart.md Senaryo 1 — kısa bir retention süresi tanımlanır, `enforce_retention_policies()` manuel çağrılır, arşivleme/silme ve kendi-kendini-loglama doğrulanır; politikasız kategoride hiçbir şey etkilenmez.

### Implementation for User Story 1

- [X] T003 [US1] Aynı migration dosyasında: `retention_policies` tablosu (`id, category TEXT UNIQUE, retention_days INTEGER CHECK > 0, action TEXT CHECK IN ('archive','delete'), created_by, created_at` — data-model.md), RLS: super_admin-only `FOR ALL`
- [X] T004 [US1] Aynı migration dosyasında: `audit_log_archive` tablosu (audit_log ile aynı sütun şeması, `checksum` düz TEXT olarak — generated column değil) + `dispatch_receipts_archive` tablosu (dispatch_receipts ile aynı sütun şeması); RLS: her ikisi de super_admin-only SELECT
- [X] T005 [US1] Aynı migration dosyasında: `enforce_retention_policies()` `SECURITY DEFINER` fonksiyonu (research.md Decision 7 — tablo sahibi ayrıcalığıyla `audit_log`'un `no_delete_audit`/`no_update_audit` RLS kısıtını atlar) — her `retention_policies` satırı için ilgili kaynak tabloda (`audit_log.created_at` veya `dispatch_receipts.created_at`) süresi dolan satırları bulur; `action='archive'` ise ilgili `*_archive` tabloya kopyalayıp kaynaktan siler, `action='delete'` ise doğrudan siler; her iki durumda da `audit_log`'a `action='retention_enforced', event_category='data_change', new_data={category, affected_count, action}` özet kaydı ekler (FR-003); hiçbir politika olmayan kategoriler hiç etkilenmez (FR-002)
- [X] T006 [US1] Aynı migration dosyasında: `pg_cron.schedule('enforce-retention-policies-daily', '0 2 * * *', $$SELECT enforce_retention_policies();$$)` — mevcut compliance/incident/drill report pg_cron desenine paralel, günlük 02:00 UTC
- [X] T007 [US1] Create `src/components/admin/RetentionPolicyPanel.vue`: super_admin-only, `retention_policies` listesi + yeni politika formu (kategori seçici — sabit liste `['audit_log','dispatch_receipts']`, retention_days input, action seçici); `action='delete'` seçildiğinde geri döndürülemez olduğuna dair uyarı + onay modalı (FR-004)
- [X] T008 [US1] In `src/views/AdminView.vue`: Audit/Denetim sekmesine `RetentionPolicyPanel` bileşenini ekle (mevcut "tüm denetim/uyumluluk araçları Audit sekmesinde" convention'ı, spec 019/026/028/030)

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 2 - Kanıt paketi (Evidence Package) export (Priority: P1) 🎯 MVP

**Goal**: Yayınlanmış bir CAP taslağı için CAP XML + alım kayıtları + denetim kayıtlarını tek bir ZIP'te indirme.

**Independent Test**: quickstart.md Senaryo 2 — yayınlanmış bir taslak için paket indirilir, içerik doğrulanır; alım kaydı olmayan taslakta hata vermeden boş bölüm; yayınlanmamış taslakta buton devre dışı/hata.

### Implementation for User Story 2

- [X] T009 [P] [US2] Create `src/lib/evidencePackage.js`: `buildEvidencePackageManifest({ capDraftId, receiptCount, auditLogCount, generatedAt })` saf fonksiyonu — manifest.json içeriğini üretir (data-model.md)
- [X] T010 [P] [US2] Create `tests/unit/evidencePackage.test.js`: (a) normal değerlerle manifest üretimi, (b) `receiptCount`/`auditLogCount` sıfır olduğunda "veri yok" alanları, (c) eksik `capDraftId` durumunda hata
- [X] T011 [US2] In `src/views/CapView.vue`: yayınlanmış (`status='broadcast'`) bir taslak için "Kanıt Paketi İndir" butonu ekle — tıklanınca `jszip` ile `alert.xml` (mevcut `generateCapXml()`, `src/lib/capExport.js`), `receipts.csv` (mevcut `rowsToCsv()` + `dispatch_receipts` sorgusu), `audit-log.csv` (mevcut `rowsToCsv()` + ilgili `audit_log` sorgusu, `table_name='cap_drafts' AND record_id=<draft.id>` filtresiyle), `manifest.json` (`buildEvidencePackageManifest()`) içeren tek bir `.zip` dosyası oluşturup indirir (FR-005/FR-006); yayınlanmamış taslaklarda buton devre dışı, tıklanırsa "sadece yayınlanmış uyarılar için kullanılabilir" mesajı (FR-007)

**Checkpoint**: User Story 2 fully functional and independently testable.

---

## Phase 5: User Story 3 - Kontrollü, gerekçeli veri silme (Priority: P2)

**Goal**: `exposure_datasets` silme işlemi zorunlu bir gerekçe ister, gerekçe denetim izninde kalıcı olarak saklanır.

**Independent Test**: quickstart.md Senaryo 3 — gerekçesiz silme engellenir; gerekçeyle silme gerçekleşir ve `audit_log`'da `justification` alanı dolu görünür; allow-list dışı bir tabloda mevcut genel davranış değişmez (bu spec kapsamında yeni bir hard-delete yolu eklenmez).

### Implementation for User Story 3

- [X] T012 [US3] Aynı migration dosyasında: `delete_with_justification(target_table TEXT, target_id UUID, justification_text TEXT)` `SECURITY DEFINER` fonksiyonu — `target_table`'ın allow-list'te (`ARRAY['exposure_datasets']`) olduğunu doğrular (değilse `RAISE EXCEPTION`), `justification_text`'in boş/NULL olmadığını doğrular (FR-008), kaydı `target_table`'dan siler (dinamik `EXECUTE format('DELETE FROM %I WHERE id = $1', target_table) USING target_id` — allow-list kontrolünden SONRA, SQL injection riski allow-list ile sınırlanmış), `audit_log`'a `action='delete', table_name=target_table, record_id=target_id::text, justification=justification_text` kaydı ekler (FR-009) — not: `log_table_change()` trigger'ı `exposure_datasets` üzerinde zaten genel bir DELETE kaydı üretecek, bu fonksiyon `justification` bilgisini AYRI bir audit_log satırı olarak ekler (aynı silme olayına iki audit_log satırı: biri trigger'dan genel, biri bu fonksiyondan gerekçeli — kabul edilebilir, ikisi de `record_id` ile eşleştirilebilir)
- [X] T013 [US3] Create `src/components/admin/DeletionJustificationModal.vue`: gerekçe metni giriş alanı + onay/iptal butonları; boş gerekçeyle onay butonu devre dışı
- [X] T014 [US3] In `src/components/impact/ExposureDatasetManager.vue`: mevcut `deleteDataset()` fonksiyonunu, doğrudan `supabase.from('exposure_datasets').delete()` yerine `DeletionJustificationModal` açıp `supabase.rpc('delete_with_justification', { target_table: 'exposure_datasets', target_id: dataset.id, justification_text })` çağıracak şekilde değiştir (FR-010 — sadece bu allow-list'teki tablo için; diğer tablolarda genel davranış zaten değişmiyor çünkü onlara bu akış hiç uygulanmıyor)

**Checkpoint**: User Story 3 fully functional and independently testable.

---

## Phase 6: User Story 4 - Güvenlik olayı (breach) günlüğü (Priority: P3)

**Goal**: Hesap kilitlenmesi gibi güvenlik olayları ayrı bir kategoriyle işaretlenir ve ayrı bir görünümde listelenebilir.

**Independent Test**: quickstart.md Senaryo 4 — bir hesap kilitlenir, olayın `event_category='security_event'` ile göründüğü ve ayrı görünümde genel veri-değişiklik kayıtlarından ayrıştığı doğrulanır.

### Implementation for User Story 4

- [X] T015 [US4] Aynı migration dosyasında: `record_failed_login(p_email TEXT)` fonksiyonunu (mevcut tanım, `supabase/migrations/20260709120000_access_review_and_lockout.sql:34-48`) `CREATE OR REPLACE` ile yeniden tanımla — mevcut mantık AYNI kalır, sadece `locked_until` bu çağrıda YENİ set ediliyorsa (yani eşik bu denemeyle aşıldıysa) `audit_log`'a `action='account_locked', table_name='profiles', event_category='security_event'` ek bir kayıt ekleyen bir `IF` bloğu eklenir (additive, mevcut davranışa regresyon yok)
- [X] T016 [US4] Create `src/components/admin/SecurityEventsPanel.vue`: super_admin-only, `audit_log` sorgusu `event_category='security_event'` filtresiyle, zaman sıralı liste; hiç kayıt yoksa boş durum mesajı
- [X] T017 [US4] In `src/views/AdminView.vue`: Audit/Denetim sekmesine `SecurityEventsPanel` bileşenini ekle

**Checkpoint**: User Story 4 fully functional and independently testable.

---

## Phase 7: User Story 5 - Güvenlik yapılandırması denetim raporu (Priority: P3)

**Goal**: Super_admin, MFA politikaları/retention politikaları/aktif özel yetkileri tek bir raporda görüntüleyip export edebilir.

**Independent Test**: quickstart.md Senaryo 5 — rapor açıldığında güncel MFA/retention/capability-grant verisiyle eşleştiği ve CSV/JSON export edilebildiği doğrulanır.

### Implementation for User Story 5

- [X] T018 [US5] Aynı migration dosyasında: `get_security_config_report() RETURNS JSONB` `SECURITY DEFINER STABLE` fonksiyonu (`get_access_review()` deseniyle birebir aynı yetkilendirme kontrolü, `supabase/migrations/20260709120000_access_review_and_lockout.sql:99-136`) — dönüş tipi kesin olarak `JSONB` (heterojen/tek-satırlık bir özet olduğundan `get_access_review()`'ın `RETURNS TABLE`'ı yerine); `jsonb_build_object('mfa_role_policy', (mfa_role_policy satırlarının jsonb_agg'i), 'retention_policies', (retention_policies özet listesinin jsonb_agg'i), 'capability_grant_counts', (profile_capability_grants'ta capability'ye göre gruplanmış sayım))
- [X] T019 [US5] Create `src/components/admin/SecurityConfigReportPanel.vue`: super_admin-only, `get_security_config_report()` RPC'sini çağırıp sonucu görüntüler; CSV/JSON export butonları (mevcut `rowsToCsv()`/`rowsToJson()`/`triggerDownload()`)
- [X] T020 [US5] In `src/views/AdminView.vue`: Audit/Denetim sekmesine `SecurityConfigReportPanel` bileşenini ekle

**Checkpoint**: User Story 5 fully functional and independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T021 [P] Add i18n coverage for new UI text (retention policy formu/uyarıları, kanıt paketi butonu/hata mesajları, silme gerekçesi modalı, güvenlik olayları paneli, güvenlik yapılandırması raporu etiketleri) across all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T022 Run `npm run test` and confirm all existing frontend tests pass with no regressions
- [X] T023 Run `npm run build` and confirm a clean build
- [X] T024 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Audit & Compliance modülünün MHEWS-FR-0025/FR-0088/FR-0096/FR-0045/FR-0081/FR-0054/FC-ERR-10/FR-0338 gereksinimleri artık kapandı — tamamlanma yüzdesini ve anlatıyı güncelle

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: Tüm user story'lerin ön koşulu — önce tamamlanmalı
- **User Story 1 (Phase 3)**: Foundational'a bağımlı, diğer story'lerden bağımsız
- **User Story 2 (Phase 4)**: Foundational'a bağımlı, diğer story'lerden bağımsız (audit_log'daki `event_category` kolonuna dokunmaz ama tabloyu okur)
- **User Story 3 (Phase 5)**: Foundational'a bağımlı, diğer story'lerden bağımsız
- **User Story 4 (Phase 6)**: Foundational'a bağımlı (`event_category` kolonunu kullanır), diğer story'lerden bağımsız
- **User Story 5 (Phase 7)**: Foundational'a bağımlı değil ama US1'in `retention_policies` tablosunu okur — pratikte US1'den sonra yapılması mantıklı (aynı migration dosyasında zaten sıralı)
- **Polish (Phase 8)**: Depends on all five user stories being complete

### Parallel Opportunities

- T009/T010 (US2, farklı dosyalar) paralel yazılabilir
- User Story 1/2/3/4 birbirinden bağımsız olduğu için, aynı migration dosyasına sıralı ekler yapıldıktan sonra frontend task'ları paralel geliştirilebilir
- T021 (i18n) T022/T023 ile paralel çalışabilir

---

## Implementation Strategy

### MVP First

1. Complete Phase 2: Foundational (audit_log kolonları)
2. Complete Phase 3: User Story 1 (retention policy) — MHEWS-FR-0025/FR-0088/FR-0096'yı kapatır
3. Complete Phase 4: User Story 2 (evidence package) — MHEWS-FR-0045'i kapatır
4. **STOP and VALIDATE**: quickstart.md Senaryo 1-2

### Incremental Delivery

5. Complete Phase 5: User Story 3 (controlled deletion) — MHEWS-FR-0081'i kapatır
6. Complete Phase 6: User Story 4 (breach logging) — MHEWS-FR-0054/FC-ERR-10'u kapatır
7. Complete Phase 7: User Story 5 (security config raporu) — MHEWS-FR-0338'i kapatır
8. **STOP and VALIDATE**: quickstart.md Senaryo 3-5
9. Complete Phase 8: Polish (i18n/test/build/docs)

---

## Notes

- Tek migration dosyası (`<timestamp>_audit_compliance_gaps.sql`), T002/T003/T004/T005/T006/T012/T015/T018'de sırayla genişletilir
- `audit_log`'un append-only RLS kısıtı (`no_update_audit`/`no_delete_audit`) HİÇ gevşetilmez — retention silme SADECE SECURITY DEFINER fonksiyon yoluyla, kendi kendini loglayarak yapılır (research.md Decision 7)
- "Sil" eylemi hiçbir zaman varsayılan değildir; bir `retention_policies` satırı açıkça `action='delete'` olarak yapılandırılmadıkça hiçbir kayıt kalıcı olarak silinmez
- Commit only when explicitly requested by the user
