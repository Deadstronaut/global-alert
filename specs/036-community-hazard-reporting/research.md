# Research: Vatandaş Kaynaklı Afet Bildirimi

## Decision 1: Ülke ataması — bbox tabanlı `resolveCountryCode()` yeniden kullanılır, yeni bir dünya sınır verisi eklenmez

**Decision**: FR-005'in gerektirdiği "konumdan ülke belirleme" işlemi, projede zaten var olan
bounding-box tabanlı `src/utils/geoCountry.js` (`resolveCountryCode(lat, lng)`) ve onun Node.js
ikizi `server/src/processors/geoCountry.js` ile AYNI mantık, `src/configs/countries.json`
verisiyle, yeni bir Deno portu (`supabase/functions/shared/geoCountry.ts`) olarak yeniden
uygulanır. Yeni bir dünya sınırları (world boundaries) GeoJSON dosyası veya PostGIS tabanlı
reverse-geocoding EKLENMEZ.

**Rationale**: Bu proje aynı sorunu (bir lat/lng'ye hangi ülkenin sahip olduğunu belirleme) daha
önce iki kez çözmüş ve her seferinde kasıtlı olarak "yeni bir dünya-sınırları bağımlılığı
eklemek yerine mevcut bbox verisini yeniden kullan" kararını almış (`geoCountry.js`'in kendi
yorumu: "reused rather than adding a new world-boundaries dependency (YAGNI)"). `country_boundaries`
tablosu (spec — 20260705) farklı bir problem çözüyor (BİR ülkenin İÇİNDEKİ bölge/il sınırları,
sadece o ülke zaten yüklenmişse) — dünya çapında herhangi bir noktanın hangi ülkeye ait olduğunu
bilmiyor, bu yüzden bu iş için kullanılamaz. Üçüncü bir kopya (Deno için) yazmak, spec 016'nın
zaten kurduğu "aynı saf mantığın birden fazla runtime'da (Vue tarayıcısı / Node.js aggregator /
Deno Edge Function) bağımsız kopyalar halinde yaşaması" desenini izler (normalize.ts ↔
normalizer.js), yeni bir mimari kavram getirmez.

**Alternatives considered**:
- *Yeni dünya-sınırları GeoJSON + PostGIS `ST_Contains` sorgusu*: Daha doğru (bbox'lar örtüşebilir,
  örn. Malezya/Endonezya/Singapur — mevcut kod zaten bunu "en küçük alan kazanır" sezgiseliyle ele
  alıyor) ama yeni bir statik veri seti + PostGIS bakımı gerektirir; Principle VIII (YAGNI) ve
  mevcut hassasiyet düzeyi ("ülke-seviyesi kapsamlama için yeterli, kıyı/sınır kenarı edge-case'i
  kabul edilebilir" — geoCountry.js'in kendi yorumu) bunu gereksiz kılıyor.
- *Vatandaşın formda ülkesini manuel seçmesi*: Daha basit ama anonim/güvenilmeyen bir girdiye
  moderasyon kapsamlamasını dayandırmak, coğrafi veriden türetmekten daha az güvenilir (kullanıcı
  yanlış/kötü niyetli ülke seçebilir); reddedildi çünkü mevcut bbox çözümü zaten güvenilir ve
  bedava.

## Decision 2: Anonim yazma işlemi bir Edge Function (`submit-community-report`) üzerinden yapılır, doğrudan `anon` RLS INSERT policy'si AÇILMAZ

**Decision**: Kimlik doğrulaması olmayan ziyaretçi, `community_reports` tablosuna doğrudan
`supabase.from(...).insert()` ile yazmaz. Bunun yerine yeni bir `submit-community-report` Deno
Edge Function'ı (spec 021/031'deki gibi service-role client kullanan, `verify_jwt=false`)
girdiyi doğrular (zorunlu alanlar, foto boyut/tip sınırı), ülke kodunu server-side belirler
(Decision 1), fotoğrafı varsa Storage'a yükler, ve satırı service-role ile INSERT eder.

**Rationale**: Bu, projenin anonim-yazma ihtiyacı olan her yerde zaten kullandığı desenle birebir
tutarlı — `ack-dispatch` (spec 017, anon onay linki), `unsubscribe` (spec 031), ve
`record_failed_login()` (spec 028, anon-callable ama SECURITY DEFINER RPC olarak). Doğrudan bir
`anon` INSERT RLS policy'si açmak (a) ülke kodunun client tarafından spoof edilebilmesine izin
verir (moderasyon kapsamlamasını atlatma riski) ve (b) foto/boyut doğrulamasını client'a güvenmeye
zorlar. Edge Function, her iki riski de sunucu tarafında kapatır.

