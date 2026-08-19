# Contract: Rüzgar Yönü + Yayılım Tahmini Yardımcı Fonksiyonları

Bu özelliğin dış arayüzü bir HTTP API değil (yeni bir backend endpoint'i yok — research.md R1/R2), iki saf frontend fonksiyonunun davranış sözleşmesidir. Her ikisi de `src/utils/` altında, mevcut `forecastLayerData.js`/`windLayerData.js` dosyalarıyla aynı konumda yaşayacak.

## `windDirectionAtPoint(lat, lng, flowSnapshot)`

**Girdi**:
- `lat`, `lng`: number — sorgulanan noktanın koordinatları (afetin h3_id'sinden `cellToLatLng` ile türetilir)
- `flowSnapshot`: `{ textureUrl, bounds: [west, south, east, north], uMin, uMax, vMin, vMax, issuedAt }` — `fetchLatestFlowSnapshot('wind')`'in zaten döndürdüğü şekil (windLayerData.js), yeni bir alan eklenmez

**Çıktı**: `Promise<HexWindCondition | null>` (bkz. data-model.md)
- Nokta `bounds` dışındaysa veya texture'da o piksel geçersizse (kara maskesi/NaN) → `null`
- Aksi halde `{ windSpeed, windDirectionDeg, issuedAt }`

**Garantiler**:
- Ağa yeni bir istek AÇMAZ eğer `flowSnapshot` zaten çağıran tarafından sağlanmışsa (decode işlemi tamamen mevcut texture verisi üzerinde, client-side).
- Asla `windDirectionDeg` için varsayılan/uydurma bir değer döndürmez — belirsizlik her zaman `null` ile işaretlenir.

## `computeSpreadProjection(sourceEvent, windCondition, options?)`

**Girdi**:
- `sourceEvent`: `{ id, type, h3_id }` — afet olayı (mevcut `DisasterEvent` şeklinden alt küme)
- `windCondition`: `HexWindCondition | null`
- `options.hexRings`: number (varsayılan: sabit küçük bir değer, ör. 2-3 — research.md R5)
- `options.coneAngleDeg`: number (varsayılan: sabit, ör. ±45°)

**Çıktı**: `SpreadProjection | null` (bkz. data-model.md)
- `sourceEvent.type`, `WIND_AFFECTED_HAZARD_TYPES` içinde değilse → `null` (FR-009 — bu afet tipleri için mekanizma hiç devreye girmez)
- `windCondition` `null`'sa veya `windSpeed` durgun-hava eşiğinin altındaysa → `null` (FR-005 — yanıltıcı yön uydurulmaz)
- Aksi halde: rüzgar yönündeki koni içindeki komşu hex'lerin listesiyle bir `SpreadProjection`

**Garantiler**:
- Saf fonksiyon — ağ isteği yok, harici state okumaz/yazmaz.
- Aynı girdiler her zaman aynı çıktıyı üretir (test edilebilirlik için önemli).
- `WIND_AFFECTED_HAZARD_TYPES` listesi bu dosyada tek bir yerde dışa aktarılır (`export`) — başka hiçbir dosyada bu afet-tipi listesinin bir kopyası TUTULMAZ (research.md R4, Constitution I).

## UI entegrasyon sözleşmesi (MapView.vue / ImpactPanel.vue)

- Bir `SpreadProjection` üretilemediğinde (yukarıdaki `null` durumları), harita hiçbir yön oku/renklendirilmiş hex GÖSTERMEZ — sessiz bir boşluk değil, kullanıcıya "belirgin bir yayılım yönü yok" durumu iletilir (spec US2 Acceptance Scenario 2, FR-005).
- `SpreadProjection.projectedHexIds`, Etki Analizi paneline mevcut "bölge seç" akışıyla AYNI arayüzden (bbox/hex listesi) aktarılır — Etki Analizi tarafında yeni bir özel giriş yolu açılmaz (FR-007, US3).
