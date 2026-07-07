# Feature Specification: Tatbikat İçin Simüle Tehlike Enjeksiyonu

**Feature Branch**: `037-drill-hazard-injection`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Build Simulated Hazard Injection for Drills (MHEWS-FR-0149) — Preparedness/Drill & Response modülünün daha önce '(ayrı, daha büyük bir iterasyon)' olarak ertelenmiş son buildable kalemi. Bir drill_session aktifken yetkili bir kullanıcı, gerçek afet olayı ingestion boru hattına hiç dokunmadan, ayrı bir tabloda tutulan simüle tehlike olayları enjekte edebilir; bunlar haritada 'TATBİKAT' etiketiyle görünür, tatbikat bitince kaybolur, gerçek dispatch/incident/metriklere hiç karışmaz."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Yetkili kullanıcı aktif bir tatbikata simüle bir tehlike olayı enjekte eder (Priority: P1) 🎯 MVP

Bir tatbikat (`drill_session`) `active` durumdayken, `country_admin`/`org_admin`/`super_admin` rolündeki bir kullanıcı (kendi tatbikatını başlatma/durdurma yetkisiyle aynı yetkiye sahip kişi), afet tipi, konum, şiddet ve kısa bir açıklama girerek simüle bir tehlike olayı oluşturur. Bu olay anında ana haritada, gerçek afet olaylarıyla aynı görsel dilde ama üzerinde her zaman görünür bir "TATBİKAT" etiketiyle belirir.

**Why this priority**: Bu spec'in tüm değeri buradan gelir — enjeksiyon olmadan tatbikat katılımcılarının tepki vereceği hiçbir gerçekçi uyaran yoktur. MVP tek başına anlamlıdır (görüntüleme ve izolasyon kuralları olmasa bile temel enjeksiyon akışı test edilebilir).

**Independent Test**: Aktif bir tatbikatta bir simüle olay enjekte edilir; olayın veritabanında o tatbikata (`drill_session_id`) bağlı olarak oluştuğu ve haritada "TATBİKAT" etiketiyle göründüğü doğrulanır.

**Acceptance Scenarios**:

1. **Given** kendi ülkesinde `active` bir tatbikat, **When** yetkili kullanıcı afet tipi + konum + şiddet + açıklama girip enjekte eder, **Then** yeni bir simüle olay o tatbikata bağlı olarak oluşur ve haritada görünür.
2. **Given** hiçbir tatbikat `active` değil, **When** kullanıcı enjeksiyon ekranını açar, **Then** enjeksiyon işlemi yapılamaz (aktif bir tatbikat gerektiği belirtilir).
3. **Given** başka bir ülkenin tatbikatı, **When** bir country_admin kendi tatbikat yönetim ekranını açar, **Then** o tatbikata olay enjekte edemez (kapsam dışı).
4. **Given** bir viewer hesabı, **When** enjeksiyon işlemi yapmaya çalışır, **Then** erişim reddedilir.

---

### User Story 2 - Herhangi bir giriş yapmış kullanıcı, aktif tatbikat sırasında enjekte edilmiş olayları haritada gerçekçi şekilde görür (Priority: P1)

Tatbikata katılan herhangi bir signed-in kullanıcı (viewer dahil) ana haritayı açtığında, o an aktif olan tatbikata ait enjekte edilmiş olayları, gerçek afet olaylarıyla aynı katmanda ama daima görünür bir "TATBİKAT" rozetiyle görür — böylece tatbikat gerçekçi hissettirir ama hiçbir kullanıcı bunu gerçek bir olayla karıştırmaz.

**Why this priority**: Gerçekçilik + yanlış alarm riskinin sıfırlanması aynı anda sağlanmalı — bu, MVP'nin ayrılmaz parçası (enjeksiyonun kendisi kadar kritik).

**Independent Test**: Aktif bir tatbikatta enjekte edilmiş bir olayla harita açılır; olayın "TATBİKAT" etiketiyle göründüğü, etiketin hiçbir koşulda gizlenemediği doğrulanır.

**Acceptance Scenarios**:

1. **Given** aktif bir tatbikata bağlı enjekte edilmiş bir olay, **When** herhangi bir signed-in kullanıcı (viewer dahil) haritayı açar, **Then** olay "TATBİKAT" etiketiyle görünür.
2. **Given** enjekte edilmiş bir olayın etiketi, **When** kullanıcı haritayla herhangi bir şekilde etkileşime girer (zoom, filtre, tema değişimi), **Then** "TATBİKAT" etiketi her zaman görünür kalır, kaldırılamaz.

---

### User Story 3 - Tatbikat sona erdiğinde enjekte edilmiş olaylar haritadan kalkar (Priority: P2)

Bir tatbikat `completed` durumuna geçtiğinde, o tatbikata ait enjekte edilmiş olaylar otomatik olarak haritadan kalkar (ama kayıt/denetim amaçlı veritabanında saklı kalır) — böylece tatbikat bitince harita gerçek duruma döner.

