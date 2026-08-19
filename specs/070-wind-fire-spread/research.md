# Phase 0 Research: Rüzgar Yönüne Dayalı Yayılım Tahmini

## R1: Rüzgar yönü verisi nereden gelecek?

**Decision**: Yeni bir veri kaynağı/fetch YOK. `wind-importer/fetch_gfs.py`, "wind_speed" için zaten GFS'ten hem `UGRD` (doğu-batı bileşeni, u) hem `VGRD` (kuzey-güney bileşeni, v) 10m rüzgar bileşenlerini indiriyor (satır ~262: `"wind_speed": {"var_UGRD": "on", "var_VGRD": "on", "lev_10_m_above_ground": "on"}`). Bu ham u/v değerleri, `wind-importer/flow_texture_common.py`'deki `build_flow_texture()` fonksiyonuyla zaten kayıpsız şekilde bir RG-kanal PNG texture'ına kodlanıp (`u_min/u_max/v_min/v_max` metadata'sıyla birlikte) `flow_snapshots` tablosuna/Storage'a yayınlanıyor — bu texture, Animate katmanındaki parçacık animasyonunun (simple-wind-layer.js) yön+hız bilgisini decode ettiği aynı kaynak.

**Rationale**: Yön bilgisi zaten hesaplanıp yayınlanmış durumda, sadece "hıza indirgenmeden önce" bir ara adımda kayboluyordu (wind_speed sütunu `sqrt(u²+v²)`'ye indirgiyor, `atan2(v,u)`'yu hiç hesaplamıyor/saklamıyor değil — v/u ayrı ayrı zaten Storage'da bir PNG içinde duruyor). Yeni bir GRIB indirme/parse adımı açmak gereksiz tekrar olurdu (Constitution VIII).

**Alternatives considered**:
- Yeni bir GRIB fetch + ayrı bir "wind_direction" sütunu eklemek `wildfire`/`wind_speed` tablosuna → Reddedildi: mevcut u/v verisi zaten var, tekrar indirmek gereksiz ağ/CPU maliyeti.
- Yön hesaplamayı Python tarafında (ingest sırasında) yapıp yeni bir sütun/tablo olarak kalıcı saklamak → Aşağıda R2'de tartışıldı, reddedildi (gereksiz depolama + her hex için önceden hesaplama).

## R2: Rüzgar yönünü afet olaylarının h3_id sistemine nasıl bağlarız?

**Decision**: Kalıcı bir "hex başına rüzgar" tablosu/ingest adımı YOK. İstemci tarafında, kullanıcı rüzgardan-etkilenen bir afet SEÇTİĞİNDE (talep üzerine, spec Assumptions), o afetin `h3_id`'sinden `h3.cellToLatLng()` ile merkez koordinat elde edilir; bu koordinat, o an aktif `flow_snapshots` texture'ının `bounds`'una göre piksel koordinatına çevrilip, `<canvas>` ile texture'ın o pikseli okunur; R,G kanalları `uMin/uMax/vMin/vMax` ile ters normalize edilerek gerçek u,v değerine dönüştürülür; hız=`hypot(u,v)`, yön=`atan2(v,u)` (matematiksel, pusula değil — bkz. R3) hesaplanır.

**Rationale**: 720×361'lik (0.5°) global texture, dünyadaki HER hex için önceden bir satır hesaplayıp saklamak (onbinlerce satır, çoğu hiç kullanılmayacak) yerine, sadece gerçekten ihtiyaç duyulan TEK noktada (seçili afetin konumu) anlık çözülüyor. Bu hem yeni bir migration/tablo gerektirmiyor hem de "veri her zaman güncel" garantisini otomatik sağlıyor (en son yayınlanan texture neyse o kullanılıyor, ayrı bir senkronizasyon adımı yok).

**Alternatives considered**:
- Her ingest döngüsünde tüm aktif afet hex'leri için sunucu tarafında (Python veya Deno Edge Function) u/v örnekleyip küçük bir `forecast_hex_wind` tablosuna yazmak → Reddedildi: gerçek zamanlı olarak hangi hex'lerin "aktif rüzgardan-etkilenen afet" içerdiğini ingest worker'ın bilmesi için afet tablolarını da sorgulaması gerekirdi (bugüne kadar wind-importer ve disaster ingest tamamen ayrı, birbirinden habersiz süreçler) — bu, iki bağımsız pipeline'ı gereksiz yere birbirine bağımlı hale getirirdi.
- Bir Supabase RPC/Edge Function'da sunucu tarafında piksel okuma → Mümkün ama gereksiz round-trip; PNG zaten public Storage URL'i olarak istemciye ulaşıyor (Animate katmanı zaten client-side'da aynı görseli çekip decode ediyor), aynı işi istemcide yapmak bir ağ isteği daha eksiltir.

## R3: Yön gösterimi — "rüzgar nereden esiyor" mu "nereye esiyor" mu?

**Decision**: Yayılım tahmini için **"nereye esiyor"** (blowing-TOWARD) yönü kullanılacak — meteorolojik raporlamanın standart "nereden esiyor" (blowing-FROM) kuralının TERSİ. Hesaplama: `toDegrees(atan2(v, u))`, sonra ekran/pusula eksenine çevir (0°=Kuzey, 90°=Doğu), normalize [0,360).

**Rationale**: Kullanıcı senaryosu açıkça yayılım YÖNÜNÜ istiyor ("yangın batıya doğru yayılacak") — yani rüzgarın taşıdığı/ittiği yön. Meteorolojik "rüzgar batıdan esiyor" ifadesi ise kaynağı işaret eder, kafa karıştırır (batıdan esen rüzgar aslında DOĞUYA doğru taşır). UI'de her iki yönü de karıştırmamak için tek bir etiket kullanılacak: "yayılım yönü" / "rüzgarın taşıdığı yön", asla çıplak "rüzgar yönü" gibi belirsiz bir ifade değil.

**Alternatives considered**: Standart meteorolojik "FROM" konvansiyonunu göstermek → Reddedildi, kullanıcı senaryosuyla doğrudan çelişir ve yanlış anlaşılmaya çok açık.

## R4: Hangi afet tipleri "rüzgardan etkilenir"?

**Decision**: spec.md'nin Assumptions bölümünde detaylandırılan liste — Dahil: yangın, toz fırtınası, yanardağ (kül), kasırga (kaba yön göstergesi). Hariç: tsunami, deprem, sel, kuraklık, gıda güvenliği, salgın, sıcak/soğuk hava dalgası. Bu liste, kodda TEK bir yerde (`src/utils/windSpreadPrediction.js` içinde bir `WIND_AFFECTED_HAZARD_TYPES` sabiti/Set olarak) tutulacak — Constitution I (Hazard-Agnostic, Model-Driven Design) gereği, yeni bir afet tipi eklendiğinde bu tek satırlık listeye eklemek yeterli olmalı, kod yapısında dallanma gerekmemeli.

**Rationale**: Bilimsel doğruluk (tsunami rüzgarla yayılmaz) + spec FR-009'un açık gerekliliği (yanlış çıkarım asla verilmeyecek).

**Alternatives considered**: `hazard_types` veritabanı tablosuna gerçek bir `wind_affected boolean` sütunu eklemek → Değerlendirildi, v2 için makul bir iyileştirme olarak not edildi (spec Assumptions'ta zaten "ileride genişletilebilir olmalı" diye belirtildi) ama v1 için sabit kod listesi, ekstra bir migration/admin-UI olmadan aynı gereksinimi (tek yerden yönetim) karşılıyor — YAGNI.

## R5: Komşu hex "olası etki alanı" nasıl hesaplanır?

**Decision**: h3-js'in mevcut `gridDisk`/komşuluk fonksiyonları (uygulamanın zaten `MapView.vue`/`disaster.js`'de kullandığı aynı kütüphane) ile, kaynak hex'ten başlayıp sabit küçük bir yarıçapta (ör. 2-3 halka) tüm komşuları alıp, her komşunun kaynak hex'e göre açısını (merkezler arası bearing) hesaplayıp, rüzgar yönüyle (R3) dar bir açı aralığında (ör. ±45°) örtüşenleri "olası etki alanı" olarak işaretlemek — düz bir daire değil, rüzgar yönünde dar bir "koni" şekli.

**Rationale**: Spec'in "basit sezgisel, gerçek fizik simülasyonu değil" varsayımıyla tutarlı; h3-js zaten kod tabanında var, yeni bir bağımlılık gerekmez.

**Alternatives considered**: Tam bir dairesel etki alanı (yön ayrımı yapmadan) → Reddedildi, "yayılım YÖNÜ" göstermek asıl istenen değer, yönsüz bir daire bunu kaybeder.