**Alternatives considered**:
- *Anon INSERT RLS policy + client-side ülke tespiti*: Daha az kod ama yukarıdaki spoofing riski
  nedeniyle reddedildi.
- *Bir SECURITY DEFINER Postgres fonksiyonu (RPC) olarak, `record_failed_login()` gibi*: Fotoğraf
  yükleme adımı (Supabase Storage'a yazma) düz SQL'den yapılamayacağı için (Storage bir HTTP API'si)
  bu iş zaten bir Edge Function gerektiriyor — RPC deseni yalnızca DB-only işlemler için uygun,
  burada uygun değil.

## Decision 3: Fotoğraf depolama — yeni, tek amaçlı bir Supabase Storage bucket'ı (`community-report-photos`), public-read + yalnızca Edge Function'ın (service-role) yazabildiği

**Decision**: Yeni bir Storage bucket'ı oluşturulur. Yazma yalnızca service-role (Edge Function
içinden) ile yapılır — hiçbir zaman client'tan doğrudan `anon`/`authenticated` upload izni
verilmez. Okuma: bucket public-read olarak ayarlanır (moderasyon kuyruğunda ve onaylı bildirim
popup'ında fotoğrafın gösterilebilmesi için), ANCAK fotoğrafın gerçek public URL'i yalnızca
`community_reports` satırının kendisi (RLS ile korunan) `photo_path` alanı aracılığıyla
öğrenilebilir — bucket dosya adları tahmin edilemez (UUID tabanlı), bu yüzden pratikte "yayında
olmayan" bir bildirimin fotoğrafına rastgele erişim mümkün değildir (aynı `exposure-datasets`
bucket'ının GeoJSON dosyaları için zaten kullandığı "public bucket + tahmin edilemez dosya adı"
mantığıyla tutarlı — bkz. spec 008/023).

**Rationale**: Bu projede Supabase Storage'ın ilk kullanımı olsa da, Supabase'in kendi ürün
yüzeyinin bir parçası olduğu için Principle VIII'i (yeni bir dış servis eklememe) ihlal etmez.
Yazmayı yalnızca service-role'e kısıtlamak, moderasyon-öncesi görünürlük garantisini (FR-004,
MHEWS-SD-FEEDBACK-03) Storage katmanında da korur.

**Alternatives considered**:
- *Fotoğrafı doğrudan `community_reports.photo_base64` gibi bir kolonda saklamak*: Basit ama büyük
  binary veriyi Postgres satırlarında tutmak performans ve boyut sorunlarına yol açar; reddedildi.
- *Private bucket + signed URL üretimi her istekte*: Daha sıkı erişim kontrolü ama ek bir
  Edge Function çağrısı/karmaşıklık gerektirir; onaylanmış (zaten herkese açık niyetli) bir
  bildirimin fotoğrafı için bu ek karmaşıklık YAGNI ile gereksiz bulundu.

## Decision 4: Durum makinesi — mevcut `guard_*_transition()` BEFORE UPDATE trigger deseni yeniden kullanılır

**Decision**: `community_reports.status` (`pending`/`approved`/`rejected`/`archived`) geçişleri,
`cap_drafts`/`incidents` ile birebir aynı desende bir `guard_community_report_transition()`
BEFORE UPDATE trigger'ı ile DB seviyesinde zorunlu kılınır: yalnızca
`pending→approved`, `pending→rejected`, `approved→archived`, `rejected→archived` izinli; red
işlemi `rejection_reason` NULL/boşsa reddedilir (aynı `cap_drafts.rejection_reason` deseni).

**Rationale**: Constitution'da açıkça istenmese de proje genelinde (incidents, cap_drafts) durum
makinelerinin İSTEMCİ TARAFINDA DEĞİL veritabanı seviyesinde zorunlu kılınması yerleşik bir
konvansiyon; tutarlılık ve "hangi client çağırırsa çağırsın kural atlanamaz" garantisi için
yeniden kullanılıyor.

**Alternatives considered**: Yok — bu, incelenen üç önceki spec'te (006, 011, 028) de aynı şekilde
çözülmüş, alternatif aranmadı.

