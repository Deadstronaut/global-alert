# Phase 0 Research: Çapraz-Afet Risk Çıkarımı ve Öngörü Raporu

## R1: İkincil-risk kuralları nasıl modellenir?

**Decision**: Spec 070'in `WIND_AFFECTED_HAZARD_TYPES`/`computeSpreadProjection` desenini genelleştiren, tek bir dosyada (`src/utils/lateralRiskRules.js`) yaşayan, deklaratif bir kural listesi:

```js
{
  id: 'fire-from-quake-drought-heat',
  triggerTypes: ['earthquake'],
  requiresNearby: [{ type: 'drought' }, { type: 'disaster', subtype: 'heatwave' }], // ANY eşleşirse tetiklenir
  riskId: 'fire_spread_potential',
  institutionCategories: ['fire_department', 'disaster_management'],
}
```

Her kural: hangi afet tipi(leri) tetikler, hangi "yakında aktif" katman/hazard kombinasyonu koşulunu arar (proximity: spec 070'teki h3 `gridDisk` deseniyle aynı — kaynak hex'ten N halka içinde, belirli bir zaman penceresinde aktif olay var mı), hangi risk bulgusunu üretir, hangi kurum kategorilerini önerir.

**Rationale**: Yeni bir kural/afet tipi eklemek bu listeye bir satır eklemek — Constitution I (Hazard-Agnostic) ile birebir uyumlu, spec 070'te zaten kanıtlanmış bir desen.

**Alternatives considered**: Genel amaçlı bir "kural motoru" (JSON-tabanlı DSL, kullanıcı-düzenlenebilir kurallar) — YAGNI'ye aykırı, v1 kapsamında gerek yok; sabit kodlanmış ama TEK dosyada yaşayan bir liste yeterli ve çok daha basit.

## R2: Kıyı/batimetri verisi — gerçekten yeni bir veri kaynağı mı gerekiyor?

**Decision**: HAYIR. Mevcut `MapView.vue` zaten dünya ülke sınırlarını (`world-countries` GeoJSON, `country-fills`/`custom-territories` katmanları) ve her ülkenin poligon geometrisini istemci tarafında yüklüyor. Bir noktanın "kıyıya kaba mesafesi", o noktanın en yakın ülke sınırı poligon kenarına olan öklid/haversine mesafesi olarak hesaplanabilir — poligonun kenarı zaten çoğu durumda ya bir kara sınırı ya da bir kıyı hattı; bu özelliğin istediği "kaba coğrafi sezgi" (gerçek batimetri/dalga modeli değil) için yeterli bir yaklaşıklık.

