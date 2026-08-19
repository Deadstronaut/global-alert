# Phase 1 Data Model: Rüzgar Yönüne Dayalı Yayılım Tahmini

Bu özellik yeni bir veritabanı tablosu eklemiyor (bkz. research.md R1/R2) — aşağıdaki "varlıklar" kalıcı DB şemaları değil, istemci tarafında anlık hesaplanan/tutulan veri şekilleridir.

## Hex Rüzgar Koşulu (`HexWindCondition`)

Kaynak: mevcut `flow_snapshots` texture'ının (bkz. research.md R1) tek bir noktada anlık decode edilmesiyle üretilir — kalıcı olarak saklanmaz.

| Alan | Tip | Açıklama |
|---|---|---|
| `h3Id` | string | Sorgulanan hex'in kimliği (afet olaylarının zaten kullandığı sütunla aynı format) |
| `windSpeed` | number | m/s, `hypot(u, v)` |
| `windDirectionDeg` | number \| null | 0-360, pusula ekseninde, "rüzgarın taşıdığı yön" (research.md R3) — `null` = bu noktada geçerli veri yok (kara maskesi/NaN) |
| `issuedAt` | ISO string | Kullanılan `flow_snapshots` satırının `issued_at` değeri — freshness göstergesi için (FR-006) |

**Validation/State rules**:
- `windDirectionDeg` hesaplanamıyorsa (texture'da o piksel geçersiz/NaN, ör. kara maskesi) `null` döner — asla varsayılan/uydurma bir yön (ör. 0°) DÖNMEZ (FR-005).
- `windSpeed` bir eşik değerin altındaysa (durgun hava — spec Edge Cases) çağıran kod bunu "yayılım yönü anlamlı değil" olarak yorumlar; bu eşik `windSpreadPrediction.js` içinde tek bir sabit olarak tutulur.

## Olası Etki Alanı (`SpreadProjection`)

Kaynak: `HexWindCondition` + kaynak afet olayı, `windSpreadPrediction.js`'deki saf fonksiyonla üretilir — kalıcı olarak saklanmaz, her seçimde yeniden hesaplanır.

| Alan | Tip | Açıklama |
|---|---|---|
| `sourceEventId` | string | Hangi afet olayına ait (afet olayının kendi `id`'si) |
| `sourceHazardType` | string | Afet tipi — yalnızca `WIND_AFFECTED_HAZARD_TYPES` içindekiler için bu obje hiç üretilmez (research.md R4) |
| `sourceH3Id` | string | Olayın bulunduğu hex |
| `windCondition` | `HexWindCondition` | Bu tahminin dayandığı rüzgar verisi (FR-006'nın "hangi veriye dayanıyor" gereksinimi doğrudan bu alandan okunur) |
| `projectedHexIds` | string[] | Rüzgar yönündeki "koni" içinde kalan komşu hex'ler (research.md R5) — boş dizi = anlamlı bir yayılım yönü yok (durgun hava veya veri eksik) |

**State rules**:
- `projectedHexIds` boşsa, UI hiçbir yön oku/renklendirilmiş hex GÖSTERMEZ, bunun yerine "belirgin bir yayılım yönü yok" durumunu iletir (spec US2 Acceptance Scenario 2).
- Aynı bölgede birden fazla rüzgardan-etkilenen aktif afet varsa, her biri için ayrı bir `SpreadProjection` üretilir (FR-008) — paylaşılan/birleştirilmiş bir state yok.

## Rüzgardan Etkilenen Afet Tipleri Listesi (`WIND_AFFECTED_HAZARD_TYPES`)

Kod içinde tek bir sabit (Set/array), DB şeması değil (research.md R4 — v1 kapsamı için YAGNI kararı).

| Afet tipi | Dahil mi? | Gerekçe |
|---|---|---|
| `wildfire` | ✅ | Duman/alev doğrudan rüzgar yönünde ilerler |
| `dust_storm` | ✅ | Toz bulutu doğrudan rüzgarla taşınır |
| `volcano` | ✅ | Kül bulutu dağılımı büyük ölçüde rüzgar yönüyle belirlenir |
| `cyclone` | ✅ (kaba gösterge) | Gerçek fırtına izi değil, yerel rüzgar yönü kaba bir hareket-yönü sinyali olarak kullanılır — UI'de bu netlik açıkça belirtilir |
| `tsunami` | ❌ | Dalga fiziği/okyanus tabanı yer değiştirmesiyle yayılır, rüzgarla ilgisi yok — göstermek bilimsel olarak yanlış olur |
| `earthquake`, `flood`, `drought`, `food_security`, `epidemic`, `heatwave`, `coldwave` | ❌ | Nokta-kaynaklı rüzgar-yönü yayılımı kavramına uymuyor (research.md R4 / spec Assumptions) |
