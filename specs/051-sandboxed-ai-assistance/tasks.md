---
description: "Task list for feature implementation"
---

# Tasks: Sandboxed AI Assistance

**Input**: Design documents from `/specs/051-sandboxed-ai-assistance/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ai-capabilities.md, quickstart.md

**Tests**: Bu proje `deduplication rules, severity mapping, CAP XML validation, proximity
calculations` dışında testleri yazar-takdirine bırakıyor (constitution, Development Workflow &
Quality Gates), ancak bu spec'te durum makinesi geçişleri ve istatistik hesaplaması gibi saf
fonksiyonlar için test görevleri dahil edildi (mevcut proje convention'ı, spec 036/016/017 ile
tutarlı).

**Organization**: Görevler user story'lere göre gruplanmıştır; her story bağımsız olarak
uygulanabilir/test edilebilir.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Paralel çalıştırılabilir (farklı dosyalar, bağımlılık yok)
- **[Story]**: US1 (çeviri), US2a (özetleme), US2b (fotoğraf sınıflandırma — spec'te ikisi de P2),
  US3 (anomali bayrağı — spec'te P3, burada US3 olarak numaralandı)
- Tüm dosya yolları repo köküne göredir

## Path Conventions

Tek proje (Vue 3 + Supabase), `frontend`/`backend` ayrımı yok — plan.md'deki Project Structure
bölümüne bakın.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Migration iskeleti ve ortam değişkeni dokümantasyonu

- [x] T001 `supabase/migrations/` altında `<timestamp>_ai_capability_config.sql` dosyasını oluştur
      (boş iskelet: tablo başlığı yorumu + spec referansı, data-model.md'deki şemayı temel al)
- [x] T002 `supabase/migrations/` altında `<timestamp>_ai_suggestions.sql` dosyasını oluştur (boş
      iskelet, aynı desen)
- [x] T003 [P] `.env.example` (veya proje kök dizinindeki mevcut ortam değişkeni dokümantasyon
      dosyası) içine `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`, `AI_PROVIDER_TEXT_MODEL`,
      `AI_PROVIDER_VISION_MODEL` değişkenlerini örnek değerlerle ekle

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tüm user story'lerin üzerine kurulacağı ortak şema, paylaşımlı Deno modülleri ve
Pinia store iskeleti

**⚠️ CRITICAL**: Bu faz tamamlanmadan hiçbir user story'ye başlanamaz

- [x] T004 `supabase/migrations/<timestamp>_ai_capability_config.sql` içinde `ai_capability_config`
      tablosunu (bileşik PK `country_code`+`capability`, `enabled` DEFAULT false,
      `provider_config` JSONB, `updated_by`/`updated_at`) data-model.md'ye göre tamamla; mevcut
      `set_updated_at()` trigger fonksiyonunu bağla
- [x] T005 Aynı migration dosyasında `ai_capability_config` için RLS politikalarını ekle:
      `super_admin_ai_config_all`, `country_admin_ai_config_own`, `authenticated_read_ai_config`
      (data-model.md tablosuna göre)
- [x] T006 Aynı migration dosyasında mevcut `log_table_change()` trigger'ını
      `ai_capability_config` tablosuna `AFTER INSERT OR UPDATE` olarak bağla
- [x] T007 `supabase/migrations/<timestamp>_ai_suggestions.sql` içinde `ai_suggestions` tablosunu
      (tüm kolonlar, CHECK kısıtları, indeksler — data-model.md'ye göre) oluştur
- [x] T008 Aynı migration dosyasında `ai_suggestions` durum makinesi guard trigger'ını ekle
      (`pending`→`approved`/`approved_edited`/`rejected`/`ignored`/`failed`, terminal
      durumlardan çıkış yok — `cap_drafts`/`community_reports` guard trigger deseniyle aynı
      yapıda PL/pgSQL fonksiyonu)
- [x] T009 Aynı migration dosyasında `ai_suggestions` için RLS politikalarını ekle: insert/select/
      update yalnızca kaynak varlık üzerinde yetkisi olan rollere (research.md Karar 6'ya göre
      country_code eşleşmesi + rol kontrolü)
- [x] T010 Aynı migration dosyasında mevcut `log_table_change()` trigger'ını `ai_suggestions`
      tablosuna `AFTER INSERT OR UPDATE` olarak bağla
- [x] T011 [P] `supabase/functions/shared/aiProvider.ts` oluştur — OpenAI-uyumlu Chat/Vision
      Completions HTTP istemcisi, `AI_PROVIDER_*` ortam değişkenlerini okur, yapılandırılabilir
      timeout (varsayılan 10sn), hata/timeout durumunda `{ ok: false, reason }` döner (contracts/
      ai-capabilities.md "Ortak hata sözleşmesi"ne göre)
- [x] T012 [P] `supabase/functions/shared/anomalyStats.ts` oluştur — saf fonksiyon, bir dizi geçmiş
      sayısal değer + yeni değer alır, z-skorunu hesaplar, eşiği aşıp aşmadığını döner (research.md
      Karar 2)
- [x] T013 [P] `src/stores/aiAssistance.js` Pinia store iskeletini oluştur — ülke başına
      `ai_capability_config` durumunu cache'ler (`fetchCapabilities(countryCode)`), öneri
      isteği/onay/red aksiyonları için boş action gövdeleri
- [x] T014 [P] `src/components/ai/AiSuggestionBadge.vue` oluştur — yeniden kullanılabilir
      "AI-suggested — review required" etiketi + kabul/düzenle/reddet kontrolleri (henüz hiçbir
      capability'ye bağlı değil, generic prop arayüzü: `suggestion`, `onApprove`, `onReject`)
- [x] T015 [P] 7 locale dosyasına (`src/i18n/locales/{tr,en,es,fr,ru,ar,zh}.json`) ortak `ai.*`
      anahtarlarını ekle: `ai.suggestedLabel`, `ai.reviewRequired`, `ai.approve`, `ai.reject`,
      `ai.unavailable`, `ai.capabilityDisabled`

**Checkpoint**: Şema, paylaşımlı AI istemcisi, istatistik modülü ve temel UI bileşeni hazır — user
story'lere paralel başlanabilir

---

## Phase 3: User Story 1 - Çeviri önerisi ve onayı (Priority: P1) 🎯 MVP

**Goal**: Bir country_admin, CAP taslağı veya SOP metnini AI ile hedef dile çevirtebilir, inceler,
düzenler ve onaylar/reddeder; orijinal metin sistem-of-record olarak kalır.

**Independent Test**: quickstart.md Senaryo 1 ve 2 — çeviri iste → onayla/reddet → audit_log'da
kayıt; sağlayıcı kapalıyken CAP/SOP düzenleme akışı bloklanmadan çalışır.

### Implementation for User Story 1

- [x] T016 [US1] `supabase/functions/ai-translate/index.ts` oluştur — JWT doğrulama, çağıranın
      `source_table`/`source_id` üzerindeki mevcut düzenleme yetkisini kontrol et, ülke için
      `ai_capability_config.translate.enabled` kontrolü yap, `aiProvider.ts` ile çeviri iste,
      `ai_suggestions` satırı oluştur (contracts/ai-capabilities.md `ai-translate` sözleşmesine
      göre istek/yanıt şekli)
- [x] T017 [US1] `src/stores/aiAssistance.js` içine `requestTranslation(sourceTable, sourceId,
      sourceText, sourceLocale, targetLocale)` ve `resolveSuggestion(suggestionId, {status,
      finalOutput})` action'larını uygula (T013'ün üzerine)
- [x] T018 [US1] Mevcut CAP taslağı düzenleme bileşenine "AI ile çevir" aksiyonu ve hedef dil
      seçici ekle (bileşen: mevcut CAP authoring UI, spec 006/009'un editör bileşeni — dosya
      yolunu mevcut `src/components/` altında CAP draft editörünü bularak belirle) + T014'teki
      `AiSuggestionBadge.vue`'yu entegre et
- [x] T019 [US1] Mevcut SOP dokümanı düzenleme bileşenine (spec 033, `src/components/` altındaki
      SOP editörü) aynı "AI ile çevir" aksiyonunu ekle
- [x] T020 [US1] Sağlayıcı kullanılamıyor durumunda (`{ok:false}` yanıtı) UI'da
      `ai.unavailable` mesajını göster ve AI panelini devre dışı bırak, kaydetme/düzenleme akışını
      etkileme (FR-008 doğrulaması)
- [x] T021 [P] [US1] `supabase/functions/shared/aiProvider.test.ts` — mock fetch ile başarı,
      timeout, HTTP hata dallarını test et
- [x] T022 [P] [US1] `tests/unit/aiSuggestionTransitions.test.js` — `ai_suggestions` durum makinesi
      geçiş kurallarının saf mantığını (izinli/yasaklı geçişler) test et

**Checkpoint**: User Story 1 bağımsız olarak tam işlevsel ve test edilebilir (MVP)

---

## Phase 4: User Story 2a - SOP/incident özetleme (Priority: P2)

**Goal**: Bir operatör, uzun bir SOP dokümanının veya incident zaman çizelgesinin AI taslak
özetini isteyip inceleyip onaylayabilir; onaysız taslak hiçbir başka kullanıcıya görünmez.

**Independent Test**: quickstart.md'nin Senaryo 1'e benzer akışı (özetleme için) — özet iste →
onayla/discard et → `ai_suggestions` ve audit_log doğrulaması.

### Implementation for User Story 2a

- [x] T023 [US2a] `supabase/functions/ai-summarize/index.ts` oluştur — `ai-translate` ile aynı
      yetkilendirme/config-kontrol desenini izler, `source_table` yalnızca `sop_documents`/
      `incidents`, `target_locale` yok (contracts/ai-capabilities.md `ai-summarize`)
- [x] T024 [US2a] `src/stores/aiAssistance.js` içine `requestSummary(sourceTable, sourceId,
      sourceText)` action'ını ekle
- [x] T025 [US2a] SOP dokümanı görüntüleme/düzenleme bileşenine (spec 033) "AI ile özetle" aksiyonu
      + `AiSuggestionBadge.vue` entegrasyonu ekle; onaylanan özet, dokümana "incelenmiş ek" olarak
      iliştirilir (yalnızca istekte bulunan kullanıcıya görünür, onaylanana kadar)
- [x] T026 [US2a] Incident zaman çizelgesi/rapor bileşenine (spec 011/026) aynı "AI ile özetle"
      aksiyonunu ekle

**Checkpoint**: US1 ve US2a birlikte bağımsız çalışır

---

## Phase 5: User Story 2b - Vatandaş bildirimi fotoğraf ön-sınıflandırma (Priority: P2)

**Goal**: Bir moderatör, community hazard report kuyruğunda her fotoğraflı bildirim için
AI-önerilen bir hazard type rozeti görür; nihai kategori her zaman moderatörün seçimidir.

**Independent Test**: quickstart.md Senaryo 3 — fotoğraflı bildirim gönder → moderasyon kuyruğunda
öneri rozetini doğrula → moderatör kabul/override eder → kaydedilen kategori moderatörünkidir.

### Implementation for User Story 2b

- [x] T027 [US2b] `supabase/functions/ai-classify-photo/index.ts` oluştur — service-role (otomatik
      tetikleme) ve JWT (manuel yeniden tetikleme, country_admin/super_admin) auth yollarını
      destekler, Storage'dan fotoğrafı okur, reporter kimlik/iletişim alanlarını AI'ya
      GÖNDERMEDEN `aiProvider.ts` vision çağrısını yapar, `ai_suggestions` satırı oluşturur
      (contracts/ai-capabilities.md `ai-classify-photo`)
- [x] T028 [US2b] `supabase/functions/submit-community-report/index.ts` içine, başarılı insert
      sonrası `ai-classify-photo`'yu fire-and-forget çağıran bir adım ekle (research.md Karar 3 —
      gönderim yanıtını asla bloklamaz/başarısız kılmaz, yalnızca fotoğraflı bildirimlerde
      tetiklenir)
- [x] T029 [US2b] `src/components/admin/CommunityReportsPanel.vue` (spec 036 moderasyon paneli)
      içine, her fotoğraflı bildirim satırında `AiSuggestionBadge.vue` ile öneri gösterimini ekle;
      moderatörün kabul/override kararı `ai_suggestions.status` ve `resolved_by`'a yazılır, ancak
      `community_reports.hazard_type` her zaman moderatörün son seçimiyle güncellenir (mevcut
      spec 036 moderasyon akışına dokunmadan)

**Checkpoint**: US1, US2a, US2b birlikte bağımsız çalışır

---

## Phase 6: User Story 3 - Pasif anomali bayrağı (Priority: P3)

**Goal**: Bir operatör, ingest edilen hazard verisinde son geçmişe göre istatistiksel olarak
sıra dışı görünen kayıtlar için admin dashboard'da pasif bir rozet görür; bu rozetin
görüntülenmesi/kapatılması hiçbir risk skorunu, cascading-risk kuralını, alert'i veya dispatch'i
etkilemez.

**Independent Test**: quickstart.md Senaryo 5 — anormal bir test kaydı ekle → `ai-anomaly-check`
işini çalıştır → dashboard'da rozeti doğrula → kapat → spec 039/048/049 tablolarında hiçbir
değişiklik olmadığını doğrula.

### Implementation for User Story 3

- [x] T030 [US3] `supabase/functions/ai-anomaly-check/index.ts` oluştur — service-role auth,
      hazard tablolarından (`earthquake`,`flood`,`wildfire`,`drought`,`food_security`,...) son
      dönem kayıtlarını okur, `anomalyStats.ts` (T012) ile z-skoru hesaplar, eşiği aşanlar için
      `ai_suggestions` (`capability='anomaly_flag'`, `final_output` her zaman NULL) satırı ekler
      (contracts/ai-capabilities.md `ai-anomaly-check`) — hiçbir mevcut tabloyu yazmaz/günceller
- [x] T031 [US3] `ai-anomaly-check`'i periyodik çalıştıracak pg_cron zamanlamasını (veya mevcut
      ingestion-sonrası tetikleme deseni, spec 026/019'daki `generate-*-report` fonksiyonlarının
      cron kayıtlarıyla aynı desen) migration olarak ekle
- [x] T032 [US3] Admin dashboard'a (mevcut izleme/monitoring görünümü, `src/components/` altında
      data_sources sağlık durumu gösterilen bileşen) her hazard kaydı için "AI-flagged — unusual
      pattern" rozeti göster; rozete tıklayınca `ignore` aksiyonu `ai_suggestions.status='ignored'`
      yazar, başka hiçbir tabloyu etkilemez
- [x] T033 [P] [US3] `tests/unit/anomalyStats.test.js` — z-skoru hesaplamasının farklı
      girdilerde (yetersiz geçmiş veri, sıfır standart sapma, eşik sınırı) doğru davrandığını test
      et
- [x] T034 [P] [US3] `supabase/functions/shared/anomalyStats.test.ts` — Deno portunun `src/`
      tarafındaki mantıkla aynı sonucu ürettiğini doğrulayan deno test

**Checkpoint**: Tüm dört user story bağımsız olarak çalışır durumda

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Ülke-başına yönetim arayüzü, çok-dillilik tamamlama, doğrulama

- [x] T035 [P] `src/components/ai/AiCapabilityTogglePanel.vue` oluştur — country_admin/super_admin
      için dört yeteneğin (translate/summarize/classify_photo/anomaly_flag) açık/kapalı
      toggle'ları, `aiAssistance.js` store'unu kullanır (FR-001, SC-005)
- [x] T036 `src/components/admin/AdminView.vue` içine yeni "AI Yardımı" sekmesini ekleyip
      `AiCapabilityTogglePanel.vue`'yu bağla
- [x] T037 [P] Kalan `ai.*` i18n anahtarlarını (T015'te eklenmeyen, capability-özel metinler: ör.
      "AI ile çevir", "AI ile özetle", kategori önerisi metinleri) 7 dilde tamamla
- [x] T038 Tüm `ai_suggestions`/`ai_capability_config` RLS politikalarının `org_admin`/`viewer`
      rollerini dışarıda bıraktığını manuel olarak doğrula (Principle V güvenlik taraması)
- [ ] T039 quickstart.md'deki 5 senaryonun tamamını uçtan uca çalıştır ve doğrula — **BLOKE**:
      T040'a bağlı (canlı bir AI sağlayıcı anahtarı olmadan uçtan uca senaryolar koşulamaz)
- [ ] T040 **BİLİNÇLİ OLARAK ERTELENDİ (kullanıcı kararı, 2026-08-03)** — `AI_PROVIDER_BASE_URL`/
      `AI_PROVIDER_API_KEY`/`AI_PROVIDER_TEXT_MODEL`/`AI_PROVIDER_VISION_MODEL` secret'larını
      `supabase secrets set` ile ayarlayıp provider'ı devreye sokmak. Kullanıcının elinde bir API
      anahtarı var ama şimdilik bağlamamayı tercih etti. Bu adım atılmadan: tüm dört capability
      `ai_capability_config.enabled=false` varsayılanında kalır ve hatta açılsa bile
      `ai-translate`/`ai-summarize`/`ai-classify-photo` her zaman `provider_unavailable` ile
      fail-open döner (kod zaten buna göre yazıldı, sistem bu haliyle de güvenle production'a
      alınabilir). `ai-anomaly-check` provider'dan bağımsız olduğu için bu görevden etkilenmez.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Bağımsız, hemen başlanabilir
- **Foundational (Phase 2)**: Setup'a bağlı — TÜM user story'leri bloklar
- **User Stories (Phase 3-6)**: Foundational tamamlanmadan başlanamaz; sonrasında öncelik
  sırasına göre (P1 → P2 → P3) veya paralel ilerleyebilir
- **Polish (Phase 7)**: İstenen tüm user story'ler tamamlandıktan sonra

### User Story Dependencies

- **US1 (P1, çeviri)**: Foundational sonrası başlar, başka story'ye bağımlı değil
- **US2a (P2, özetleme)**: Foundational sonrası başlar; US1 ile aynı `ai_suggestions` şemasını
  paylaşır ama kod olarak bağımsız
- **US2b (P2, fotoğraf sınıflandırma)**: Foundational sonrası başlar; spec 036'nın mevcut
  `submit-community-report`/`CommunityReportsPanel.vue` dosyalarını MODIFY ettiği için o iki
  dosya üzerinde US1/US2a ile dosya çakışması yok (farklı dosyalar)
- **US3 (P3, anomali bayrağı)**: Foundational sonrası başlar (özellikle T012 `anomalyStats.ts`),
  diğer üç story'den tamamen bağımsız

### Parallel Opportunities

- Phase 1'deki tüm [P] görevler paralel
- Phase 2'de T011-T015 paralel (farklı dosyalar); T004-T010 aynı iki migration dosyasında
  sıralı olmalı
- Foundational tamamlandıktan sonra US1/US2a/US2b/US3 farklı geliştiriciler tarafından paralel
  yürütülebilir
- Her story içindeki [P] işaretli test görevleri paralel

---

## Parallel Example: Foundational Phase

```bash
Task: "supabase/functions/shared/aiProvider.ts oluştur (T011)"
Task: "supabase/functions/shared/anomalyStats.ts oluştur (T012)"
Task: "src/stores/aiAssistance.js iskeletini oluştur (T013)"
Task: "src/components/ai/AiSuggestionBadge.vue oluştur (T014)"
Task: "7 locale dosyasına ortak ai.* anahtarlarını ekle (T015)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup tamamla
2. Phase 2: Foundational tamamla (KRİTİK — tüm story'leri bloklar)
3. Phase 3: User Story 1 (çeviri) tamamla
4. **DUR ve DOĞRULA**: quickstart.md Senaryo 1-2'yi bağımsız çalıştır
5. İstenirse burada dağıt/demo yap — çeviri özelliği tek başına canlıya alınabilir

### Incremental Delivery

1. Setup + Foundational → temel hazır
2. US1 (çeviri) ekle → bağımsız test et → demo (MVP!)
3. US2a (özetleme) ekle → bağımsız test et → demo
4. US2b (fotoğraf sınıflandırma) ekle → bağımsız test et → demo
5. US3 (anomali bayrağı) ekle → bağımsız test et → demo
6. Phase 7: Polish (ülke-başına yönetim paneli, kalan i18n, güvenlik taraması, tam quickstart)

---

## Notes

- Hiçbir görev risk endeksi (spec 039), cascading-risk kuralları (spec 048/049) veya CAP
  authoring/onay/dispatch (spec 006/009) tablolarını/kod yollarını değiştirmez — bu spec boyunca
  bilinçli bir sınır.
- Her AI çıktısı, ilgili user story görevlerinde açıkça "insan onayı olmadan hiçbir kalıcı etki
  yok" kuralına (FR-004) uygun şekilde uygulanmalıdır.
- Commit, her görev veya mantıksal görev grubu sonrası yapılmalı.
- Her checkpoint'te story'yi bağımsız olarak doğrulamak için dur.
