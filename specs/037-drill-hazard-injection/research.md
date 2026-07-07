# Research: Tatbikat İçin Simüle Tehlike Enjeksiyonu

## Decision 1: Ayrı bir `drill_injected_events` tablosu, gerçek disaster-event tablolarına yazma YOK

**Decision**: Simüle olaylar `earthquake`/`wildfire`/`flood`/vb. tablolarına asla yazılmaz; kendi
tablosunda, kendi `country_code`/`drill_session_id` kapsamlama kolonlarıyla tutulur.

**Rationale**: Constitution Principle IV, her afet/tehlike veri kaynağının gerçek, normalize
edilmiş bir kaynaktan gelmesini ve dedup/kalite kurallarına tabi olmasını zorunlu kılıyor. Simüle
bir olayı gerçek tabloya yazmak (a) o tablonun dedup/normalizasyon varsayımlarını bozar, (b) gerçek
tarihsel export/arşivleri kalıcı olarak kirletir (spec 009/031'in "gerçek veri" export garantisi),
(c) tatbikat bittikten sonra temizlemeyi kırılgan hale getirir (silme/geri alma riski). Ayrı tablo,
sıfır riskle aynı UX'i sağlar.

**Alternatives considered**: Gerçek tabloya `is_drill` flag'i eklemek (spec 013'ün `cap_drafts.
is_exercise` desenine benzer) — reddedildi çünkü `cap_drafts` zaten kullanıcı tarafından
oluşturulan bir taslak/mesaj varlığıdır (doğası gereği "yazılabilir"), oysa earthquake/wildfire/vb.
tabloları SADECE `fetch-*`/`normalize` boru hattının yazdığı, dışarıdan asla elle INSERT
edilmeyen tablolardır — bu ayrımı bozmak daha büyük bir mimari risk taşır.

## Decision 2: Görüntüleme — MapView.vue'nun mevcut disaster-event DOM-marker deseni yeniden kullanılır, MapLibre native clustering YOK

**Decision**: `updateShelterMarkers()`/`clearShelterMarkers()` (spec 027) ile aynı DOM-tabanlı
Marker+Popup yaklaşımı, yeni `updateDrillEventMarkers()`/`clearDrillEventMarkers()` fonksiyonlarıyla
uygulanır. Spec 036'nın community-report'lar için seçtiği MapLibre native `cluster:true` GeoJSON
source YAKLAŞIMI burada KULLANILMAZ.

**Rationale**: Community reports potansiyel olarak yüzlerce/binlerce kayıt biriktirebilir (halk
kaynaklı, sürekli gelen bir akış), bu yüzden native clustering gerekliydi. Tatbikat enjeksiyonları
ise (spec'in Assumptions'ında belirtildiği gibi) tipik olarak tatbikat başına birkaç-onlarca
kayıttır ve bir tatbikatın ömrü kısadır (dakikalar-saatler) — mevcut sığınak/afet-olayı DOM-marker
deseni performans açısından fazlasıyla yeterli, ek bir GeoJSON source/layer karmaşıklığı YAGNI
ihlali olurdu.

**Alternatives considered**: Native clustering (spec 036 ile tutarlılık için) — reddedildi, ölçek
gereksinimi yok, tutarlılık tek başına yeterli bir gerekçe değil (Principle VIII: "en küçük
değişiklik").

## Decision 3: "TATBİKAT" rozeti — `CapView.vue`'nun mevcut `is_exercise` görsel dilini birebir taklit eder

**Decision**: Enjekte olay popup'ları ve marker'ları, `cap.exerciseOnly` i18n anahtarının
("SADECE TATBİKAT — bu uyarı bir tatbikat simülasyonudur, gerçek değildir") aynı üslubunda yeni
bir `drillInjection.mapBadge` anahtarıyla, her zaman görünür (koşulsuz render edilen, gizlenemeyen)
bir rozet olarak gösterilir.

**Rationale**: Proje zaten tatbikat/gerçek ayrımı için kanıtlanmış, kullanıcı tarafından tanıdık bir
görsel dil kurmuş (`draft-exercise-badge`, CapView.vue satır 453) — aynı dili yeniden kullanmak
hem tutarlılık hem YAGNI açısından doğru, yeni bir görsel dil icat etmeye gerek yok.

**Alternatives considered**: Yok — mevcut desen doğrudan uygulanabilir, alternatif aranmadı.

## Decision 4: Yetkilendirme — `drill_sessions`'ın kendi RLS deseni (EXISTS/profiles subquery) birebir yeniden kullanılır

**Decision**: `drill_injected_events` RLS politikaları, `drill_sessions`'ın kendi
`super_admin_drill_all`/`country_admin_drill_own` politikalarıyla AYNI `EXISTS (SELECT 1 FROM
profiles p WHERE ...)` deseninde yazılır (bu modülün geri kalanında `current_profile_role()`/
`current_profile_country_code()` helper'ları yerine bu stil kullanılmış — modül-içi tutarlılık
tercih edildi, proje-geneli tek bir stil zorunluluğu yok).

**Rationale**: `drill_injected_events`, `drill_sessions`'ın bir alt-varlığıdır (her zaman bir
`drill_session_id`'ye bağlı) — aynı dosyada/modülde yaşayan ilişkili tabloların aynı RLS yazım
stilini paylaşması okunabilirliği artırır ve gelecekteki bir `drill_sessions` RLS değişikliğiyle
senkron kalmayı kolaylaştırır.

## Decision 5: `startFromEvent()` (CapView.vue) entegrasyonu — enjekte olaylar `detectedEvents` listesine aktif tatbikat sırasında dahil edilir

**Decision**: `CapView.vue`'nun mevcut `detectedEvents` computed'ı (bugün yalnızca `disaster.
allEvents`'tan besleniyor) aktif bir tatbikat varsa, o tatbikatın enjekte olaylarını da (aynı
`{id, type, severity, title, lat, lng}` şekliyle normalize edilmiş) listeye ekleyecek şekilde
genişletilir — `startFromEvent(event)` fonksiyonunun kendisi HİÇ değiştirilmez, zaten var olan
`source_event_id` mekanizmasını kullanır.

**Rationale**: Kod taramasıyla doğrulandı — `CapView.vue`'da "tespit edilen olaydan taslak
oluştur" akışı zaten `source_event_id` (spec'in ilk taslağında varsayılan olarak referans
verilmişti) ile mevcut ve `disaster.allEvents`'tan gelen herhangi bir `{id,type,severity,title}`
şeklindeki nesneyi kabul ediyor — enjekte olayları bu şekle normalize ederek aynı fonksiyona
vermek, sıfır yeni kod yolu gerektiriyor.

**Alternatives considered**: Enjekte olaylar için ayrı bir "CAP taslağı oluştur" butonu/akışı —
reddedildi, mevcut akışla zaten uyumlu, gereksiz kod tekrarı olurdu.
