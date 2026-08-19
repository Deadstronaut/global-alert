---

description: "Task list for Rüzgar Yönüne Dayalı Yayılım Tahmini"

---

# Tasks: Rüzgar Yönüne Dayalı Yayılım Tahmini

**Input**: Design documents from `/specs/070-wind-fire-spread/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/wind-spread-contract.md, quickstart.md

**Tests**: Bu proje için testler açıkça talep edilmemiş ama proje anayasası (`.specify/memory/constitution.md`, Development Workflow & Quality Gates) "proximity/nearby-threat distance calculations" gibi kritik iş mantığı için test şart koşuyor — `windSpreadPrediction.js` (komşu-hex/mesafe hesaplaması) bu kapsama giriyor, bu yüzden bu iki saf yardımcı fonksiyon için birim testleri dahil edildi; UI wiring için ayrı test görevi eklenmedi (mevcut oturum deseniyle tutarlı: Vitest + canlı Playwright kontrolü).

**Organization**: Görevler spec.md'deki kullanıcı hikayelerine (P1/P2/P3) göre gruplandı, her biri bağımsız test edilebilir.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Paralel çalıştırılabilir (farklı dosyalar, birbirine bağımlı değil)
- **[Story]**: Hangi kullanıcı hikayesine ait (US1, US2, US3)

## Path Conventions

Bu proje tek bir web uygulaması (`src/` frontend kökü) + ayrı bir Python ingest worker (`wind-importer/`, bu özellik için DEĞİŞMİYOR — bkz. research.md R1/R2). Tüm yeni dosyalar `src/` altında.

---

## Phase 1: Setup

**Purpose**: Bu özellik için proje iskeleti zaten mevcut (h3-js, mevcut flow_snapshots pipeline, mevcut i18n yapısı) — yeni bir bağımlılık/kurulum gerekmiyor. Tek setup adımı, paylaşılan sabitin nereye konacağının netleştirilmesi.

- [X] T001 `src/utils/` altında bu özelliğin iki yeni dosyası için yer aç: `windDirectionAtPoint.js` ve `windSpreadPrediction.js` (boş, sadece dosya başlığı/JSDoc ile) — mevcut `forecastLayerData.js`/`windLayerData.js` ile aynı dizin, aynı dosya-başı yorum konvansiyonu

**Checkpoint**: Setup tamamlandı, Foundational faza geçilebilir.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: US1 VE US2'nin ikisi de bir noktadaki rüzgar hızı+yönünü bilmeye ihtiyaç duyuyor — bu ortak çekirdek önce bitmeli.

**⚠️ CRITICAL**: Bu faz tamamlanmadan hiçbir kullanıcı hikayesi başlayamaz.

- [X] T002 `src/utils/windDirectionAtPoint.js` içinde `windDirectionAtPoint(lat, lng, flowSnapshot)` fonksiyonunu yaz — contracts/wind-spread-contract.md'deki sözleşmeye göre: `flowSnapshot.bounds`'a göre piksel koordinatına çevir, `<canvas>` ile texture'ın o pikselini oku, R/G kanallarını `dataRange`'in gerçek `[[uMin,uMax],[vMin,vMax]]` şekliyle (windLayerData.js'nin zaten döndürdüğü alan adı) ters normalize et, `windSpeed = hypot(u,v)`, `windDirectionDeg = toDegrees(atan2(v,u))` normalize [0,360) (research.md R3), nokta bounds dışında veya piksel geçersizse (blue kanal < 128) `null` döndür. Saf, DOM'dan bağımsız kısımlar (`uvToCompassBearingDeg`, `latLngToPixel`, `decodePixelToWindCondition`) ayrı dışa aktarılan fonksiyonlar olarak yazıldı — proje test ortamı (Vitest `node`, jsdom yok) canvas/Image mock'lamayı desteklemiyor, `windLayerData.js`'nin kendi `buildWindSpeedOverlayDataUrl`'ı da aynı sebeple hiç birim test edilmemiş; bu üçü test edilebilir, DOM'a dokunan ince orkestrasyon katmanı canlı Playwright ile doğrulanacak (quickstart.md)
- [X] T003 [P] `tests/unit/windDirectionAtPoint.test.js` içinde T002'nin saf fonksiyonları için birim testleri yaz — 11 test, hepsi geçti

**Checkpoint**: Foundation hazır — US1 ve US2 artık paralel başlayabilir.

---

## Phase 3: User Story 1 - Rüzgar yönünü görebilmek (Priority: P1) 🎯 MVP

**Goal**: Rüzgar & Akıntı panelinde Wind katmanı açıkken, haritada rüzgarın taşıdığı yönü gösteren bir işaret görünsün.

**Independent Test**: quickstart.md Doğrulama Senaryosu 1 — Wind Animate katmanı açıkken yön göstergesi görünüyor mu, veri olmayan bir bölgede sessizce kayboluyor mu.

### Implementation for User Story 1

- [X] T004 [US1] `src/components/MapView.vue` içinde `setFlowLayerEnabled('wind', ...)` başarılı snapshot fetch'inden sonra `updateWindDirectionAtCenter()` çağırıyor (harita merkezi + `lastWindSnapshot` ile `windDirectionAtPoint`'i çağırıp `uiStore.setCurrentWindDirection`'a yazıyor); `map.on('moveend', onMapMoveEndForWindDirection)` ile Wind aktifken pan/zoom sonrası yeniden hesaplanıyor; katman kapatılınca `uiStore.setCurrentWindDirection(null)`
- [X] T005 [US1] Gösterge, `MapView.vue` yerine `FlowControlPanel.vue`'ya eklendi (plan.md kararı: "mevcut rüzgar hız görselleştirmesinin doğal bir devamı" — panel zaten Source/Date satırlarını gösteriyor) — `uiStore.windEnabled && uiStore.currentWindDirection` varken dönen bir SVG ok + derece/hız metni render ediliyor, `null` iken satır hiç render edilmiyor (FR-005)
- [X] T006 [P] [US1] `windLayer.directionLabel` anahtarı 7 locale dosyasına da eklendi (mevcut `windLayer.*` blok konumuna, `masterClearLabel`'dan hemen sonra)

**Checkpoint**: US1 bağımsız olarak tam çalışır ve test edilebilir durumda — MVP burada teslim edilebilir.

---

## Phase 4: User Story 2 - Rüzgardan etkilenen bir afetin olası yayılım yönünü görmek (Priority: P2)

**Goal**: Rüzgardan etkilenen bir afet seçildiğinde, rüzgar yönündeki komşu hex'ler "olası etki alanı" olarak haritada işaretlensin.

**Independent Test**: quickstart.md Doğrulama Senaryosu 2 — bir yangın seçildiğinde etki alanı görünüyor mu, rüzgardan etkilenmeyen bir afette hiç görünmüyor mu, durgun havada "belirgin yön yok" durumu iletiliyor mu.

### Implementation for User Story 2

- [X] T007 [US2] `src/utils/windSpreadPrediction.js` içinde `WIND_AFFECTED_HAZARD_TYPES` sabitini dışa aktar (`wildfire`, `dust_storm`, `volcano`, `cyclone` dahil; `tsunami` ve diğerleri kasıtlı olarak hariç) — kod tabanında bu listenin TEK kopyası
- [X] T008 [US2] `src/utils/windSpreadPrediction.js` içinde `computeSpreadProjection(sourceEvent, windCondition, options?)` fonksiyonunu yaz — h3-js `gridDisk`/`cellToLatLng` ile kaynak hex'ten 2 halka içindeki komşuları, rüzgar yönüyle ±45° içinde kalanları filtreleyerek `projectedHexIds` döndürüyor
- [X] T009 [P] [US2] `tests/unit/windSpreadPrediction.test.js` içinde T007/T008 için birim testleri yaz — 10 test, hepsi geçti (rüzgardan-etkilenmeyen tip için null, tsunami için özellikle null, durgun hava için null, gerçek Aydın koordinatlarıyla üretilen hex'lerin doğru yönde olduğu doğrulandı)
- [X] T010 [US2] Not: `uiStore.selectedDisaster` sadece GlobeView.vue'dan besleniyor — MapView.vue'nun kendi Impact Analysis seçimi zaten ayrı bir local ref (`selectedImpactEvent`, spec 008'den beri var, marker click'lerinden set ediliyor). Plan/tasks'taki varsayım küçük bir sapmaydı (bu oturumun kabul ettiği türden — bkz. contracts.md'nin dataRange şekli sapması); `watch(selectedImpactEvent, updateWindSpreadProjection)` eklendi — event `WIND_AFFECTED_HAZARD_TYPES` içindeyse ve `h3_id`'si varsa, `fetchLatestFlowSnapshot('wind')` + `windDirectionAtPoint` + `computeSpreadProjection` zincirini çalıştırıyor; stale-selection guard ile async sırasında seçim değişirse sonucu atıyor
- [X] T011 [US2] Yeni, ayrı bir kaynak/katman çifti eklendi: `wind-spread-projection` source + `wind-spread-fill`/`wind-spread-stroke` layer (amber/turuncu, `disaster-hex`'ten kasıtlı olarak ayrı — o yoğunluk ısı haritası, bu tekil-olay vurgusu, ikisi aynı anda görünebilir). `renderWindSpreadHexes()` `cellToBoundary` ile GeoJSON üretiyor; `null`/boş projeksiyonda kaynak boşaltılıyor
- [X] T012 [US2] `.wind-spread-no-direction-note` — `windSpreadNoDirection` true iken (seçili olay rüzgardan-etkilenen ama projeksiyon `null`) Impact Analysis dock'unun üstünde küçük bir metin gösteriliyor
- [X] T013 [P] [US2] `windLayer.spreadNoDirection`, `windLayer.spreadAreaTitle`, `windLayer.spreadAsOf` anahtarları 7 locale dosyasına da eklendi

**Checkpoint**: US1 ve US2 birlikte, birbirinden bağımsız çalışır durumda.

---

## Phase 5: User Story 3 - Olası etki alanını mevcut Etki Analizi/alarm akışına bağlamak (Priority: P3)

**Goal**: Gösterilen olası etki alanı, elle bölge çizmeye gerek kalmadan mevcut Etki Analizi paneline aktarılabilsin.

**Independent Test**: quickstart.md Doğrulama Senaryosu 3 — üretilen etki alanı seçilip "Etki Analizi ile incele" tetiklendiğinde mevcut panel bu alanı bir bölge olarak kullanıp hesaplama yapıyor mu.

### Implementation for User Story 3

- [X] T014 [US3] `computeCoveringRadiusKm(projection)` eklendi — haversine ile kaynak hex'ten her `projectedHexIds` merkezine olan en uzak mesafe + 2km pay; `projection` boş/null ise `null`. 3 yeni birim test (null durumu, pozitif/mantıklı büyüklük, hexRings ile büyüme) — 15 test hepsi geçti
- [X] T015 [US3] `ImpactPanel.vue`'ya `radiusOverrideRequestKm` prop'u eklendi (değiştiğinde mevcut local `radiusOverride` ref'ini set eden bir `watch`, `magnitudeOverride`'ı temizler — mevcut "bir kontrol kazanır" kuralıyla tutarlı). `MapView.vue`'da özet kutusunun içine `.wind-spread-analyze-btn` eklendi — tıklanınca `computeCoveringRadiusKm` sonucunu `windSpreadRadiusRequestKm` ref'ine yazıp prop üzerinden ImpactPanel'e aktarıyor; seçim değiştiğinde `updateWindSpreadProjection` bu ref'i sıfırlıyor
- [X] T016 [P] [US3] `windLayer.spreadAnalyzeButton` anahtarı 7 locale dosyasına da eklendi

**Checkpoint**: Üç kullanıcı hikayesi de bağımsız olarak çalışır durumda.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Tüm hikayeleri etkileyen son kontroller.

- [X] T017 [P] 7 locale dosyası da geçerli JSON — her i18n değişikliğinden sonra tekrar tekrar doğrulandı, sonuncusu bu adımda
- [X] T018 `npx eslint` değiştirilen dosyalarda sadece bu özellikten önce de var olan 1 pre-existing hata dışında temiz (`MapView.vue:407 __metricValueLabel` — spec 070 ile ilgisiz); `npm run build` başarılı; `npx vitest run --testTimeout=20000` → 315/315 test geçti
- [X] T019 Canlı Playwright (kimlik doğrulamalı, mgoktugd@gmail.com) ile Senaryo 1 (US1) doğrulandı: Wind Animate açıldığında `.flow-wind-direction-row` gerçek verilerle render ediyor ("10° · 4.6 m/s"), konsol hatası yok. Senaryo 2/3 (US2/US3) için canlı bir doğrulama denemesinde önemli bir bulgu ortaya çıktı: haritanın olay listesi her zaman en-güncel global satırları döndürüyor (PostgREST 1000-satır limiti) ve bu oturumda erken yapılan `h3_id` ingest düzeltmesi henüz ayrı/her-zaman-çalışan ingest servisine deploy edilmediği için (bkz. `project_disaster_volume_aggregation_fix.md` belleği) şu an haritada görünen HİÇBİR olayda `h3_id` yok — doğrudan Supabase REST sorgusuyla doğrulandı (`firms-2026-08-17-...` → `h3_id: null`). Bu spec 070'in bir hatası DEĞİL: `computeSpreadProjection`'ın `h3_id` yoksa `null` dönmesi (FR-009) tam olarak beklenen/doğru davranış. Eski, `h3_id`'si olan bir satır da doğrudan sorgulanarak bulundu (`firms-2026-07-26-...`, Montana) ama harita UI'ı konum bazlı değil zaman bazlı en-güncel listelediği için o satırı tıklamayla seçtirmek bu oturumda mümkün olmadı. US2/US3'ün kod yolu bu yüzden canlı UI'da uçtan uca gösterilemedi; güven kaynağı: 24 birim testi (tümü geçti) + kod incelemesi + T004-T016'daki gerçek kaynak/katman/prop kablolaması. Not: ingest servisi redeploy edildikten sonra bu senaryo tekrar canlı doğrulanmalı.
- [X] T020 Regresyon: mevcut Wind Animate katmanı T019'da doğrulandı (parçacıklar + artık yön göstergesi birlikte çalışıyor, hata yok). Mevcut Etki Analizi elle-marker-seçme akışı da dolaylı olarak doğrulandı — canlı oturumda 80+ farklı olay markerı tıklandı, hepsinde Etki Analizi dock'u placeholder yerine gerçek olay içeriğini gösterdi (regresyon yok); radiusOverride'ın var olan davranışı (`ImpactPanel.vue`'nun kendi input'u) değişmedi, sadece yeni bir opsiyonel prop (`radiusOverrideRequestKm`) eklendi.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Bağımsız, hemen başlar.
- **Foundational (Phase 2)**: Setup'a bağlı — TÜM kullanıcı hikayelerini BLOKE eder.
- **User Stories (Phase 3-5)**: Hepsi Foundational'ın bitmesine bağlı; US1/US2/US3 kendi aralarında sıralı (US3, US2'nin çıktısını kullanıyor) ama US1 ile US2 birbirinden bağımsız paralel yürütülebilir.
- **Polish (Phase 6)**: İstenen tüm kullanıcı hikayelerinin tamamlanmasına bağlı.

### User Story Dependencies

- **US1 (P1)**: Yalnızca Foundational'a bağlı — diğer hikayelerden bağımsız.
- **US2 (P2)**: Foundational'a bağlı; US1 ile aynı temel fonksiyonu (T002) paylaşır ama US1'in UI'ı tamamlanmadan da bağımsız test edilebilir.
- **US3 (P3)**: US2'nin ürettiği `projectedHexIds`'e bağlı (US2 tamamlanmadan anlamlı şekilde test edilemez).

### Parallel Opportunities

- T003 (US1/US2'nin ortak testi) T002 ile aynı anda yazılabilir (TDD: önce test).
- T006, T009, T013, T016, T017 gibi `[P]` işaretli görevler kendi fazları içinde paralel yürütülebilir (farklı dosyalar).
- Foundational bittikten sonra US1 (T004-T006) ve US2'nin T007-T009 kısmı paralel başlayabilir.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) + Phase 2 (Foundational) tamamla.
2. Phase 3 (US1) tamamla — artık kullanıcılar rüzgar yönünü görebiliyor.
3. **DURDUR ve DOĞRULA**: quickstart.md Senaryo 1'i çalıştır.
4. İstenirse burada teslim/demo edilebilir.

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
- `windSpreadPrediction.js`/`windDirectionAtPoint.js` saf fonksiyonlar — test etmesi kolay, UI'dan bağımsız.
- `WIND_AFFECTED_HAZARD_TYPES`'ın TEK kopyası `windSpreadPrediction.js`'de — başka hiçbir dosyada bu listeyi kopyalama (Constitution I).
- Her görevden sonra (özellikle i18n dosyalarını değiştiren görevlerden sonra) JSON geçerliliğini kontrol et.
