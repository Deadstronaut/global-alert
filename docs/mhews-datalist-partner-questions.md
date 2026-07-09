# MHEWS Datalist — Status Report and Questions for the Joint Project Team (UNDP)

**Objective**: We evaluated the 15 sources in the "MHEWS_Datalist - MHEWS Implementation.pdf" list and built one of the population/exposure sources (Tier 1) end-to-end, testing it with live data. This document covers two things: (1) what we were able to achieve, what we couldn't, and why — concrete findings verified with live data; (2) questions that need to be clarified before we continue with the integrations.

## Goal and Our Approach

We will provide this product not just to a single country, but to **multiple countries** — each country will establish its own Multi-Hazard Early Warning System by adding its own data, boundaries, and source connections. Therefore, we are building our architecture based on the following two principles:

1. **Generic code, country-specific data.** The adapter/parser code that knows how to read a source is written once and remains identical across all country deployments. The information regarding "which dataset/endpoint for which country" is not written in the code, but in the configuration of that country's own deployment. We are using **Turkey as a reference country** for development and testing (because we have direct access to Turkey's data) — but there is no hardcoded "Turkey" string in the codebase; every country will add its own data using the same generic mechanism.
2. **Country-specific/sensitive data is never embedded in shared code or shared infrastructure.** In production, each country will run its own isolated server/database (federated model) — data entered by one country will never exist in another country's deployment under any circumstances.

---

## A. The generic integration pattern we built — how it works

While building Tier 1 (population data sources), we solved the "automatic, zero-code-change source binding for each country" problem as follows — this is the template we will use for all subsequent sources (INFORM, CHIRPS, building/road data, etc.):

1. **Parser is written once.** E.g., the code that reads Kontur's file format (GeoPackage) is the same for all countries and contains no country-specific branches (if/else).
2. **The "which country → which dataset" mapping is found automatically once and written to the database — not to the code.** When a new country is added to the system (at the time of "onboarding"), the system queries HDX's (Humanitarian Data Exchange) search API once with that country's ISO country code (e.g., "Under which dataset ID is Kontur's Turkey data located"), and writes the result to that country's **own isolated** database. This query is **not repeated on every data fetch** — it only runs once when that country is initially set up. Thus: (a) no country name/ID is embedded in the source code, (b) there is no risk of randomly drifting to a different dataset on each run (search results may change over time), (c) which dataset is used can always be read from an auditable database record.
3. **This country-specific config record is stored in a way that no other country can ever see** (see Section B below — data privacy).

We tested this end-to-end with real Turkey data for Kontur: the system automatically found Kontur's Turkey dataset, downloaded it (90MB), parsed it (458,226 hexagonal cells), and validated it — all in a total of **1.76 seconds**. This pattern works and is reusable for every new source in the future.

## B. What we achieved, what we couldn't — Tier 1 results report

4 population/exposure sources were requested in the PDF: WorldPop, Kontur, GHSL, Meta. We downloaded and examined all of them live. Result:

| Source                  | Status                          | Reason                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kontur Population**   | ✅ **Completed, tested live**   | Vector data pre-aggregated into H3 hexagons (GeoPackage format) — reasonable size (Turkey: 90MB, 458K cells).                                                                                                                                                                                                                             |
| **WorldPop**            | ❌ **Could not be implemented** | Offers the package on HDX only as GeoTIFF (raster), no vector/tabular format at all. Processing this requires raster/GIS processing (similar to GDAL) — an added complexity that is consciously kept out of our current architecture.                                                                                                     |
| **Meta/HDX Population** | ❌ **Could not be implemented** | The format (CSV) seemed simple, but when we downloaded the actual file, it came out to **134MB zip / 1.1GB uncompressed / 18.6 million rows for Turkey alone** — raw pixel-level data (~30m resolution), unaggregated. It is not practical to process this in a server function, nor is it suitable to write to a database at this scale. |
| **GHSL**                | ❌ **Could not be implemented** | The "Data download" link in the PDF is just an explanatory page; the actual data is a global GeoTIFF tile grid (raster files divided into row/column pieces) — same root problem as WorldPop.                                                                                                                                             |

