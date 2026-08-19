# Contract: Lateral Risk Inference

## `src/utils/lateralRiskRules.js`

### `evaluateLateralRisks(sourceEvent, nearbyEventsLookup, options?) → SecondaryRiskFinding[]`

- `sourceEvent`: `{ id, type, h3_id, magnitude?, severity? }` — seçili afet.
- `nearbyEventsLookup`: `(hazardType, subtype?) => DisasterEvent[]` — çağıran tarafın (MapView.vue) zaten yüklü `disasterStore.allEvents`'ten, verilen tip/alttip için `sourceEvent.h3_id`'nin `hexRings` halkası içinde ve `withinHours` penceresinde olan olayları döndüren bir fonksiyon. Saf mantığı DOM/store'dan ayırmak için enjekte edilir (test edilebilirlik — `windDirectionAtPoint.js`'in DOM-ayırma deseniyle aynı gerekçe).
- `options`: `{ hexRings?, withinHours? }` — kural bazında override, yoksa `lateralRiskRules.js`'nin kendi varsayılanları.
- **Dönüş**: `sourceEvent.h3_id` yoksa veya `sourceEvent.type` hiçbir kuralı tetiklemiyorsa `[]`. Aksi halde eşleşen her kural için bir `SecondaryRiskFinding`.
- **Asla**: uydurma/varsayılan bir bulgu üretmez; `nearbyEventsLookup` boş dönerse o kural hiç eşleşmez.

### `WIND_SPREAD_AS_FINDING(spreadProjection) → SecondaryRiskFinding | null`

Spec 070'in `computeSpreadProjection()` çıktısını (varsa) bu özelliğin `SecondaryRiskFinding` şekline çeviren küçük bir adaptör — aynı hesaplamayı TEKRAR ÜRETMEZ (FR-005), sadece mevcut sonucu bu listeye bir satır olarak ekler.

## `src/utils/lateralRiskRules.js` (kıyı mesafesi)

### `coastalDistanceKm(lat, lng, countryBoundaryFeatures) → number | null`

- `countryBoundaryFeatures`: MapView.vue'nun zaten yüklü `world-countries` GeoJSON feature listesi.
- **Dönüş**: en yakın poligon sınır segmentine haversine mesafesi (km); geometri hiç yoksa `null`.
- Saf fonksiyon, DOM'a bağımlı değil — doğrudan test edilebilir.

### `computeTsunamiRiskFinding(sourceEvent, distanceKm, options?) → SecondaryRiskFinding | null`

- Yalnızca `sourceEvent.type === 'earthquake'`, `distanceKm` eşik-altı, ve `sourceEvent.magnitude` eşik-üstüyse bir bulgu döner; aksi halde `null`.
- Bulgu her zaman "kaba coğrafi sezgi, gerçek dalga simülasyonu değildir" notunu taşıyan bir `riskId` ile döner (i18n metni bu notu içerecek).

## `src/utils/institutionCategoryMap.js`

### `institutionCategoriesForFindings(findings) → InstitutionCategory[]`

Bir `SecondaryRiskFinding[]` listesinden, her bulgunun `institutionCategories`'ini tekilleştirip `InstitutionCategory` nesnelerine (id + i18n labelKey) çevirir. Gerçek kurum ismi/iletişim bilgisi HİÇBİR ZAMAN döndürmez (FR-008).

## UI Entegrasyon Sözleşmesi

- `LateralRiskReport.vue`, `evaluateLateralRisks()` + `computeTsunamiRiskFinding()` + spec 070'in `computeSpreadProjection()`'ının birleşik sonucunu render eder; hiçbiri boşsa "belirgin bir ikincil risk tespit edilmedi" mesajı gösterilir (asla boş bir liste sessizce gizlenmez — FR-003).
- Rapor açıldığında veya kapandığında hiçbir ağ isteği bir dış (üçüncü taraf) sisteme gitmez — yalnızca zaten var olan Supabase RPC'leri (`compute_zonal_stats`, `get_critical_infrastructure_features`) ve zaten yüklü boundary/store verisi kullanılır (FR-009, Constitution II).
- Tetikleyici rozeti, `prefers-reduced-motion`/uygulamanın safe-mode ayarı açıkken animasyonsuz (sabit rozet + sayı) render edilir (research.md R7).
- Rapor, `ImpactPanel.vue`'nun zaten sahip olduğu `canAnalyze` (super_admin/country_admin/org_admin) rol gate'iyle aynı erişim kısıtına tabidir.