**Why this priority**: Tatbikat sonrası haritanın "temiz" hale gelmesi operasyonel güven için önemli ama MVP'nin (enjeksiyon + gerçekçi görüntüleme) üzerine eklenen bir tamamlayıcı — P2.

**Independent Test**: Aktif bir tatbikat enjekte edilmiş olayla birlikte durdurulur (`completed`); haritanın yeniden yüklenmesinin ardından o olayın artık görünmediği ama veritabanında kaydının durduğu doğrulanır.

**Acceptance Scenarios**:

1. **Given** enjekte edilmiş bir olayı olan `active` bir tatbikat, **When** tatbikat `completed` durumuna geçer, **Then** o olay haritada artık görünmez.
2. **Given** `completed` bir tatbikatın geçmişteki enjekte olayı, **When** veritabanı doğrudan sorgulanır, **Then** kayıt hâlâ mevcuttur (silinmez).

---

### User Story 4 - Enjekte edilmiş bir olay, gerçek dispatch/incident/metriklere hiçbir zaman karışmaz (Priority: P1)

Bir yetkili kullanıcı enjekte edilmiş bir olayı isteğe bağlı olarak bir CAP taslağının tohumu olarak kullansa bile (mevcut "tespit edilen olaydan taslak oluştur" akışı, spec 011), ortaya çıkan taslak mevcut `is_exercise` otomatik-işaretleme mekanizmasıyla (spec 013) her zaman tatbikat olarak işaretlenir ve gerçek dispatch'i asla tetiklemez; enjekte olayların kendisi de false-alarm-rate/incident istatistiklerine hiçbir şekilde dahil edilmez.

**Why this priority**: Bu, tüm özelliğin güvenlik garantisidir — enjeksiyon özelliği olmadan da sistem çalışır, ama bu izolasyon garantisi olmadan enjeksiyon özelliği gerçek bir yanlış-alarm riski taşır (P1, MVP ile birlikte zorunlu).