**Summary**: 3 out of 4 sources are actually **raw raster/grid resolution** data — not suitable for our exposure model (a reasonable number of pre-aggregated "features"). Kontur is the **only exception** among them because Kontur aggregates the data into H3 hexagons on their end and publishes it that way.

---

## C. Our questions in light of these findings

### C.1 Most critical — Is there an alternative for WorldPop/Meta/GHSL?

- Instead of processing WorldPop, Meta, and GHSL's raw raster/grid data on our end, do you have a **pre-aggregated alternative** (e.g., population aggregated by administrative boundaries, or a hexagon/grid aggregation similar to Kontur's)? Or should we put these three sources on hold until a raster processing infrastructure is built (as a separate work item)?
- If raster processing is unavoidable: is there a service/library you recommend for this (e.g., a GDAL/rasterio pipeline already running on your end that can be provided to us as an API)?

### C.2 INFORM Index

- There is an "Updated from **UNDP Madagascar**" note in the PDF. Is this INFORM's general/global feed, or a subnational (province/district level) dataset **specifically curated by hand** for Madagascar?
- If curated by hand: Can this process be repeated for every new country? Who does it (the local UNDP office or your team)? Can you provide us/the next country with a template/methodology for this process?
- INFORM's own official global index (drmkc.jrc.ec.europa.eu) operates at the **country level** — is this sufficient resolution for our risk score formula (district-based), or is subnational data absolutely required?

### C.3 SPI / Drought.gov — scope question

- Drought.gov (NOAA) is typically a portal covering the continental US. Is the "Global Gridded SPI from CMORPH" layer listed **truly global**, or was it included here just for the Madagascar example?
- If not global: From which source should the SPI/drought index be obtained for Madagascar (and other countries)?

### C.4 Roads — Google Maps API

- To our knowledge, Google's Roads API is a **snap-to-road / route-matching** service — it is not a product suitable for downloading an entire country's road network in bulk. Is this the intended API, or another Google service?
- If the goal is to "download the country's entire road network for exposure analysis," does the already listed **OSM roads (Overpass API)** meet the same need, and can we skip this source?

### C.5 OpenBuildingMap — is there an actual API/service?

- `openbuildingmap.org` is a web viewer. The "client" library referenced in the list — does it provide a programmatically queryable **WMS/WFS/tile service**, or is it just for viewing the website?
- If it exists: what is the rate limit, authentication, and data license (commercial use restriction)?

### C.6 EU GDO (Soil Moisture) and FAPAR — access details

- The "API" links in the PDF point to general Copernicus documentation pages, not a specific endpoint. What is the actual API endpoint URL? Is a Copernicus Data Space / WEkEO account and API key required? Is there a rate limit/quota?

### C.7 JRC GFM (Flood forecast) — ECMWF EWDS access

- The ECMWF EWDS API appears to be a system requiring an account+API key. How does the registration process work? Do we need to obtain a separate API key for each country deployment, or can a single organizational key be used for all countries?

### C.8 CHIRPS — format details

- "Index of /products/CHIRPS/v3.0" is a directory listing page (GeoTIFF/NetCDF files), not a JSON/REST API. Is this correct? If the file format is GeoTIFF (likely carrying the same issue as WorldPop/GHSL), is there a processing method you recommend?

### C.9 GDACS — cyclone (TC) scope

- The intended use of GDACS is listed as "Cyclone alerts" in the PDF. Our current GDACS integration **only** processes earthquake/wildfire/flood/drought events, consciously leaving out tropical cyclone (TC) and volcano (VO) events. Is cyclone tracking a priority for this project?

### C.10 General — data license and update frequency

- For each source: how often (months/years) is the data updated? Are there any commercial/licensing restrictions (especially for Google Roads, OpenBuildingMap, Meta data) — is a special permission/agreement required for humanitarian/public use?

### C.11 Data privacy, ownership, and hosting — critical for architecture