## Decision 5: Moderasyon (onay/red) yalnızca `country_admin`/`super_admin`'dedir; `org_admin` moderasyon SONRASI, isteğe bağlı bir atama üzerinden salt-okunur erişim kazanır

**Decision**: `community_reports`'a nullable bir `assigned_org_id` (FK → `organizations(id)
ON DELETE SET NULL`) kolonu eklenir. Onay/red işlemi (durum makinesi geçişi) HER ZAMAN yalnızca
`country_admin`/`super_admin` RLS politikalarıyla korunur — `org_admin` için hiçbir zaman bir
UPDATE-durum politikası açılmaz. Ayrıca, `country_admin`/`super_admin` bir bildirimi (onay anında
veya sonradan) kendi ülkesi içindeki bir organizasyona atayabilir (`assigned_org_id` set edilir).
Yeni bir RLS SELECT politikası, `org_admin`'in yalnızca `status='approved' AND assigned_org_id =
(kendi profile.org_id)` olan satırları OKUYABİLMESİNİ sağlar — yazma/durum-değiştirme izni yoktur.

**Rationale**: İlk taslakta `org_admin`'i tamamen dışarıda bırakmıştım çünkü bir bildirimin
coğrafi koordinatından hangi organizasyona ait olduğu hesaplanamaz (`organizations`'ın kendi bir
sınırı/koordinatı yok, yalnızca `country_code` + hiyerarşik isim var — bkz. `organizations`
tablosu, 20260603120200 migration). Ancak proje sahibiyle netleştirildi: gerçek kullanımda bir
country_admin/super_admin'in onaylı bir bildirimi ilgili saha ekibine (belirli bir organizasyona)
YÖNLENDİREBİLMESİ gerçek bir operasyonel ihtiyaç. Bu, moderasyon KAPISINI (kim onaylar/reddeder)
DEĞİŞTİRMEDEN saf bir "atama/yönlendirme" katmanı eklemekle çözülüyor — `org_admin` hâlâ hiçbir
zaman onaysız/reddedilmiş içerik göremez (FR-004/SC-004 korunur), sadece zaten onaylanmış ve
kendisine açıkça atanmış bir bildirimi görebilir. Bu, `shelters.linked_incident_id`'nin
"opsiyonel, sonradan da eklenebilir, ON DELETE SET NULL" desenine birebir benzer.

**Alternatives considered**:
- *`org_admin`'i tamamen dışarıda bırakmak (ilk taslak)*: Basit ama gerçek saha-ekibi yönlendirme
  ihtiyacını karşılamıyor; proje sahibinin geri bildirimiyle reddedildi.
- *`org_admin`'e de onay/red yetkisi vermek*: Moderasyon kapısının anlamını zayıflatır (birden
  fazla, daha dar yetkili rolün "yayına alma" kararı vermesi, denetim/hesap verebilirlik açısından
  daha karmaşık) ve spec'in "kim moderasyon yapar" sorusunu belirsizleştirir; reddedildi — moderasyon
  tek bir net kapıda (country_admin/super_admin) kalır, org_admin sadece SONRASINDA, salt-okunur
  görür.

## Decision 6: Harita kümeleme (clustering) — MapLibre GL'in yerleşik `cluster` özelliği kullanılır

**Decision**: Yeni bildirim marker katmanı, mevcut disaster-event marker'larının kullandığı
"her event için ayrı DOM marker'ı" yaklaşımı yerine, MapLibre GL'in native `GeoJSON source
cluster: true` özelliğini kullanır (kütüphane zaten projede mevcut, ek bağımlılık yok).

**Rationale**: FR-009 (yakın konumdaki bildirimlerin kümelenmesi) MapLibre'nin yerleşik
özelliğiyle sıfır ek bağımlılıkla karşılanabiliyor; disaster-event marker'larının DOM tabanlı
yaklaşımını (genelde onlarca/yüzlerce olay, kümeleme gerektirmiyor) burada değiştirmeye gerek yok
çünkü bu iki katman birbirinden bağımsız (spec 027'nin sığınak katmanı da kendi ayrı yaklaşımını
kullanıyordu).

**Alternatives considered**: Disaster-event'lerdeki gibi kümelemesiz DOM marker'ları — çok sayıda
yakın bildirim olduğunda (vatandaş bildirimleri coğrafi olarak yoğunlaşma eğiliminde, örn. aynı
mahalledeki birçok kişi aynı olayı bildirebilir) görsel karmaşaya yol açacağından reddedildi; bu,
FR-009'un doğrudan gereksinimi zaten.
