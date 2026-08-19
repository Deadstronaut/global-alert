# Phase 1 Data Model: Çapraz-Afet Risk Çıkarımı ve Öngörü Raporu

Hiçbiri DB tablosu DEĞİL — hepsi istemci tarafında, seçili bir afet için anlık hesaplanan, bellekte yaşayan şekiller (research.md, "Storage: N/A").

## LateralRiskRule (statik, kod içinde — `lateralRiskRules.js`)

```
{
  id: string                          // ör. 'fire-from-quake-drought-heat'
  triggerTypes: string[]              // bu kural hangi afet tiplerinde değerlendirilir
  nearbyConditions: {                 // ANY eşleşirse kural tetiklenir
    hazardType: string,               // 'drought' | 'disaster' (+ subtype) | ...
    subtype?: string,                 // ör. 'heatwave', 'coldwave', 'dust_storm'
    hexRings?: number,                // varsayılan: küçük, sabit (research.md R3)
    withinHours?: number,             // varsayılan: küçük, sabit
  }[]
  riskId: string                      // i18n anahtarına eşlenir
  institutionCategories: string[]     // InstitutionCategory id'leri
}
```

## SecondaryRiskFinding (runtime, hesaplanan)

```
{
  ruleId: string                      // hangi LateralRiskRule ürettiğini izler (FR-014)
  riskId: string
  matchedConditions: string[]         // hangi nearbyConditions eşleşti (izlenebilirlik)
  institutionCategories: string[]
}
```
`null`/boş liste = "belirgin bir ikincil risk tespit edilmedi" (FR-003). Asla varsayılan/uydurma bir bulgu üretilmez.

## CoastalProximityResult (runtime, hesaplanan — research.md R2)

```
{
  distanceKm: number                  // en yakın ülke sınırı segmentine kaba mesafe
}
```
Yalnızca `distanceKm` bir eşiğin altındaysa (planlama aşamasında sabitlenecek, ör. 50km) ve afet büyüklüğü eşiği aşıyorsa `tsunami_risk_potential` bulgusu üretilir (FR-012).

## AffectedFacility (runtime — `get_critical_infrastructure_features` RPC'sinden)

Zaten var olan RPC dönüş şekli aynen kullanılır — yeni bir alan eklenmiyor.

## AffectedRegion (runtime — `findRegion()`'dan)

```
{
  name: string                        // 'district' seviyesi (şehir/kasaba)
}
```
Etkilenen hex/nokta kümesindeki her benzersiz bölge adı bir kez listelenir.

## InstitutionCategory (statik, kod içinde — `institutionCategoryMap.js`)

```
{
  id: string                          // 'fire_department' | 'health' | 'disaster_management' | 'water_infrastructure' | ...
  labelKey: string                    // i18n anahtarı — özel kurum ismi DEĞİL, genel kategori
}
```

## ForecastReport (runtime, tek sayfalık raporun tüm içeriği)

```
{
  sourceEvent: DisasterEvent          // mevcut model, değişmedi
  generatedAt: string                 // ISO timestamp
  secondaryRisks: SecondaryRiskFinding[]
  affectedRegions: AffectedRegion[]
  affectedFacilities: AffectedFacility[]
  institutionCategories: InstitutionCategory[]  // secondaryRisks'ten türetilen, tekilleştirilmiş liste
  disclaimer: string                  // her zaman sabit — "SEZGİSEL ÖNGÖRÜ..." (FR-010)
}
```
Hiçbir alanı bir DB'ye yazılmaz; kullanıcı raporu kapatınca bellekten düşer, tekrar açıldığında yeniden hesaplanır (Edge Cases: "kalıntı görünmez").