- When a country (e.g., Madagascar) adds its **own** food security, poverty, or vulnerable population data to the system, we expect this data to remain **strictly within that country's own deployment**, designed in a way that no other country can see it. Does this assumption align with your projection?
- At what level will a central/global reporting layer (like a UN-facing aggregator) mentioned in the project collect data (if any) — only summary/statistical data, or will the raw exposure/vulnerability layers uploaded by the countries also be transferred to this layer? The latter is something that **must not exist** in our design.
- Data prepared by the local UNDP office, like in the INFORM-Madagascar example: will it be hosted by UNDP (giving us only API/access), or will it be sent to us as files to upload into our own (country-specific) deployment?
- At a scale of 185 countries: we expect every country to upload its own data into its own isolated environment. Does your envisioned deployment/hosting model align with ours on this?

### C.12 Kontur — onboarding process for other countries

- We verified that Kontur has a separate dataset page for each country on HDX and that our system finds this automatically (see Section A). The only question for this: if this automatic discovery fails for a new country (e.g., if there are multiple or no matches for that country on HDX), we might need to ask you for a manual dataset ID in that case — can we establish a support process for such scenarios?

---

## Priority order (most critical for us → least critical)

1. **WorldPop/Meta/GHSL alternative** (question C.1) — will unblock the rest of Tier 1, the most concrete and urgent question.
2. **Data privacy/ownership/hosting** (question C.11) — we don't want to proceed without confirming our architectural assumption is correct.
3. **INFORM** (question C.2) — the core input for the risk score formula.
4. **SPI/Drought.gov scope** (question C.3) — we want to find out early if it's the wrong source.
5. **Roads — Google Maps** (question C.4) — likely unnecessary, can be clarified quickly.
6. **CHIRPS** (question C.8) — likely the same raster issue as WorldPop/GHSL, can be evaluated alongside C.1.
7. Others (C.5–C.7, C.9, C.10, C.12) — for subsequent tiers, not urgent.

# MHEWS Datalist — Ortak Proje Ekibine (UNDP) Durum Raporu ve Sorular

**Amaç**: "MHEWS_Datalist - MHEWS Implementation.pdf" listesindeki 15 kaynağı değerlendirdik ve
nüfus/exposure kaynaklarından birini (Tier 1) uçtan uca gerçekten inşa edip canlı veriyle test
ettik. Bu doküman iki şeyi içeriyor: (1) ne yapabildiğimiz, ne yapamadığımız ve neden — somut, canlı
veriyle doğrulanmış bulgular; (2) entegrasyona devam etmeden önce netleştirilmesi gereken sorular.

## Hedef ve Yaklaşımımız

Bu ürünü tek bir ülkeye değil, **çok sayıda ülkeye** vereceğiz — her ülke kendi verisini, kendi
sınırlarını, kendi kaynak bağlantılarını ekleyerek kendi Multi-Hazard Early Warning System'ini
kuracak. Bu yüzden mimarimizi şu iki prensibe göre kuruyoruz:

1. **Kod jenerik, veri ülkeye özel.** Bir kaynağın nasıl okunacağını bilen adapter/parser kodu bir
   kez yazılır ve tüm ülke deployment'larında aynıdır. "Hangi ülke için hangi dataset/endpoint"
   bilgisi ise koda değil, o ülkenin kendi kurulumundaki konfigürasyona yazılır. Geliştirme ve
   testler için **Türkiye'yi referans ülke** olarak kullanıyoruz (çünkü Türkiye verisine biz
   doğrudan erişebiliyoruz) — ama kodun içinde "Türkiye" diye sabit bir şey yok, her ülke kendi
   verisini aynı jenerik mekanizmayla ekleyecek.
2. **Ülkeye özel/hassas veri hiçbir zaman paylaşılan kod veya paylaşılan altyapıya gömülmez.**
   Prodüksiyonda her ülke kendi izole sunucusunu/veritabanını çalıştıracak (federated model) — bir
   ülkenin girdiği veri, başka bir ülkenin kurulumunda hiçbir şekilde bulunmaz.

---

## A. Kurduğumuz jenerik entegrasyon deseni — nasıl çalışıyor

Tier 1'i (nüfus verisi kaynakları) inşa ederken, "her ülke için otomatik, kod değişikliği
gerektirmeyen kaynak bağlama" problemini şöyle çözdük — bu, bundan sonraki tüm kaynaklar
(INFORM, CHIRPS, bina/yol verisi vb.) için de kullanacağımız şablon:

