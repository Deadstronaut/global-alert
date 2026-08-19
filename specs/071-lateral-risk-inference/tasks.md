---

description: "Task list for Çapraz-Afet Risk Çıkarımı ve Öngörü Raporu"

---

# Tasks: Çapraz-Afet Risk Çıkarımı ve Öngörü Raporu

**Input**: Design documents from `/specs/071-lateral-risk-inference/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/lateral-risk-contract.md, quickstart.md

**Tests**: Proje anayasası (`.specify/memory/constitution.md`, Development Workflow & Quality Gates) "proximity/nearby-threat distance calculations" için test şart koşuyor — `evaluateLateralRisks`/`coastalDistanceKm`/`computeTsunamiRiskFinding` (h3 proximity + mesafe hesaplaması) bu kapsama giriyor, birim testleri dahil edildi (spec 070'teki `windSpreadPrediction.js` testleriyle aynı desen). UI wiring için ayrı test görevi eklenmedi.

**Organization**: Görevler spec.md'deki kullanıcı hikayelerine (P1/P2/P3) göre gruplandı.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Paralel çalıştırılabilir (farklı dosyalar, birbirine bağımlı değil)
- **[Story]**: Hangi kullanıcı hikayesine ait (US1, US2, US3)

## Path Conventions

Tek bir web uygulaması (`src/` frontend kökü), yeni bir backend servisi YOK — plan.md'nin Project Structure bölümüyle birebir aynı.

---

## Phase 1: Setup

- [X] T001 `src/utils/lateralRiskRules.js` ve `src/utils/institutionCategoryMap.js` oluşturuldu — mevcut `windSpreadPrediction.js` ile aynı dizin/konvansiyon

**Checkpoint**: Setup tamamlandı.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: US1/US2/US3'ün hepsi aynı çekirdek çıkarım fonksiyonlarına ihtiyaç duyuyor — bu önce bitmeli.

**⚠️ CRITICAL**: Bu faz tamamlanmadan hiçbir kullanıcı hikayesi başlayamaz.

- [X] T002 `institutionCategoryMap.js`: `INSTITUTION_CATEGORIES` (4 kategori) + `institutionCategoriesForFindings(findings)` yazıldı
- [X] T003 `lateralRiskRules.js`: `LATERAL_RISK_RULES` yazıldı — `fire-from-quake-drought-heat`, `epidemic-from-flood`, `access-risk-quake-or-flood` kuralları
- [X] T004 `evaluateLateralRisks(sourceEvent, nearbyEventsLookup, options?)` yazıldı
- [X] T005 `windSpreadAsFinding(spreadProjection)` adaptörü yazıldı (ayrıca `accessRiskFinding()` de eklendi — access-risk kuralı nearbyEventsLookup değil RPC sonucuyla tetiklendiği için ayrı bir adaptör gerekti)
- [X] T006 [P] `tests/unit/lateralRiskRules.test.js` — 19 test, hepsi geçti
- [X] T007 [P] `tests/unit/institutionCategoryMap.test.js` — 4 test, hepsi geçti

**Checkpoint**: Foundation hazır — US1/US2/US3 artık başlayabilir.

---

## Phase 3: User Story 1 - Seçili bir afetin potansiyel ikincil risklerini görmek (Priority: P1) 🎯 MVP

**Goal**: Bir afet seçildiğinde, o bölgedeki katmanlara göre ikincil risk bulguları otomatik görünsün.

**Independent Test**: quickstart.md Doğrulama Senaryosu 1.

### Implementation for User Story 1

- [X] T008 [US1] `MapView.vue`'da `buildNearbyEventsLookup(sourceEvent)` yazıldı — `disasterStore.allEvents` üzerinde h3 `gridDisk` + `DEFAULT_WITHIN_HOURS` zaman penceresi filtresi
- [X] T009 [US1] `secondaryRiskFindings` ref'i + `updateSecondaryRiskFindings()` yazıldı — kural bulguları + access-risk + spec 070 rüzgar bulgusu + (US3) tsunami bulgusu birleştiriliyor; `watch([selectedImpactEvent, windSpreadProjection], ...)`
- [X] T010 [US1] `detectAccessRisk(event)` yazıldı — `exposureLayersStore.datasets`'ten zaten yüklü `osm`/`osm-buildings` dataset id'leriyle `compute_zonal_stats` RPC'si (5km yarıçap); düşük yol sayısı + yakında kritik tesis varsa risk
- [X] T011 [US1] `.lateral-risk-block` Impact Analysis dock'una eklendi — bulgu listesi veya "belirgin bir ikincil risk tespit edilmedi" mesajı
- [X] T012 [P] [US1] `lateralRisk.*` anahtarları 7 locale dosyasına da eklendi (sectionTitle, noFindings, 5 finding başlık/açıklama, 4 kurum kategorisi etiketi)

**Checkpoint**: US1 bağımsız olarak tam çalışır — MVP burada teslim edilebilir.

---

## Phase 4: User Story 2 - Kritik durumda tek sayfalık öngörü raporuna hızlı erişim (Priority: P2)

**Goal**: Kritik bir afet tespit edildiğinde ana panelde bir tetikleyici görünsün; tıklanınca tek sayfalık rapor açılsın.

**Independent Test**: quickstart.md Doğrulama Senaryosu 2.

### Implementation for User Story 2

- [X] T013 [US2] Not: `ui.js`'e eklemek yerine `AppHeader.vue`'da yerel `computed`'lar olarak yazıldı (`criticalTriggerEvent`, `hasCriticalLateralRiskTrigger`, `criticalTriggerCount`) — bu bileşen zaten hem `disasterStore` hem `uiStore`'a sahip, ui.js'e disasterStore bağımlılığı eklemeye gerek kalmadı (küçük, kabul edilen bir plan sapması, spec 070'teki dataRange şekli sapmasıyla aynı tür)
- [X] T014 [US2] `.lateral-risk-trigger-btn` eklendi — `canAnalyzeLateralRisk && hasCriticalLateralRiskTrigger` iken görünür, `uiStore.safeMode` açıkken `--static` (animasyonsuz, sayı rozetli), kapalıyken `lateral-risk-blink` animasyonu
- [X] T015 [US2] `src/components/risk/LateralRiskReport.vue` yazıldı — disclaimer, kaynak olay bilgisi, özet çubuklar, 4 bölüm (şehir/kasaba, tesisler, bulgular, kurum türleri); kendi `secondaryRiskFindings`'ini bağımsız hesaplıyor (AppHeader ve MapView kardeş bileşenler olduğu için MapView'in local state'ine doğrudan erişemiyor — aynı saf fonksiyonları yeniden çağırıyor, mantığı KOPYALAMIYOR)
- [X] T016 [US2] `loadAffectedRegions()` — `loadRegionBoundaries(authStore.countryCode, 'district')` + `findRegion()`; ülke bağlamı yoksa (ör. super_admin) boş liste (FR-011, uydurma yok)
- [X] T017 [US2] `@unovis/vue` yerine basit CSS-bar özet grafiği kullanıldı (bulgu/bölge/tesis sayıları) — bilinmeyen bir chart API'sine risk almadan "sayısal veriyle desteklenmiş" gereksinimini karşılıyor (Constitution VIII)
- [X] T018 [US2] `canAnalyzeLateralRisk` (`ImpactPanel.vue`'nun `canAnalyze`'ıyla birebir aynı rol seti) hem tetikleyici butonun hem raporun görünürlüğünü kapsıyor — daha geniş bir erişim açılmadı
- [X] T019 [P] [US2] `lateralRisk.triggerLabel` + `lateralRisk.report.*` (13 anahtar) 7 locale dosyasına da eklendi

**Checkpoint**: US1 ve US2 birlikte çalışır durumda.

---

## Phase 5: User Story 3 - Kıyıya yakın büyük depremlerde tsunami riski potansiyelini görmek (Priority: P3)

**Goal**: Kıyıya yakın, büyüklüğü eşik-üstü bir deprem seçildiğinde tsunami riski potansiyeli bulgusu görünsün.

**Independent Test**: quickstart.md Doğrulama Senaryosu 3.

### Implementation for User Story 3

- [X] T020 [US3] `coastalDistanceKm(lat, lng, countryBoundaryFeatures)` yazıldı — haversine + nokta-segment mesafesi, yeni veri kaynağı yok
- [X] T021 [US3] `computeTsunamiRiskFinding(sourceEvent, distanceKm, options?)` yazıldı — deprem + eşik-altı mesafe + eşik-üstü büyüklük (varsayılan 50km/M6.5)
- [X] T022 [P] `tests/unit/lateralRiskRules.test.js`'e coastalDistanceKm/computeTsunamiRiskFinding testleri eklendi (yukarıdaki 19 teste dahil)
- [X] T023 [US3] `updateSecondaryRiskFindings()` içinde `event.type === 'earthquake'` ise `coastalDistanceKm` + `computeTsunamiRiskFinding` çağrılıp sonucu listeye ekleniyor (US1'in T009'una entegre edildi, ayrı bir kod yolu değil)
- [X] T024 [P] [US3] `lateralRisk.finding.tsunami_risk_potential.*` anahtarları 7 locale dosyasına da eklendi (T012 ile aynı batch'te yazıldı)

**Checkpoint**: Üç kullanıcı hikayesi de bağımsız çalışır durumda.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T025 [P] 7 locale dosyası da geçerli JSON — her i18n değişikliğinden sonra tekrar tekrar doğrulandı
- [X] T026 `npx eslint` değiştirilen dosyalarda temiz (spec 070'ten kalan 1 pre-existing/ilgisiz hata dışında); `npm run build` başarılı; `npx vitest run --testTimeout=20000` → 340/340 test geçti
- [X] T027 Canlı Playwright (kimlik doğrulamalı) ile: sayfa yüklendi, konsol hatası yok, tetikleyici rozet doğru şekilde GÖRÜNMEDİ (mevcut anda uygulamanın varsayılan "son 24 saat" pencereli fetch'inde `severity==='critical'`/M6.0+ bir olay yoktu — doğrudan Supabase REST sorgusuyla doğrulandı: DB'de gerçek kritik depremler VAR, ör. 2025-07-29 M8.8, ama bu olay 24 saatlik varsayılan pencerenin dışında kaldığı için istemciye hiç çekilmedi). Bu, T013'ün "asla uydurma tetikleyici" davranışının doğru çalıştığının kanıtı, ama raporun açılış/kapanış akışı ve FR-009'un ağ-sekmesi denetimi bu oturumda uçtan uca canlı gösterilemedi — güven kaynağı: kod incelemesi (rapor bileşeni hiçbir üçüncü-taraf/webhook/e-posta API'si import etmiyor veya çağırmıyor, sadece mevcut Supabase RPC'leri) + 340 birim testi. Kritik pencere içine düşen gerçek bir olay oluştuğunda (veya test verisiyle) bu senaryo tekrar canlı doğrulanmalı.
- [X] T028 Regresyon: `npx vitest run` tüm mevcut 340 test (spec 070 dahil) hâlâ geçiyor; spec 070'in `windSpreadAsFinding()` adaptörü `computeSpreadProjection()`'ı tekrar hesaplamıyor, sadece mevcut sonucu sarıyor (kod incelemesiyle doğrulandı). Mevcut Etki Analizi elle-bölge-seçme akışına (`ImpactPanel.vue`) hiçbir değişiklik yapılmadı.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Bağımsız, hemen başlar.
- **Foundational (Phase 2)**: Setup'a bağlı — TÜM kullanıcı hikayelerini BLOKE eder.
- **User Stories (Phase 3-5)**: Hepsi Foundational'ın bitmesine bağlı; US1/US2 birbirinden bağımsız paralel yürütülebilir, US3 US1'in `secondaryRiskFindings` state'ine entegre olduğu için US1 sonrası mantıklı ama T020-T022 (saf fonksiyonlar) US1/US2 ile paralel yazılabilir.
- **Polish (Phase 6)**: İstenen tüm kullanıcı hikayelerinin tamamlanmasına bağlı.

### User Story Dependencies

- **US1 (P1)**: Yalnızca Foundational'a bağlı.
- **US2 (P2)**: Foundational'a bağlı; raporun içeriği US1'in `secondaryRiskFindings`'ini kullanır ama tetikleyici/rapor kabuğu US1 UI'ı tamamlanmadan da bağımsız geliştirilebilir.
- **US3 (P3)**: Saf fonksiyonları (T020-T022) bağımsız; UI entegrasyonu (T023) US1'in `secondaryRiskFindings` state'ine bağlı.

### Parallel Opportunities

- T006, T007, T012, T019, T022, T024, T025 gibi `[P]` işaretli görevler kendi fazları içinde paralel yürütülebilir (farklı dosyalar).
- Foundational bittikten sonra US1 (T008-T012) ve US2'nin tetikleyici kısmı (T013-T014) paralel başlayabilir; US3'ün saf fonksiyonları (T020-T022) da herhangi bir noktada paralel yazılabilir.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) + Phase 2 (Foundational) tamamla.
2. Phase 3 (US1) tamamla — artık kullanıcılar seçili bir afetin ikincil risklerini görebiliyor.
3. **DURDUR ve DOĞRULA**: quickstart.md Senaryo 1'i çalıştır.

### Incremental Delivery

1. Setup + Foundational → temel hazır.
2. US1 ekle → bağımsız test et → teslim (MVP!).
3. US2 ekle → bağımsız test et → teslim.
4. US3 ekle → bağımsız test et → teslim.
5. Polish fazıyla kapat.

---

## Notes

- `[P]` görevler = farklı dosyalar, birbirine bağımlı değil.
- `[Story]` etiketi görevi ilgili kullanıcı hikayesine bağlar.
- `lateralRiskRules.js`/`institutionCategoryMap.js` saf fonksiyonlar — test etmesi kolay, UI'dan bağımsız.
- `LATERAL_RISK_RULES`'ın TEK kopyası `lateralRiskRules.js`'de — başka hiçbir dosyada bu listeyi kopyalama (Constitution I).
- FR-009 (otomatik bildirim yasağı) hiçbir görevde ihlal edilmemeli — `LateralRiskReport.vue` veya başka hiçbir dosya, dış bir sisteme (e-posta/mesaj/webhook) istek atan bir kod yolu İÇERMEMELİ.
- Her görevden sonra (özellikle i18n dosyalarını değiştiren görevlerden sonra) JSON geçerliliğini kontrol et.
