# NEW GAME PLAN — Server/Cron Mimarisi ve Kaynak Envanteri

**Tarih:** 2026-07-22
**Durum:** Server (Docker aggregator) canlıda çalışıyor, kesim (cutover) tamamlandı, canlı doğrulandı.

Bu doküman, bugünkü uzun mimari inceleme oturumunda alınan tüm kararları ve tüm veri kaynaklarının GÜNCEL, GERÇEK durumunu tek bir yerde topluyor. `docs/Veri_Kaynaklari_Envanteri.docx` (genel kaynak envanteri) ile birlikte okunmalı — bu dosya özellikle **bugünkü mimari değişikliği** (server vs Edge Function kararı) ve onun sonuçlarını belgeliyor.

---

## 1. Yeni Mimari — Temel Kural

> **Canlı afet olayı kaynağı (earthquake/flood/wildfire/drought/tsunami/epidemic/food_security) → SADECE server'da (Docker `aggregator` konteyneri) çalışır.**
> **Periyodik toplu katman importu (nüfus/yol/nehir/havza/statik exposure) → SADECE Edge Function + `pg_cron`'da çalışır.**

**Neden:**
- `pg_cron`'un sözdizimsel tavanı 1 dakika — daha hızlı polling (15-20sn) veya kalıcı bağlantı (EMSC WebSocket) yapısal olarak mümkün değil.
- Server artık `docker-compose.yml`'de `restart: unless-stopped` ile sürekli açık — canlı olay kaynaklarının doğal yeri.
- Toplu katman importları (WorldPop, GHSL, Kontur vb.) ayda/haftada bir çalışan, ağır ama kısa süreli işler — sürekli açık bir sürece ihtiyaçları yok, Edge Function'ın "iş bitince kapan" modeli daha uygun.
- Admin panelinden herhangi bir ülkenin ekleyeceği **herhangi bir özel kaynak** (`dynamicSources.js`'in jenerik `field_map` mekanizması) zaten SADECE server'da çalışıyor — bu, sıfır ek kod gerektiren, zaten var olan bir tasarım. Yeni bir ülkeye sistem verildiğinde, o ülkenin admin'i panelden kaynak eklediği an otomatik olarak server'da çalışmaya başlar.

**Docker konteyner yapısı:**
```
frontend        → nginx, statik build (değişmedi)
aggregator      → server/ klasörü, sürekli açık, canlı afet olayları + P-wave + jenerik kaynak ekleme
meta-ghsl-importer → PLANLANDI, henüz kurulmadı (bkz. Bölüm 4)
```

---

## 2. Kaynakların Tam Durumu

### 2.1 Canlı Afet Olayları — Server'da (Docker `aggregator`)

| Kaynak | Hazard Tipi | Yöntem | Durum |
|---|---|---|---|
| EMSC | earthquake | WebSocket push (gerçek anlık) | ✅ Sağlıklı |
| USGS | earthquake | 15sn poll | ✅ Sağlıklı |
| AFAD | earthquake | 15sn poll | ✅ Sağlıklı |
| Kandilli | earthquake | 20sn poll | ✅ Sağlıklı |
| GEOFON | earthquake | 120sn poll | ✅ Sağlıklı |
| GDACS (REST + RSS) | earthquake/flood/wildfire/drought/multi_hazard | 300sn poll | ✅ Sağlıklı |
| WHO | epidemic | 1800sn poll | ✅ Sağlıklı |
| PTWC (REST + RSS) | tsunami | 120-180sn poll | ✅ Sağlıklı |
| FEWS NET | food_security | 21600sn poll | ✅ Sağlıklı |
| P-wave erken uyarı | earthquake (M4.0+) | Yukarıdaki kaynaklardan tetiklenir, `early_warnings` tablosuna yazar | ✅ Çalışıyor (mekanizma zaten vardı, sadece server kapalıyken uykudaydı) |
| Panel-eklenen özel kaynaklar | herhangi biri | `dynamicSources.js`, 60sn'de bir tarar | ✅ Test edildi, çalışıyor |
| NASA FIRMS | wildfire | 900sn poll | ❌ Çalışmıyor — Docker ağ katmanı `firms.modaps.eosdis.nasa.gov`'a bağlanırken `ETIMEDOUT` veriyor (DNS çözülüyor, TCP bağlantısı kurulamıyor). Host makineden aynı istek anında çalışıyor — bu makineye/Docker Desktop'a özel bir ağ sorunu, kod hatası değil. Gerçek üretim VM'inde tekrar test edilmeli. |

### 2.2 Canlı Afet Olayları — Edge Function + `pg_cron`'da (server'a taşınmadı, bilinçli)

| Kaynak | Hazard Tipi | Sebep | Durum |
|---|---|---|---|
| GloFAS/Copernicus | flood | Server'da adaptörü yok, kendi Edge Function'ında kalıyor | ❌ Çalışmıyor — eski basit JSON API'si (`globalfloods.eu`) tamamen kaldırılmış, yeni adres (`global-flood.emergency.copernicus.eu`) tam bir React web uygulamasına yönlendiriyor, basit bir JSON uç noktası bulunamadı. Gerçek alternatif erişim (Copernicus Early Warning Data Store / WMS-T / MARS) ayrı bir araştırma gerektiriyor — bugünkü GDO SPI araştırması kadar büyük bir iş. |
| ReliefWeb | flood | Server'da adaptörü yok | ❌ Çalışmıyor — API `v1` kaldırılmış, `v2` onaylı bir `appname` parametresi istiyor (HTTP 403 without one). [ReliefWeb'den appname kaydı](https://apidoc.reliefweb.int/parameters#appname) gerekiyor — bu bir kod değişikliği değil, harici bir kayıt adımı. |
| NASA FIRMS (Edge Function kopyası) | wildfire | Server'daki Docker ağ sorunu yüzünden şimdilik burada bırakıldı | ✅ Kod düzeltildi (yanlış `/api/area/json/` yerine `/api/area/csv/`), hatasız çalışıyor — ama `world/1` (son 1 gün) penceresi NASA'nın işleme gecikmesi yüzünden sık sık boş dönüyor (bu normal, hata değil). |

### 2.3 Periyodik Toplu Katman İmportları — Edge Function + `pg_cron`

| Kaynak | Katman | Durum |
|---|---|---|
| Kontur Population | Nüfus (H3 altıgen) | ✅ Canlı — TR/MG/MY |
| WorldPop | Nüfus (raster→altıgen) | ✅ Canlı — TR/MG |
| OSM/Overpass Roads | Yol ağı | ✅ Canlı — TR/MG |
| OSM/Overpass Buildings | Kritik tesisler | ✅ Canlı |
| HydroRIVERS | Nehir ağı | ✅ Canlı |
| HydroBASINS | Havza sınırları | ✅ Canlı |
| GDO SPI (GPCC) | Kuraklık şiddeti | ❌ Bloke — `WORKER_RESOURCE_LIMIT` + API'nin kendisi gerçek SPI yerine 0-4 sınıflandırma kodu döndürüyor (bkz. Bölüm 3) |
| GHSL | Nüfus (yüksek çözünürlük) | ❌ Bloke (Edge Function'da) — ama disk-akışlı çözüm bu makinede kanıtlandı (bkz. Bölüm 4), konteynere taşınmayı bekliyor |
| Meta/HDX Population | Nüfus (yüksek çözünürlük) | ❌ Bloke (Edge Function'da) — aynı, disk-akışlı çözüm kanıtlandı, konteynere taşınmayı bekliyor |

### 2.4 Değerlendirme Aşamasında / Süreç Meselesi

| Kaynak | Durum |
|---|---|
| GDO Soil Moisture Anomaly + FAPAR | Sadece NetCDF4/HDF5 formatında — Python/GDAL servisi gerekiyor (spec 047, hazırlandı, bekletiliyor) |
| INFORM Index | API yok, statik/yıllık, manuel süreç — kod işi değil |
| JRC GFM | GloFAS ile örtüşüyor, kasıtlı olarak atlandı |

---

## 3. Bugün Bulunan ve Düzeltilen Sorunlar

1. **`fetch-earthquakes`'in hiç `pg_cron` tetikleyicisi yoktu** — sadece frontend açıkken çalışıyordu, kimse bakmıyorken deprem verisi hiç akmıyordu. Bu, tüm mimari değişikliğin başlangıç noktası oldu.
2. **Admin panelinin "Kaynak Ekle" özelliği tamamen ölüydü** — `dynamicSources.js`/`configuredSources.js` sadece server çalışırken işliyor, server aylardır kapalıydı.
3. **SSRF açığı** — admin-eklenen kaynak URL'leri hiç doğrulanmadan fetch ediliyordu (private IP, cloud metadata, redirect bypass, sınırsız response boyutu). `urlSafety.js` ile kapatıldı, canlı testle doğrulandı (gerçek httpbin.org 302 denemesi + private IP).
4. **EMSC-USGS çapraz-kaynak tekrar** — aynı depremi iki kaynak bağımsız raporladığında bellek-içi Deduplicator'ın (nedeni tam bulunamayan bir ırk koşulu yüzünden) bunu yakalayamadığı canlı olarak gözlemlendi. Yazma anında ikinci bir kontrol katmanı eklendi (`filterAgainstLiveEarthquakes`, hem server hem Edge Function tarafında).
5. **`/health` endpoint'i sadece "process ayakta mı" kontrolü yapıyordu** — EMSC bağlantısı sessizce kopsa bile "healthy" derdi. Artık kaynak-bazlı tazelik (staleness) kontrolü yapıyor.
6. **EMSC pong handler'ı health timestamp'i güncellemiyordu** — sessiz ama sağlıklı bir bağlantı, günler sonra "ölü" olarak işaretlenebilirdi. Düzeltildi.
7. **NASA FIRMS yanlış endpoint kullanıyordu** (`/api/area/json/`, HTML döndürüyordu) — `/api/area/csv/`'ye geçirildi.
8. **GDACS/WHO/PTWC/FEWS NET hem server'da hem Edge Function'da aynı anda çalışıyordu** — kesildi, sadece server'da kalacak şekilde düzeltildi.
9. **PostGIS raster (GDAL sürücüleri) denemesi** — GeoTIFF işlemeyi veritabanına taşıma fikri test edildi, Supabase'in yönetilen ortamında superuser izni gerektirdiği için kapalı yol olduğu doğrulandı (bkz. Bölüm 4).

---

## 4. Açık İşler / Bir Sonraki Adımlar

### 4.1 Meta/GHSL konteyneri (öncelikli, kanıtlanmış çözüm bekliyor)
Disk-akışlı raster işleme (`rasterToHexagonFile.ts`, `npm:geotiff`'in `fromFile` kaynağı) bu makinede canlı test edildi:
- Madagaskar: 12.4GB dosya → sadece 226MB bellek, 37 saniye
- Türkiye: 16.6GB dosya → sadece 371MB bellek, 166 saniye

Kod hazır ama henüz bir Docker konteynerine sarılmadı. **Yapılacak:** `docker-compose.yml`'e üçüncü bir servis (`meta-ghsl-importer`) eklemek, ayda bir çalışan bir zamanlayıcı içine bu kodu bağlamak, `writeExposureDataset`'e yazmak.

### 4.2 GloFAS gerçek API araştırması
Eski basit JSON API kaldırılmış. Copernicus Early Warning Data Store / WMS-T / MARS gibi yeni erişim yollarının gerçekten kullanılabilir olup olmadığı araştırılmalı — GDO SPI'de yaptığımız gibi.

### 4.3 ReliefWeb appname kaydı
https://apidoc.reliefweb.int/parameters#appname adresinden onaylı bir `appname` alınmalı (harici, kod dışı bir adım).

### 4.4 NASA FIRMS — server tarafı Docker ağ sorunu
Gerçek üretim VM'inde tekrar test edilmeli — bu makineye özel bir Docker Desktop/Windows ağ kısıtlaması olabilir, Linux VM'de sorun olmayabilir.

### 4.5 Python/NetCDF servisi (spec 047)
`specs/047-netcdf-raster-python-service/spec.md` — GDO Soil Moisture/FAPAR için hazırlandı, bekletiliyor, implement edilmedi.

### 4.6 Frontend'in artık boş dönen Edge Function çağrıları
`fetch-droughts`/`fetch-wildfires`(GDACS kısmı)/`fetch-epidemics`/`fetch-tsunamis`/`fetch-earthquakes`(GDACS kısmı) artık kısmen ya da tamamen boş sonuç dönüyor — zararsız ama frontend'in bu çağrıları hâlâ yapıyor olması gereksiz. İstenirse `src/services/api/config.js`'den temizlenebilir.

---

## 5. Geri Alma (Rollback)

Her kesim **kod seviyesinde, yorum satırına alarak** yapıldı — `data_sources.is_active` kullanılmadı çünkü o satırlar server'ın kendi aktiflik kontrolüyle paylaşılıyor. Geri almak için:
1. İlgili Edge Function'da yorum satırındaki kodu aç
2. Gerekiyorsa `pg_cron` kaydını (PTWC/WHO/GDACS için) yeniden ekle
3. Redeploy et

Server'ı durdurmak için: `docker compose stop aggregator` — bu, o kaynakların TAMAMEN durması anlamına gelir (Edge Function tarafı artık yedek değil, bilinçli olarak kapatıldı).