1. **Parser bir kez yazılır.** Örn. Kontur'un dosya formatını (GeoPackage) okuyan kod tüm ülkeler
   için aynıdır, hiçbir ülkeye özel dal (if/else) içermez.
2. **"Hangi ülke → hangi dataset" bilgisi bir kez, otomatik olarak bulunur ve veritabanına
   yazılır — koda değil.** Yeni bir ülke sisteme eklendiğinde ("onboarding" anında), sistem
   HDX'in (Humanitarian Data Exchange) arama API'sini o ülkenin ISO ülke koduyla bir kez sorgular
   (örn. "Kontur'un Türkiye verisi hangi dataset ID'sinde"), sonucu o ülkenin **kendi izole**
   veritabanına yazar. Bu sorgu **her veri çekiminde tekrarlanmaz** — sadece bir kere, o ülke ilk
   kurulduğunda çalışır. Böylece: (a) hiçbir ülke adı/ID'si kaynak koduna gömülmez, (b) her
   çalışmada rastgele farklı bir dataset'e kayma riski olmaz (arama sonucu zamanla değişebilir),
   (c) hangi dataset'in kullanıldığı her zaman denetlenebilir bir veritabanı kaydından okunur.
3. **Bu ülkeye-özel config kaydı asla başka bir ülkenin göremeyeceği şekilde saklanır** (bkz.
   aşağıdaki B bölümü — veri gizliliği).

Bunu Kontur için gerçek Türkiye verisiyle uçtan uca test ettik: sistem otomatik olarak Kontur'un
Türkiye dataset'ini buldu, indirdi (90MB), parse etti (458.226 altıgen hücre) ve doğruladı — toplam
**1.76 saniyede**. Bu desen çalışıyor ve gelecekteki her yeni kaynak için tekrar kullanılabilir.

## B. Ne yapabildik, ne yapamadık — Tier 1 sonuç raporu

PDF'te 4 nüfus/exposure kaynağı istenmişti: WorldPop, Kontur, GHSL, Meta. Hepsini canlı olarak
indirip inceledik. Sonuç:

| Kaynak                  | Durum                                | Neden                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kontur Population**   | ✅ **Tamamlandı, canlı test edildi** | H3 altıgenlere önceden agregasyonlanmış vektör veri (GeoPackage formatı) — makul boyut (Türkiye: 90MB, 458K hücre)                                                                                                                                                                                                      |
| **WorldPop**            | ❌ **Yapılamadı**                    | HDX'teki paketi sadece GeoTIFF (raster) sunuyor, hiç vektör/tablo formatı yok. Bunu işlemek raster/GIS işleme (GDAL benzeri) gerektirir — bu bizim şu anki mimarimizin bilinçli olarak dışında tuttuğu bir karmaşıklık                                                                                                  |
| **Meta/HDX Population** | ❌ **Yapılamadı**                    | Format (CSV) basit görünüyordu ama gerçek dosyayı indirdiğimizde **Türkiye için tek başına 134MB zip / 1.1GB açık dosya / 18.6 milyon satır** çıktı — ham piksel-seviyesi veri (~30m çözünürlük), agregasyonlanmamış. Bunu bir sunucu fonksiyonunda işlemek pratik değil, veritabanına da bu ölçekte yazmak uygun değil |
| **GHSL**                | ❌ **Yapılamadı**                    | PDF'teki "Data download" linki bir açıklama sayfası; gerçek veri global GeoTIFF tile grid'i (satır/sütun parçalara bölünmüş raster dosyalar) — WorldPop ile aynı kök sorun                                                                                                                                              |

**Özet**: 4 kaynaktan 3'ü aslında **ham raster/grid çözünürlüğünde** veri — bizim exposure
modelimiz (makul sayıda, önceden agregasyonlanmış "feature") için uygun değil. Kontur bunların
arasında **tek istisna** çünkü Kontur veriyi zaten kendi tarafında H3 altıgenlere agregasyonlayıp
öyle yayınlıyor.

---

## C. Bu bulgular ışığında sorularımız

### C.1 En kritik — WorldPop/Meta/GHSL için alternatif var mı?