Somut yöntem: seçili afetin en yakın ülke poligonunun tüm segment noktalarına nokta-çizgi-segment mesafesi hesaplanır (aynı `hexWorker.js`'nin zaten yaptığı ring/coordinate işleme desenine benzer), minimum mesafe döndürülür. Yeni bir dış veri kaynağı, ingest script'i veya DB tablosu GEREKMİYOR.

**Rationale**: Constitution VIII (Simplicity/YAGNI) — gerçek bir batimetri veri seti (GEBCO vb.) hem büyük (yüzlerce MB), hem ayrı bir ingest hattı gerektirir, hem de "kaba sezgi" seviyesinin çok ötesinde bir doğruluk sunar ki bu özellik zaten "gerçek dalga simülasyonu değildir" diye açıkça belirtiyor. Var olan veriden türetilebilen bir yaklaşıklık, spec'in kendi dürüstlük ilkesiyle (FR-010, FR-012) tam uyumlu.

**Alternatives considered**: Natural Earth coastline shapefiline yeni bir statik dosya olarak eklemek — biraz daha doğru olurdu ama yeni bir asset/build adımı gerektirir; v1 için gerekçelendirilemeyecek kadar fazla karmaşıklık. İleride gerçek fizik simülasyonuna geçilmek istenirse (kullanıcının uzun vadeli vizyonu) o zaman yeniden değerlendirilebilir — bu spec'in kapsamı dışında.

## R3: "Bölgede X katmanı aktif mi" nasıl sorgulanır?

**Decision**: Kuraklık/sıcak-soğuk hava dalgası/toz fırtınası, sistemde ayrı "katman" değil, ayrı hazard event TİPLERİ (kuraklık kendi `drought` tablosunda, sıcak/soğuk hava dalgası ve toz fırtınası ortak `disaster` tablosunda `type` alanıyla ayrılıyor — bkz. `supabaseService.js` TABLE_MAP yorumu: "kendi özel tablosu olmayan hazard type'lar için genel kova"). "Bölgede aktif mi" sorusu, seçili afetin h3 hex'inden N halka içinde, son M saat içinde zaman damgalı bir olay var mı sorusuna indirgeniyor — spec 070'in `computeSpreadProjection`'ıyla birebir aynı `gridDisk` + zaman penceresi deseni, sadece rüzgar yönü koni filtresi yerine "var mı/yok mu" kontrolü.

**Rationale**: Yeni bir sorgu altyapısı kurmuyoruz, zaten istemciye çekilmiş `disasterStore.allEvents` üzerinde çalışan aynı proximity mantığını yeniden kullanıyoruz.

## R4: Yol ağı yoğunluğu / kritik altyapı erişimi nasıl değerlendirilir?

**Decision**: `ImpactPanel.vue`'nun zaten kullandığı `compute_zonal_stats` RPC'si (dataset_id + lat/lng + radius parametreleriyle) `osm` (yol ağı) exposure dataset'i için de çağrılabilir — dönen `feature_count`/`total_value` bir yol yoğunluğu proxy'si olarak kullanılır (düşük yoğunluk → erişim riski daha yüksek). Kritik altyapı listesi için zaten var olan `get_critical_infrastructure_features` RPC'si aynen kullanılır.

**Rationale**: Sıfır yeni backend kodu — mevcut, zaten üretimde çalışan iki RPC'nin farklı bir dataset/parametre kombinasyonuyla yeniden kullanılması.

## R5: Şehir/kasaba listesi nasıl üretilir?

**Decision**: `src/data/boundaries/index.js`'nin zaten desteklediği `loadRegionBoundaries(countryCode, 'district')` + `src/utils/pointInPolygon.js`'nin `findRegion()` fonksiyonu — etkilenen hex/nokta kümesi (spec 070'in `projectedHexIds`'i veya bu özelliğin kendi etki yarıçapı) için her noktanın hangi ilçe/kasaba sınırına düştüğü bulunur, tekilleştirilir.

**Rationale**: Bu tam olarak bu fonksiyonların var olma sebebi (zaten `ImpactPanel.vue`'da benzer amaçla kullanılıyor) — sıfır yeni kod, sadece 'district' seviyesinde çağrı.

## R6: "Kritik durum" tetikleyicisi neye göre tetiklenir?

**Decision**: Zaten istemciye çekilmiş (`disasterStore.allEvents`) olaylar arasında `severity === 'critical'` olan VEYA deprem için `magnitude >= 6.0` olan herhangi bir olay varsa tetikleyici aktif olur — bu, mevcut `SEVERITY_TIERS_STRONGEST_FIRST`/severity alanını zaten kullanan bir `computed`, yeni bir ağ isteği veya arka plan işi gerektirmez.

**Rationale**: Constitution VII (Performance) — yeni bir polling mekanizması eklemeden, zaten var olan reaktif veriden türetilen bir bayrak.

## R7: Reduced-motion erişilebilirliği

**Decision**: Tetikleyici, `prefers-reduced-motion`/uygulamanın kendi "safe mode" ayarı açıkken CSS animasyonu (yanıp sönme) yerine sabit, yüksek-kontrast bir rozet + sayı gösterir — MHEWS'in zaten var olan reduced-motion "safe mode" davranışıyla aynı desen (Constitution VI).

**Rationale**: Anayasa VI, reduced-motion'ı "ilk sınıf, her zaman var olan" bir gereksinim olarak tanımlıyor — bu özellik onu bir istisna olarak ekleyemez.
