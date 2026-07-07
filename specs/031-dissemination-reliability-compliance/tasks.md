---
description: "Task list for Dissemination Güvenilirliği ve Uyum (spec 031)"
---

# Tasks: Dissemination Güvenilirliği ve Uyum

**Input**: Design documents from `/specs/031-dissemination-reliability-compliance/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Yeni Deno-side saf fonksiyonlar (`resolveLocalizedContent`, `shouldAutoRetryNow`) `.test.ts` ile test edilir (proje convention'ı, `dispatchMatching.test.ts` deseni — `deno test`, Vitest suite'inin parçası değil). Frontend tarafında yeni saf fonksiyon yok (US5 mevcut `updateContact()`'ı çağırıyor).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/functions/`, `supabase/migrations/` at repository root.

---

## Phase 1: Setup

*(none — no new dependencies/project scaffolding needed)*

---

## Phase 2: Foundational (Blocking Prerequisites)

*(none — 5 user story bağımsız çalışabilir; migration US3/US4/US5'in kendi fazlarında, birbirini bloklamadan sıralı olarak aynı dosyaya eklenir)*

---

## Phase 3: User Story 1 - Bir alıcı, uyarı e-postasını kendi tercih ettiği dilde alır (Priority: P1) 🎯 MVP

**Goal**: E-posta içeriği, alıcının `preferred_language`'ına göre `cap_drafts.translations`'tan lokalize edilir, çeviri yoksa orijinal dile düşer.

**Independent Test**: `resolveLocalizedContent()` birim testleri + canlıda `preferred_language='tr'` bir contact'a `translations.tr` dolu bir CAP broadcast edilip e-postanın Türkçe geldiğinin doğrulanması (quickstart.md Senaryo 1).

### Implementation for User Story 1

- [X] T001 [P] [US1] Create `supabase/functions/shared/emailLocalization.ts`: `resolveLocalizedContent(draft, preferredLanguage)` saf fonksiyonu — data-model.md'deki imzaya göre, `draft.translations?.[preferredLanguage]?.title` doluysa onu (description'ı da varsa) kullanır, yoksa `{title: draft.title, description: draft.description}`'a düşer
- [X] T002 [P] [US1] Create `supabase/functions/shared/emailLocalization.test.ts`: (a) çeviri mevcut → kullanılıyor, (b) çeviri yok → orijinale düşülüyor, (c) `translations` tamamen boş/null → orijinale düşülüyor, (d) çeviride sadece `title` var `description` yok → title çeviriden description orijinalden gelmiyor (research.md'de netleştirilen "description opsiyonel" davranışı — description de çeviride yoksa orijinal description kullanılır)
- [X] T003 [US1] In `supabase/functions/dispatch-alert/index.ts`: `buildEmailBody()` imzasına `preferredLanguage: string` parametresi ekle, içeride `resolveLocalizedContent(draft, preferredLanguage)` çağırıp döndürülen title/description'ı kullan; `sendReceipt()` ve `sendReceiptRetry()`'nin `buildEmailBody()`'yi çağırdığı 2 yeri `contact.preferred_language` geçirecek şekilde güncelle

**Checkpoint**: User Story 1 fully functional and independently testable — e-postalar artık contact'ın tercih dilinde gidiyor, regresyon yok.

---

## Phase 4: User Story 2 - Bir alıcı, e-posta uyarılarından tek tıkla çıkabilir (Priority: P1) 🎯 MVP

**Goal**: Her e-postada bir unsubscribe linki var; tıklanınca contact'ın mevcut `email_opt_in`'i `false` olur (sadece e-posta kanalı, WhatsApp etkilenmez).

**Independent Test**: Unsubscribe linkine tıklanır, `contacts.email_opt_in=false` olduğu ve `whatsapp_opt_in`'in etkilenmediği doğrulanır; ikinci tıklamada hata olmadığı doğrulanır (quickstart.md Senaryo 2).

### Implementation for User Story 2

- [X] T004 [US2] Create `supabase/functions/unsubscribe/index.ts`: `ack-dispatch/index.ts`'in (satır 1-56) birebir kopyası — `GET ?receipt_id={uuid}`, anon-callable, her zaman 200+HTML; `receipt_id` üzerinden `dispatch_receipts.contact_id`'yi bulup o `contacts` satırının `email_opt_in`'ini `WHERE email_opt_in = true` koşuluyla `false` yapar (idempotent — contracts/unsubscribe.md'deki tam davranış)
- [X] T005 [US2] In `supabase/functions/dispatch-alert/index.ts`'in `buildEmailBody()`'sinde: mevcut ack linkinin yanına, aynı desende (`supabaseUrl`'den türetilen) bir unsubscribe linki ekle (`${supabaseUrl}/functions/v1/unsubscribe?receipt_id=${receiptId}`)
- [X] T006 [US2] Update `supabase/config.toml`: `[functions.unsubscribe]` bölümü ekle, `verify_jwt = false` (mevcut `[functions.ack-dispatch]` girdisiyle birebir aynı desen)

**Checkpoint**: User Story 2 fully functional and independently testable — alıcılar e-postadan tek tıkla çıkabiliyor, WhatsApp etkilenmiyor.

---

## Phase 5: User Story 3 - Başarısız bir dispatch, operatör beklemeden otomatik olarak yeniden denenir (Priority: P2)

**Goal**: `dispatch_receipts`'teki başarısız satırlar, pg_cron ile periyodik olarak, artan aralıklarla (backoff) ve sınırlı deneme sayısıyla otomatik yeniden denenir; manuel retry otomatik sayacı sıfırlar.

**Independent Test**: `shouldAutoRetryNow()` birim testleri + canlıda backoff süresi dolmuş bir `failed` satırın `auto_retry` modu çağrıldığında yeniden denendiği, dolmamışsa denenmediği, azami sınıra ulaşmış bir satırın artık hiç denenmediği doğrulanır (quickstart.md Senaryo 3).

### Implementation for User Story 3

- [X] T007 [US3] Create `supabase/migrations/<timestamp>_dissemination_reliability.sql`: `ALTER TABLE dispatch_receipts ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ;` ve `ALTER TABLE dispatch_jobs ADD COLUMN IF NOT EXISTS admin_notified_at TIMESTAMPTZ;` (data-model.md) — bu migration dosyası T014/T015'te de genişletilecek (aynı dosya, sıralı ekler)
- [X] T008 [P] [US3] Create `supabase/functions/shared/dispatchBackoff.ts`: `shouldAutoRetryNow(receipt, now)` saf fonksiyonu — data-model.md'deki `MAX_AUTO_RETRIES=4`, `BASE_BACKOFF_MINUTES=15`, `15 * 2^retry_count` formülüne göre
- [X] T009 [P] [US3] Create `supabase/functions/shared/dispatchBackoff.test.ts`: (a) `status !== 'failed'` → false, (b) `retry_count >= 4` → false, (c) `last_attempted_at` null → true, (d) backoff süresi dolmamış (`retry_count=0`, 5 dakika önce) → false, (e) backoff süresi dolmuş (`retry_count=0`, 16 dakika önce) → true, (f) `retry_count=2` için 60 dakikalık backoff doğru hesaplanıyor
- [X] T010 [US3] In `supabase/functions/dispatch-alert/index.ts`: yeni bir `handleAutoRetry(admin)` fonksiyonu ekle — `status='failed' AND retry_count < 4` olan `dispatch_receipts` satırlarını çeker, her biri için `shouldAutoRetryNow()` kontrolü yapar, uygun olanları `status='queued', retry_count+1, last_attempted_at=NOW()` yapıp `sendReceiptRetry()` ile (contact'ın `preferred_language`'ı dahil, US1 ile tutarlı) yeniden dener; `Deno.serve` handler'ına `body.auto_retry === true` durumunda (sadece service-role auth, Mode A'nın authentication kontrolüyle aynı) bu fonksiyonu çağıran bir dal ekle (contracts/dispatch-alert-auto-retry.md)
- [X] T011 [US3] In `supabase/functions/dispatch-alert/index.ts`'in `handleRetry()` fonksiyonunda (mevcut `retry_count: r.retry_count + 1` satırı): `retry_count: 0` olarak değiştir, `last_attempted_at: new Date().toISOString()` ekle (FR-008 — manuel retry otomatik sayacı sıfırlar)
- [X] T012 [US3] Aynı migration dosyasında (`<timestamp>_dissemination_reliability.sql`): `trigger_dispatch_auto_retry()` fonksiyonu (spec 019'un `trigger_compliance_report_generation()` deseninin bir kopyası, `pg_net.http_post()` ile `dispatch-alert`'i `{"auto_retry": true}` body'siyle çağırır) + `pg_cron.schedule('dispatch-auto-retry-15min', '*/15 * * * *', ...)` kaydı

**Checkpoint**: User Story 3 fully functional and independently testable — başarısız dispatch'ler operatör müdahalesi olmadan otomatik yeniden deneniyor, manuel retry sayacı sıfırlıyor.

---

## Phase 6: User Story 4 - Bir dispatch tamamen başarısız olduğunda, bir yöneticiye aktif olarak haber verilir (Priority: P2)

**Goal**: Tüm otomatik denemeleri tükenmiş bir dispatch job'ı için, ilgili ülke/org'un bir yöneticisine bir kez bildirim e-postası gönderilir.

**Independent Test**: Tüm receipts'i `retry_count>=4, status='failed'` olan bir job için `auto_retry` modu çağrıldığında admin'e bildirim gittiği ve `admin_notified_at`'in set edildiği, tekrar çağrıldığında ikinci bildirim gitmediği doğrulanır (quickstart.md Senaryo 4).

### Implementation for User Story 4

- [X] T013 [US4] In `supabase/functions/dispatch-alert/index.ts`'in `handleAutoRetry()` fonksiyonunun sonunda: `dispatch_jobs` arasında ilgili CAP taslağının tüm `dispatch_receipts`'i `retry_count >= 4 AND status='failed'` olan VE `admin_notified_at IS NULL` olan job'ları bul; her biri için CAP taslağının `country_code`/`org_id`'sine göre `profiles`'tan (`role='super_admin'` VEYA scope eşleşen `country_admin`/`org_admin`) admin email(ler)ini çek, mevcut `getEmailAdapter()` ile bir bildirim e-postası gönder, `admin_notified_at=NOW()` set et (contracts/dispatch-alert-auto-retry.md)

**Checkpoint**: User Story 4 fully functional and independently testable — kritik dispatch arızaları artık panele bakmadan fark ediliyor, tekrar bildirim yok.

---

## Phase 7: User Story 5 - Bir Super Admin, bir kişinin kişisel verilerini kalıcı olarak anonimleştirebilir (Priority: P3)

**Goal**: Super Admin, bir contact'ın PII'sini (email, whatsapp_number) geri döndürülemez şekilde kaldırabilir; geçmiş dispatch/audit kayıtları bozulmaz.

**Independent Test**: Bir contact anonimleştirilir, `email`/`whatsapp_number`'ın NULL, `is_active`'in false olduğu, geçmiş `dispatch_receipts`/`audit_log` kayıtlarının bozulmadığı doğrulanır (quickstart.md Senaryo 5).

### Implementation for User Story 5

- [X] T014 [US5] Aynı migration dosyasında (`<timestamp>_dissemination_reliability.sql`): `ALTER TABLE contacts DROP CONSTRAINT IF EXISTS chk_contact_has_channel;` ve `ALTER TABLE contacts ADD CONSTRAINT chk_contact_has_channel CHECK (is_active = false OR email IS NOT NULL OR whatsapp_number IS NOT NULL);` (research.md Decision 7/data-model.md)
- [X] T015 [US5] In `src/stores/contacts.js`: yeni `anonymizeContact(id)` fonksiyonu — mevcut `updateContact(id, { email: null, whatsapp_number: null, full_name: '[anonymized]', is_active: false })`'ı çağırır; return değerini export et. **Not (analiz bulgusu E1/E2)**: bu fonksiyon SADECE `contacts` tablosuna yazar — `dispatch_receipts`/`audit_log`'a hiç dokunmaz, bu yüzden FR-012 (geçmiş kayıtların bozulmaması) yeni kod gerektirmeden otomatik sağlanır; FR-013 (anonimleştirilmiş contact'ın gelecekte hiç eşleşmemesi) de ayrı bir kod gerektirmez çünkü `is_active=false` zaten `dispatchMatching.ts`'nin `matchesContact()` fonksiyonunun ilk kontrolü (satır 46) tarafından hariç tutulur.
- [X] T016 [US5] In `src/components/admin/ContactsPanel.vue`: her contact satırına (Super Admin-only, `auth.isSuperAdmin` gated) bir "Anonimleştir" butonu ekle — geri döndürülemez olduğunu vurgulayan bir onay adımı (mevcut confirm/modal deseni) sonrası `contactsStore.anonymizeContact(id)` çağırır

**Checkpoint**: User Story 5 fully functional and independently testable — Super Admin bir contact'ı GDPR-uyumlu şekilde anonimleştirebiliyor, denetim izi bozulmuyor.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T017 [P] Add i18n coverage for the new "Anonimleştir" button/confirmation text across all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh) — key: `admin.contacts.anonymize`/`admin.contacts.anonymizeConfirm`. **Not**: `unsubscribe`'ın HTML sayfası, `ack-dispatch` ile aynı desende sabit/hardcoded (i18n'siz) kalır — bu proje convention'ı (public, oturumsuz, locale context'i olmayan sayfa)
- [X] T018 Run `npm run test` and confirm all existing frontend tests pass with no regressions
- [X] T019 Run `npm run build` and confirm a clean build
- [X] T020 (Opsiyonel, Deno kuruluysa) Run `deno test supabase/functions/shared/emailLocalization.test.ts supabase/functions/shared/dispatchBackoff.test.ts` and confirm all pass
- [X] T021 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Dissemination modülünün MHEWS-FR-0287/SD-EMAIL-02, SD-EMAIL-04, FR-0119, FR-0066, SD-CONTACT-06 gereksinimleri artık kapandı — tamamlanma yüzdesini ve anlatıyı güncelle

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 3)**: No dependencies — can proceed first
- **User Story 2 (Phase 4)**: No dependencies — independent of US1 (aynı dosyaya, `buildEmailBody()`'ye dokunuyor ama farklı bir kısmına — sıralı uygulanmalı, T003'ten sonra T005)
- **User Story 3 (Phase 5)**: No dependencies — ama `handleAutoRetry()`'nin `sendReceiptRetry()`'yi çağırması US1'in dil-lokalizasyon değişikliğinden faydalanır (sıralı: US1 sonra US3)
- **User Story 4 (Phase 6)**: Depends on US3 (T010'daki `handleAutoRetry()`'nin var olması, aynı fonksiyonun sonuna ekleniyor)
- **User Story 5 (Phase 7)**: No dependencies — tamamen ayrı dosyalar (contacts.js/ContactsPanel.vue), migration'daki constraint değişikliği hariç bağımsız
- **Polish (Phase 8)**: Depends on all user stories being complete

### Parallel Opportunities

- T001/T002 (US1) T004 (US2) ile paralel yazılabilir (farklı dosyalar)
- T008/T009 (US3, dispatchBackoff) T001/T002 (US1, emailLocalization) ile paralel yazılabilir
- T015/T016 (US5, frontend) diğer tüm backend task'larla paralel yazılabilir
- T017 (i18n) T018/T019/T020 ile paralel çalışabilir

---

## Implementation Strategy

### MVP First

1. Complete Phase 3 + Phase 4: User Story 1 + User Story 2 (dil lokalizasyonu + unsubscribe) — ikisi de P1, en yüksek kullanıcı/uyum etkili, en düşük risk
2. **STOP and VALIDATE**: quickstart.md Senaryo 1-2

### Incremental Delivery

3. Complete Phase 5: User Story 3 (otomatik retry) — MHEWS-FR-0119'u kapatır
4. **STOP and VALIDATE**: quickstart.md Senaryo 3
5. Complete Phase 6: User Story 4 (admin bildirimi) — MHEWS-FR-0066'yı kapatır
6. **STOP and VALIDATE**: quickstart.md Senaryo 4
7. Complete Phase 7: User Story 5 (anonimizasyon) — MHEWS-SD-CONTACT-06'yı kapatır
8. **STOP and VALIDATE**: quickstart.md Senaryo 5
9. Complete Phase 8: Polish (i18n/test/build/docs)

---

## Notes

- Tek migration dosyası (`<timestamp>_dissemination_reliability.sql`), T007/T012/T014'te sırayla genişletilir — spec 029'daki gibi tüm parçalar birlikte tek seferde uygulanır
- `contacts`/`cap_drafts`/`dispatch_jobs`/`dispatch_receipts`'in mevcut RLS'i, state machine'i ve `email_opt_in`/`whatsapp_opt_in` alanları hiç değişmez (additive)
- pg_cron job'ı `dispatch-alert`'i servis-rolü key'iyle çağırır — Mode A ile aynı authentication deseni, yeni bir güvenlik yüzeyi açmaz
- Commit only when explicitly requested by the user