- WorldPop, Meta ve GHSL'in ham raster/grid verisini bizim tarafımızda işlemek yerine, **önceden
  agregasyonlanmış bir alternatifiniz** var mı (örn. idari sınır başına toplanmış nüfus, ya da
  Kontur'unkine benzer bir hexagon/grid agregasyonu)? Yoksa bu üç kaynağı, raster işleme
  altyapısı kurana kadar (ayrı bir iş kalemi olarak) beklemede mi tutmalıyız?
- Eğer raster işleme kaçınılmazsa: bunun için önerdiğiniz bir servis/kütüphane var mı (örn. sizin
  tarafınızda zaten çalışan bir GDAL/rasterio pipeline'ı, bize API olarak sunulabilir mi)?

### C.2 INFORM Index

- PDF'te "Updated from **UNDP Madagascar**" notu var. Bu, INFORM'un genel/global feed'i mi, yoksa
  Madagaskar için **özel olarak, elle hazırlanmış** bir subnational (il/ilçe seviyesi) veri seti mi?
- Eğer elle hazırlandıysa: Bu süreç her yeni ülke için tekrarlanabilir mi? Kim yapıyor (UNDP'nin
  yerel ofisi mi, sizin ekibiniz mi)? Bize/bir sonraki ülkeye bu süreç için bir şablon/metodoloji
  verebilir misiniz?
- INFORM'un kendi resmi global index'i (drmkc.jrc.ec.europa.eu) **ülke seviyesinde** çalışıyor —
  bizim risk skoru formülümüz (ilçe bazlı) için bu yeterli çözünürlükte mi, yoksa mutlaka
  subnational veri mi gerekiyor?

### C.3 SPI / Drought.gov — kapsam sorusu

- Drought.gov (NOAA) tipik olarak kıta ABD'sini kapsayan bir portal. Listelenen "Global Gridded SPI
  from CMORPH" katmanı **gerçekten global mi**, yoksa Madagaskar örneği için mi buraya konuldu?
- Eğer global değilse: Madagaskar (ve diğer ülkeler) için SPI/kuraklık indeksi hangi kaynaktan
  alınmalı?

### C.4 Roads — Google Maps API

- Google'ın Roads API'si bizim bildiğimiz kadarıyla **snap-to-road / route-matching** hizmeti —
  toplu bir ülkenin yol ağını indirmeye uygun bir ürün değil. Kastedilen bu API mi, yoksa Google'ın
  başka bir servisi mi?
- Eğer amaç "ülkenin tüm yol ağını exposure analizi için indirmek" ise, listede zaten olan **OSM
  yolları (Overpass API)** aynı ihtiyacı karşılıyor mu, bu kaynağı atlayabilir miyiz?

### C.5 OpenBuildingMap — gerçek bir API/servis var mı?

- `openbuildingmap.org` bir web viewer. Listede referans verilen "client" kütüphanesi — bu,
  programatik olarak sorgulanabilen bir **WMS/WFS/tile servisi** mi sağlıyor, yoksa sadece web
  sitesini görüntülemek için mi?
- Varsa: rate limit, kimlik doğrulama, veri lisansı (ticari kullanım kısıtı) nedir?

### C.6 EU GDO (Soil Moisture) ve FAPAR — erişim detayı

- PDF'teki "API" linkleri genel Copernicus dokümantasyon sayfalarına gidiyor, spesifik bir endpoint
  değil. Gerçek API endpoint URL'i nedir? Copernicus Data Space / WEkEO hesabı ve API key gerekiyor
  mu? Rate limit/kota var mı?

### C.7 JRC GFM (Flood forecast) — ECMWF EWDS erişimi

- ECMWF EWDS API'si hesap+API key gerektiren bir sistem gibi görünüyor. Kayıt süreci nasıl
  işliyor? API key'i her ülke deployment'ı için ayrı mı almamız gerekiyor, yoksa tek bir
  organizasyon key'i tüm ülkeler için mi kullanılabilir?

### C.8 CHIRPS — format detayı

- "Index of /products/CHIRPS/v3.0" bir dizin listeleme sayfası (GeoTIFF/NetCDF dosyaları), JSON/
  REST API değil. Bu doğru mu? Dosya formatı GeoTIFF ise (muhtemelen WorldPop/GHSL ile aynı sorunu
  taşıyor), önerdiğiniz bir işleme yöntemi var mı?

### C.9 GDACS — cyclone (TC) kapsamı

- PDF'te GDACS'ın kullanım amacı "Cyclone alerts" olarak yazılmış. Bizim mevcut GDACS
  entegrasyonumuz şu an **sadece** earthquake/wildfire/flood/drought event'lerini işliyor, tropical
  cyclone (TC) ve volcano (VO) event'lerini bilinçli olarak dışarıda bırakıyor. Cyclone takibi bu
  proje için öncelikli mi?

### C.10 Genel — veri lisansı ve güncellenme sıklığı

- Her kaynak için: veri kaç ayda/yılda bir güncelleniyor? Ticari/lisans kısıtı olan var mı
  (özellikle Google Roads, OpenBuildingMap, Meta verisi) — hümaniter/kamu kullanımı için özel bir
  izin/anlaşma gerekiyor mu?

### C.11 Veri gizliliği, sahiplik ve barındırma — mimari için kritik

- Bir ülke (örn. Madagaskar) sisteme **kendi** gıda güvenliği, yoksulluk, veya hassas nüfus verisini
  eklediğinde, bu verinin **sadece o ülkenin kendi kurulumunda** kalması, başka hiçbir ülkenin
  göremeyeceği şekilde tasarlanmasını bekliyoruz. Bu varsayımımız sizin projeksiyonunuzla örtüşüyor
  mu?
- Projede bahsi geçen (varsa) merkezi/global bir raporlama katmanı (UN-facing aggregator gibi) hangi
  düzeyde veri toplayacak — sadece özet/istatistiksel veri mi, yoksa ülkelerin yüklediği ham
  exposure/vulnerability katmanları da mı bu katmana aktarılacak? İkincisi bizim tasarımımızda
  **olmaması gereken** bir şey.
- INFORM-Madagaskar örneğindeki gibi UNDP'nin yerel ofisinin hazırladığı veriler: UNDP tarafından mı
  barındırılacak (bize sadece API/erişim verilecek), yoksa bize dosya olarak gönderilip bizim
  kendi (o ülkeye özel) kurulumumuza mı yükleyeceğiz?
- 185 ülke ölçeğinde: her ülkenin kendi verisini kendi izole ortamına yüklemesini bekliyoruz. Bu
  konuda sizin öngördüğünüz dağıtım/hosting modeli bizimkiyle örtüşüyor mu?

### C.12 Kontur — diğer ülkeler için onboarding süreci

- Kontur'un HDX'teki her ülke için ayrı bir dataset sayfası olduğunu ve bizim sistemimizin bunu
  otomatik bulduğunu doğruladık (bkz. Bölüm A). Bunun için tek soru: yeni bir ülke için bu otomatik
  bulma başarısız olursa (örn. HDX'te o ülke için birden fazla veya hiç eşleşme yoksa), bu durumda
  sizden manuel bir dataset ID'si istememiz gerekebilir — böyle bir destek süreci kurabilir miyiz?

---

## Öncelik sırası (bizim için en kritik → en az kritik)

1. **WorldPop/Meta/GHSL alternatifi** (soru C.1) — Tier 1'in geri kalanının önünü açacak, en somut ve acil soru
2. **Veri gizliliği/sahiplik/barındırma** (soru C.11) — mimari varsayımımızın doğru olduğunu teyit etmeden ilerlemek istemiyoruz
3. **INFORM** (soru C.2) — risk skoru formülünün temel girdisi
4. **SPI/Drought.gov kapsamı** (soru C.3) — yanlış kaynaksa erken öğrenmek istiyoruz
5. **Roads — Google Maps** (soru C.4) — muhtemelen gereksiz, hızlı netleşebilir
6. **CHIRPS** (soru C.8) — muhtemelen WorldPop/GHSL ile aynı raster sorunu, C.1 ile birlikte değerlendirilebilir
7. Diğerleri (C.5–C.7, C.9, C.10, C.12) — sonraki tier'lar için, acil değil