**Independent Test**: Enjekte edilmiş bir olaydan bir CAP taslağı oluşturulur; taslağın `is_exercise=true` olduğu doğrulanır (mevcut spec 013 trigger'ı üzerinden, değiştirilmeden). Ayrı olarak, mevcut yıllık/false-alarm-rate metriklerinin enjekte olay tablosunu hiç sorgulamadığı (kod incelemesiyle) doğrulanır.

**Acceptance Scenarios**:

1. **Given** enjekte edilmiş bir olay, **When** kullanıcı ondan bir CAP taslağı oluşturur, **Then** taslak mevcut mekanizmayla otomatik `is_exercise=true` olarak işaretlenir (bu spec'in kendisi bu mekanizmayı değiştirmez).
2. **Given** bir veya daha fazla enjekte olay, **When** gerçek afet olayı export'ları (CSV/JSON/GeoJSON) veya sayaçları üretilir, **Then** enjekte olaylar bu çıktılarda hiç görünmez.
3. **Given** bir tatbikat sırasında enjekte edilen olaylar, **When** yıllık tatbikat performans raporu (spec 032) üretilir, **Then** rapor mevcut mantığıyla değişmeden çalışır (bu spec'in enjekte olayları bu rapora dahil etme gibi bir gereksinimi yoktur).

---

### Edge Cases

- Bir kullanıcı enjeksiyon formuna geçersiz konum (aralık dışı lat/lng) girerse: sistem reddeder, aynı disaster-event doğrulama kurallarıyla tutarlı bir hata mesajı gösterir.
- Aynı tatbikatta çok sayıda (onlarca) olay enjekte edilirse: hepsi haritada gösterilir, bir üst sınır bu iterasyonda yoktur (YAGNI — gerçek kullanımda tatbikat başına birkaç olay beklenir).
- Bir tatbikat `active` iken enjekte edilen bir olay, tatbikat `completed` olmadan önce yetkili kullanıcı tarafından manuel silinmek istenirse: bu iterasyonda silme işlevi vardır (tek olay bazında), tatbikatın kendisini durdurmadan da yapılabilir.
- İki farklı tatbikat aynı anda `active` ise (farklı ülkeler/organizasyonlar): her tatbikatın enjekte olayları yalnızca kendi `drill_session_id`'sine bağlıdır, haritada karışmaz (her kullanıcı yalnızca kendi ülkesindeki aktif tatbikatın olaylarını görür, mevcut country-scope RLS deseniyle tutarlı).
- Bir viewer, aktif tatbikat olmayan bir ülkede oturum açmışsa: harita hiç enjekte olay göstermez, normal (tamamen gerçek) haritayı görür.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, yalnızca `active` durumdaki bir tatbikat için, o tatbikatı başlatma/durdurma yetkisine sahip kullanıcıların (country_admin/org_admin/super_admin, kendi ülke/organizasyon kapsamlarında) simüle bir tehlike olayı enjekte etmesine izin vermelidir.
- **FR-002**: Enjeksiyon formu; afet tipi (mevcut hazard_types kaydından), konum (lat/lng), şiddet ve kısa açıklama alanlarını içermeli ve eksik/geçersiz veriyi reddetmelidir.
- **FR-003**: Enjekte edilen olaylar gerçek afet olayı tablolarından (earthquake/wildfire/flood/vb.) tamamen ayrı, kendi tablosunda saklanmalıdır — hiçbir zaman gerçek ingestion/normalizasyon boru hattına karışmamalıdır.
- **FR-004**: Enjekte edilen bir olay, ait olduğu tatbikatın (`drill_session`) durumu `active` olduğu sürece ana haritada, gerçek afet olaylarıyla aynı katmanda ama daima görünür, kaldırılamaz bir "TATBİKAT" etiketiyle gösterilmelidir.
- **FR-005**: Bir tatbikat `completed` durumuna geçtiğinde, ona bağlı enjekte olaylar haritada artık gösterilmemeli, ancak veritabanı kaydı silinmemelidir.
- **FR-006**: Enjekte edilmiş olaylar; gerçek afet olayı export'larına (CSV/JSON/GeoJSON), sayaçlarına veya herhangi bir gerçek-veri raporuna hiçbir koşulda dahil edilmemelidir.
- **FR-007**: Bir enjekte olaydan CAP taslağı oluşturulduğunda, mevcut otomatik tatbikat-işaretleme mekanizması (is_exercise) değişmeden uygulanmaya devam etmeli ve bu taslak gerçek dispatch'i tetiklememelidir.
- **FR-008**: Enjekte olaylar, false-alarm-rate/incident istatistiklerine veya tatbikat performans raporlarına dahil edilmemelidir (bu iterasyonda bu raporlar enjekte olay tablosunu hiç sorgulamaz).
- **FR-009**: Yetkili kullanıcılar, kendi enjekte ettikleri (veya kendi kapsamlarındaki) bir olayı, tatbikat sona ermeden önce manuel olarak silebilmelidir.
- **FR-010**: Sistem, farklı ülkelerin/organizasyonların aynı anda aktif tatbikatlarını birbirinden izole etmeli — bir kullanıcı yalnızca kendi ülkesindeki aktif tatbikatın enjekte olaylarını enjekte edebilmeli/görebilmelidir.

### Key Entities

- **Enjekte Edilmiş Tatbikat Olayı (DrillInjectedEvent)**: Belirli bir `drill_session`'a bağlı, insan tarafından oluşturulan tekil bir simüle tehlike kaydı — afet tipi (hazard_types'a referans), konum (lat/lng), şiddet, açıklama, oluşturan kullanıcı, oluşturma zamanı. Gerçek `DisasterEvent` modeliyle aynı görüntüleme alanlarını taşır ama tamamen ayrı bir tablodadır.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Yetkili bir kullanıcı, aktif bir tatbikat sırasında 30 saniyenin altında bir simüle olay enjekte edip haritada görünür hale getirebilir.
- **SC-002**: Enjekte edilmiş bir olayın "TATBİKAT" etiketi, kullanıcıların %100'ü için hiçbir koşulda (filtre, zoom, tema) kaybolmaz.
- **SC-003**: Bir tatbikat `completed` olduktan sonraki bir sonraki harita yüklemesinde, o tatbikata ait hiçbir enjekte olay görünmez (%100 temizlik).
- **SC-004**: Gerçek afet olayı export'larının/sayaçlarının %100'ü enjekte olay içermez (denetimde 0 sızıntı).
- **SC-005**: Enjekte bir olaydan oluşturulan her CAP taslağının %100'ü `is_exercise=true` olarak işaretlenir (mevcut mekanizma üzerinden, sıfır regresyon).

## Assumptions

- Enjekte olaylar tek seferlik, elle girilen kayıtlardır; zamanlanmış/çok adımlı senaryo dizileri (örn. "5 dakika sonra otomatik ikinci bir olay tetikle") bu iterasyonun kapsamı dışındadır (YAGNI, gelecekte ayrı bir spec olabilir).
- Enjekte olay sayısına bir üst sınır konmamıştır; tipik kullanımda tatbikat başına birkaç olay beklenir.
- Bir enjekte olayın CAP taslağına dönüştürülmesi opsiyoneldir ve mevcut "tespit edilen olaydan taslak oluştur" akışının (spec 011) küçük bir uzantısıdır — bu akışın kendisi veya `is_exercise` trigger mantığı (spec 013) bu spec kapsamında değiştirilmez.
- Enjekte olayların silinmesi (FR-009) tam bir CRUD yönetim arayüzü gerektirmez — tek olay bazında basit bir "kaldır" aksiyonu yeterlidir.
- Tatbikat özet/performans raporlaması (spec 017/032) bu spec kapsamında değiştirilmez; enjekte olaylar bu raporlara dahil edilmez, mevcut rapor mantığı aynen kalır.
- Yetkilendirme, mevcut tatbikat başlatma/durdurma yetkisiyle birebir aynıdır (country_admin/org_admin kendi ülke/org'unda, super_admin her yerde) — yeni bir rol veya izin kavramı eklenmez.
