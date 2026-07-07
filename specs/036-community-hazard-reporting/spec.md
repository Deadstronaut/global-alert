# Feature Specification: Vatandaş Kaynaklı Afet Bildirimi (Community Hazard Reporting)

**Feature Branch**: `036-community-hazard-reporting`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Build Community Hazard Reporting (SRS Module M7, docs/21_structured_srs.md §3.7 — the community feedback requirements that spec 009's Dissemination build explicitly deferred: MHEWS-FR-0109/0115/0226/0240/0267, MHEWS-SD-FEEDBACK-01/03/05, MHEWS-FC-STM-07). Unauthenticated public submission form (geo-tagged description, hazard type, optional photo); CommunityReport state machine (PENDING→APPROVED/REJECTED→ARCHIVED); country-scoped moderation queue with required rejection reason; approved reports as a map marker layer; link an approved report to an incident with an audit trail. Real NLP/LLM categorization, audio attachments, scheduled cluster-summary generation, live SSE ticker, and public self-registration are explicitly out of scope for this iteration."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vatandaş, giriş yapmadan bir afet/tehlike bildirimi gönderebilir (Priority: P1) 🎯 MVP

Bir deprem, sel, orman yangını gibi bir olay gözlemleyen herhangi bir kişi, hesap açmadan/giriş yapmadan, mevcut kimlik doğrulaması gerektirmeyen Public Portal ile aynı erişim modelinde bir form üzerinden; olayın türünü (mevcut afet tipi listesinden), kısa bir açıklamasını, konumunu (harita üzerinden seçilen veya cihazdan alınan lat/lng) ve isteğe bağlı tek bir fotoğrafını gönderebilir. Gönderim sonrası "bildiriminiz incelemeye alındı" onayı görür; bildirim, bir moderatör onaylayana kadar hiçbir yerde (harita, herkese açık sayfa) görünmez.

**Why this priority**: Bu spec'in tüm değeri bu akışa dayanır — vatandaş bildirimi olmadan moderasyon kuyruğu, harita katmanı ve incident bağlantısı gösterecek hiçbir veri olmaz. MVP tek başına test edilebilir ve zaten anlamlı bir "geri bildirim toplama" değeri sunar (moderasyon henüz yapılmamış olsa bile).

**Independent Test**: Herhangi bir kimlik doğrulaması olmadan bildirim formuna gidilir, tür/açıklama/konum girilir (fotoğrafsız), gönderilir; bildirimin veritabanında `PENDING` durumunda oluştuğu ve hiçbir public/authenticated görünümde henüz görünmediği doğrulanır.

**Acceptance Scenarios**:

1. **Given** kimlik doğrulaması yapılmamış bir ziyaretçi bildirim formunu açar, **When** afet tipi + açıklama + konum girip gönderir, **Then** yeni bir `PENDING` durumlu CommunityReport kaydı oluşur ve ziyaretçiye onay mesajı gösterilir.
2. **Given** ziyaretçi forma bir fotoğraf ekler, **When** gönderir, **Then** fotoğraf saklanır ve bildirim kaydına bağlanır.
3. **Given** ziyaretçi konum bilgisi olmadan göndermeye çalışır, **When** form doğrulanır, **Then** sistem konumun zorunlu olduğunu belirtip gönderimi reddeder.
4. **Given** bir bildirim henüz `PENDING` durumda, **When** herhangi bir kullanıcı (giriş yapmış veya yapmamış) haritayı veya herhangi bir genel görünümü açar, **Then** bu bildirim hiçbir yerde görünmez.

---

### User Story 2 - Yetkili kullanıcı bekleyen bildirimleri inceleyip onaylar/reddeder (Priority: P1)

`country_admin` veya `super_admin` rolündeki bir kullanıcı, admin panelindeki yeni bir "Vatandaş Bildirimleri" moderasyon kuyruğunu açar; kendi ülkesi/kapsamı içindeki `PENDING` bildirimleri (açıklama, konum, fotoğraf, tür) görür, her birini onaylayabilir veya zorunlu bir gerekçe belirterek reddedebilir. Onaylarken isteğe bağlı olarak bildirimi, o ülke içindeki bir organizasyona (örn. "İstanbul AFAD") da atayabilir — bu, ilgili saha ekibinin (`org_admin`) bildirimi kendi görünümünde görmesini sağlar (bkz. User Story 5). Onaylanan bildirim haritada görünür hale gelir; reddedilen bildirim bir daha public/haritada hiç görünmez ama denetim amaçlı kayıtlı kalır.

**Why this priority**: Moderasyon kapısı olmadan (MHEWS-SD-FEEDBACK-03) doğrulanmamış vatandaş içeriği doğrudan haritada görünür hale gelirdi — bu hem yanlış bilgi hem de kötüye kullanım riski taşır. Bu, User Story 1'in ürettiği veriyi güvenle kullanılabilir hale getiren zorunlu ikinci adımdır.

**Independent Test**: `PENDING` durumda en az bir bildirim varken bir country_admin hesabıyla moderasyon kuyruğu açılır; bir bildirim onaylanır ve durumunun `APPROVED`'a geçtiği, bir başkası gerekçeyle reddedilir ve durumunun `REJECTED`'a geçtiği + gerekçenin kaydedildiği doğrulanır. User Story 1'in ürettiği veriye bağlı ama moderasyon mantığı kendi başına test edilebilir.

**Acceptance Scenarios**:

1. **Given** kendi ülkesinde `PENDING` bir bildirim, **When** country_admin "Onayla" der, **Then** bildirim `APPROVED` durumuna geçer ve haritada görünür hale gelir.
2. **Given** kendi ülkesinde `PENDING` bir bildirim, **When** country_admin gerekçe girmeden "Reddet" demeye çalışır, **Then** sistem gerekçenin zorunlu olduğunu belirtip işlemi reddeder.
3. **Given** gerekçeyle reddedilmiş bir bildirim, **When** kuyruk tekrar açılır, **Then** bildirim artık `PENDING` listesinde görünmez ama geçmiş/denetim görünümünde durumu ve gerekçesiyle birlikte erişilebilir kalır.
4. **Given** başka bir ülkeye ait `PENDING` bir bildirim, **When** bir country_admin kendi moderasyon kuyruğunu açar, **Then** o bildirimi göremez (ülke kapsamı dışı).
5. **Given** bir viewer hesabı, **When** moderasyon kuyruğuna erişmeye çalışır, **Then** erişim reddedilir.
6. **Given** bir org_admin hesabı, **When** moderasyon kuyruğuna erişmeye çalışır, **Then** erişim reddedilir (onay/red yetkisi yalnızca country_admin/super_admin'dedir).
7. **Given** bir bildirimi onaylarken, **When** country_admin kendi ülkesindeki bir organizasyonu seçip onaylar, **Then** bildirim `APPROVED` olur ve seçilen organizasyona atanmış olarak kaydedilir.

---

### User Story 3 - Onaylanmış bildirimler haritada kümelenmiş işaretçiler olarak görünür (Priority: P2)

Sisteme giriş yapmış herhangi bir kullanıcı ana harita görünümünü açtığında, onaylanmış vatandaş bildirimlerini afet olaylarından görsel olarak ayrı, kendi işaretçi katmanında görebilir; yakın konumlardaki çok sayıda bildirim kümelenmiş (cluster) halde gösterilir, bir işaretçiye/kümeye tıklandığında bildirim detayları (tür, açıklama, fotoğraf varsa) açılır.

**Why this priority**: Onaylanan bildirimlerin görünür olması bu spec'in nihai kullanıcı değeridir (operasyonel farkındalık) ama User Story 1-2 tamamlanmadan üretilecek veri yoktur — bu yüzden P2.

**Independent Test**: En az bir `APPROVED` bildirim varken harita açılır, bildirim katmanının açık olduğu doğrulanır, işaretçiye tıklanır ve detayların göründüğü doğrulanır; katman kapatılıp işaretçilerin kaybolduğu, tekrar açılıp göründüğü test edilir. User Story 1-2'nin ürettiği veriye bağlı, kendi görüntüleme mantığı bağımsız test edilebilir.

**Acceptance Scenarios**:

1. **Given** en az bir `APPROVED` bildirim, **When** giriş yapmış bir kullanıcı haritayı açar, **Then** bildirim, afet olayı katmanından görsel olarak ayrı bir işaretçi/küme olarak görünür.
2. **Given** yakın konumda birden fazla `APPROVED` bildirim, **When** harita belirli bir zoom seviyesindeyken, **Then** bildirimler tek bir küme işaretçisinde birleştirilip sayı gösterilir.
3. **Given** bir bildirim işaretçisi/kümesi, **When** kullanıcı tıklar, **Then** açılan bilgi kutusunda tür, açıklama, gönderim zamanı ve (varsa) fotoğraf gösterilir.
4. **Given** bildirim katmanı açık, **When** kullanıcı katman kontrolünden gizler, **Then** tüm bildirim işaretçileri haritadan kalkar.

---

### User Story 4 - Yetkili kullanıcı onaylanmış bir bildirimi mevcut bir olaya (incident) bağlar (Priority: P3)

Bir moderatör, onaylanmış bir vatandaş bildirimini incelerken bunun devam eden bir operasyonel olayla (incident) ilişkili olduğunu fark eder ve bildirim üzerinden mevcut bir incident kaydına bağlantı kurar; bu bağlantı denetim kaydına (audit log) işlenir ve incident detayında ilişkili bildirim(ler) listelenir.

**Why this priority**: Değerli ama opsiyonel bir zenginleştirme — User Story 1-3 bu bağlantı olmadan da tam işlevseldir (spec 011'in CAP→incident bağlantısına benzer, ek bir kayıt ilişkisi).

**Independent Test**: `APPROVED` bir bildirim ve mevcut bir incident varken, moderatör bildirimi o incident'a bağlar; incident detay görünümünde bildirimin listelendiği ve audit_log'da bir bağlama olayının kaydedildiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** `APPROVED` bir bildirim ve kendi kapsamındaki bir incident, **When** yetkili kullanıcı bildirimi o incident'a bağlar, **Then** bağlantı kaydedilir ve incident detayında bildirim görünür.
2. **Given** bir bağlama işlemi gerçekleşir, **When** audit log incelenir, **Then** bağlama olayı (kim, ne zaman, hangi bildirim/incident) kayıtlıdır.
3. **Given** zaten bir incident'a bağlı bir bildirim, **When** kullanıcı onu başka bir incident'a bağlamaya çalışır, **Then** sistem mevcut bağlantıyı değiştirir (tek bağlantı, çoklu incident'a bağlama kapsam dışı).

---

### User Story 5 - Kendisine atanmış bildirimi org_admin kendi görünümünde görür (Priority: P3)

Bir `country_admin`/`super_admin`, User Story 2'de bir bildirimi onaylarken belirli bir organizasyona (örn. "Kadıköy Saha Ekibi") atadıysa, o organizasyona bağlı `org_admin` hesabı giriş yaptığında kendisine atanmış bu bildirimi (salt-okunur) kendi görünümünde görebilir — bildirimin detaylarını (tür, açıklama, konum, fotoğraf) inceleyebilir ama onay/red durumunu değiştiremez, çünkü moderasyon yetkisi yalnızca country_admin/super_admin'dedir.

**Why this priority**: Organizasyon bazlı yönlendirme, moderasyonun (User Story 2) isteğe bağlı bir uzantısıdır — atama yapılmazsa bu hikaye hiç devreye girmez, sistem User Story 1-4 ile tam işlevseldir. Bu yüzden P3.

**Independent Test**: Bir bildirim onaylanıp belirli bir organizasyona atandıktan sonra, o organizasyonun `org_admin` hesabıyla giriş yapılır; bildirimin görünümde listelendiği, ama org_admin'in onay/red/durum değiştirme aksiyonu göremediği doğrulanır. Farklı bir organizasyonun `org_admin`'i bu bildirimi GÖREMEMELİdir.

**Acceptance Scenarios**:

1. **Given** bir bildirim `APPROVED` ve "Kadıköy Saha Ekibi"ne atanmış, **When** o organizasyonun `org_admin`'i giriş yapar, **Then** bildirimi kendi görünümünde görebilir.
2. **Given** aynı bildirim, **When** başka bir organizasyonun `org_admin`'i giriş yapar, **Then** bildirimi göremez.
3. **Given** kendisine atanmış bir bildirim, **When** org_admin görünümü açar, **Then** onay/red veya durum değiştirme aksiyonu sunulmaz (salt-okunur).
4. **Given** hiçbir organizasyona atanmamış (`assigned_org_id` boş) onaylı bir bildirim, **When** herhangi bir `org_admin` kendi görünümünü açar, **Then** bu bildirimi göremez.

---

### Edge Cases

- Bildirimin konumu hiçbir ülke sınırı içine düşmüyorsa (açık deniz, tanımsız bölge): bildirim yine de `PENDING` olarak oluşturulur ama ülke ataması yapılamadığından yalnızca `super_admin` moderasyon kuyruğunda görür.
- Aynı kişi (aynı IP/oturum) kısa sürede çok sayıda bildirim gönderirse: bu iterasyonda oran sınırlama (rate limiting)/CAPTCHA yoktur — moderasyon kuyruğu tek güvenlik katmanıdır (bkz. Assumptions).
- Fotoğraf yüklenirken hata olursa (boyut/format sorunu): bildirim, fotoğraf olmadan metin+konum ile gönderilebilir; sistem hatayı belirtir ama tüm gönderimi engellemez.
- Bir bildirim reddedildikten sonra: bir daha onaya sunulamaz, yeniden durum değiştirilemez (`REJECTED` bir son durumdur, `ARCHIVED`'a taşınabilir ama `APPROVED`'a geçemez).
- Bağlı olduğu incident silinirse/arşivlenirse: bildirimin incident bağlantısı `NULL`'a döner, bildirimin kendisi silinmez (mevcut `shelters.linked_incident_id` deseniyle tutarlı `ON DELETE SET NULL`).
- Bir bildirim moderasyon kuyruğunda `APPROVED` yapıldıktan sonra fark edilen bir sorun nedeniyle geri alınmak istenirse: bu iterasyonda "onayı geri al" işlevi yoktur (YAGNI) — moderatör bunun yerine bildirimi `ARCHIVED`'a taşıyarak haritadan kaldırabilir.
- Bir bildirime atanan organizasyon sonradan silinirse: bildirimin `assigned_org_id`'si `NULL`'a döner, bildirimin kendisi ve onay durumu değişmez (mevcut `linked_incident_id`/`shelters.linked_incident_id` ile aynı `ON DELETE SET NULL` deseni).
- Bir bildirim onaylandıktan SONRA (atama yapılmadan) organizasyona atanmak istenirse: country_admin/super_admin bunu onay anından bağımsız, sonradan da yapabilir (atama, onay işlemine kilitli değildir — ayrı bir alan güncellemesidir).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, kimlik doğrulaması gerektirmeyen bir bildirim formu sunmalıdır; form afet tipi (mevcut hazard_types kaydından), serbest metin açıklama, konum (lat/lng) ve isteğe bağlı tek bir fotoğraf alanı içermelidir.
- **FR-002**: Sistem, afet tipi/açıklama/konum eksik olan gönderimleri reddetmeli ve kullanıcıya hangi alanın eksik olduğunu bildirmelidir.
- **FR-003**: Sistem, her gönderilen bildirimi `PENDING` durumunda oluşturmalı ve durum geçişlerini yalnızca `PENDING→APPROVED`, `PENDING→REJECTED`, `APPROVED→ARCHIVED`, `REJECTED→ARCHIVED` olacak şekilde zorunlu kılmalıdır (başka hiçbir geçişe izin verilmemeli).
- **FR-004**: `PENDING` veya `REJECTED` durumundaki bildirimler, moderasyon kuyruğu dışında (harita, herhangi bir public/authenticated görünüm) hiçbir yerde gösterilmemelidir.
- **FR-005**: Sistem, bir bildirimin konumundan (lat/lng) hangi ülkeye ait olduğunu belirlemeli ve moderasyon kuyruğunu bu ülke bilgisine göre kapsamlandırmalıdır.
- **FR-006**: Yalnızca `country_admin` (kendi ülkesindeki bildirimler için) ve `super_admin` (tüm bildirimler için) moderasyon kuyruğuna erişebilmeli ve onay/red işlemi yapabilmelidir; `org_admin` ve `viewer` onay/red işlemi yapamamalıdır (org_admin'in sınırlı, salt-okunur erişimi için bkz. FR-015).
- **FR-007**: Bir bildirimi reddetmek için gerekçe (metin) zorunlu olmalıdır; gerekçesiz red işlemi reddedilmelidir.
- **FR-008**: `APPROVED` durumuna geçen bir bildirim, giriş yapmış tüm kullanıcılara (viewer dahil) ana harita görünümünde, afet olayı katmanından görsel olarak ayrı bir işaretçi katmanında gösterilmelidir.
- **FR-009**: Yakın konumdaki çok sayıda onaylı bildirim, harita üzerinde kümelenmiş (cluster) tek bir işaretçi olarak gösterilmeli, tıklandığında bildirim sayısı ve detayları görüntülenmelidir.
- **FR-010**: Kullanıcılar, mevcut harita katman kontrollerine benzer bir arayüzle bildirim katmanının görünürlüğünü açıp kapatabilmelidir.
- **FR-011**: Yetkili kullanıcılar (moderasyon erişimi olanlar), onaylanmış bir bildirimi kendi kapsamları içindeki mevcut bir incident kaydına bağlayabilmelidir; bu işlem audit_log'a kaydedilmelidir.
- **FR-012**: Bir bildirim yalnızca tek bir incident'a bağlanabilir; yeni bir bağlama mevcut bağlantının yerini alır.
- **FR-013**: Sistem, bildirime eklenen fotoğrafı yalnızca resim MIME tipleri ve makul bir boyut sınırı içinde kabul etmelidir; sınır dışı dosyalar reddedilmelidir.
- **FR-014**: Bildirimin afet tipi ataması, gönderim anında moderatör tarafından mevcut hazard_types kaydından manuel seçilir; bu iterasyonda otomatik (NLP/LLM) kategorileştirme yapılmaz.
- **FR-015**: `country_admin` veya `super_admin`, bir bildirimi (onay anında veya sonradan) kendi ülkesi içindeki mevcut bir organizasyona atayabilmelidir; bu atama isteğe bağlıdır (zorunlu değildir).
- **FR-016**: Bir organizasyona atanmış ve `APPROVED` durumundaki bir bildirim, yalnızca o organizasyona bağlı `org_admin` tarafından, salt-okunur olarak görülebilmelidir; `org_admin` bu bildirim üzerinde onay/red/durum değiştirme işlemi yapamamalıdır.
- **FR-017**: Bir organizasyona atanmamış (`assigned_org_id` boş) bildirimler, hiçbir `org_admin`'e görünmemelidir.

### Key Entities

- **Vatandaş Bildirimi (CommunityReport)**: Vatandaş tarafından gönderilen tekil bir gözlem — afet tipi (hazard_types'a referans), serbest metin açıklama, konum (lat/lng), türetilmiş ülke kodu, isteğe bağlı fotoğraf, durum (`PENDING`/`APPROVED`/`REJECTED`/`ARCHIVED`), red gerekçesi (varsa), opsiyonel atanmış organizasyon (`assigned_org_id`), opsiyonel bağlı incident, gönderim zamanı, moderasyon zamanı/kullanıcısı.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Kimlik doğrulaması olmayan bir ziyaretçi, bildirim formunu açtıktan sonra 2 dakikanın altında (tür+açıklama+konum girip) bir bildirim gönderebilir.
- **SC-002**: Onaylanmış bir bildirim, moderatörün onay işleminden sonraki bir sonraki harita yüklemesinde (sayfa yenileme) haritada görünür hale gelir.
- **SC-003**: Moderatörlerin %100'ü, gerekçesiz bir red işlemi gerçekleştiremez (sistem her seferinde engeller).
- **SC-004**: Yetkisiz roller (viewer, kimliksiz ziyaretçi, ve kendisine atanmamış bildirimler için org_admin), moderasyon kuyruğuna, onay/red işlemine veya `PENDING`/`REJECTED` bildirim içeriğine hiçbir koşulda erişemez (denetimde 0 sızıntı).
- **SC-005**: Bir incident'a bağlanan her bildirim için audit_log'da karşılık gelen bir kayıt bulunur (%100 izlenebilirlik).

## Assumptions

- Vatandaş bildirimlerinin ülke ataması tamamen coğrafi (lat/lng → mevcut ülke sınırı verisi) yapılır; gönderen kişinin beyanına dayanmaz, çünkü gönderen kimlik doğrulamadan geçmez.
- Bildirimlerin gönderim anında bir organizasyon (`org_id`) kapsamı yoktur (coğrafi koordinattan organizasyon çıkarılamaz — organizasyonların kendi coğrafi sınırı yok, yalnızca `country_code` + hiyerarşik bir isim var). Bu yüzden organizasyon ataması yalnızca moderasyon sırasında/sonrasında country_admin/super_admin tarafından ELLE yapılır (FR-015); `org_admin`'in erişimi bu atamaya bağlıdır — moderasyon (onay/red) yetkisi her koşulda yalnızca country_admin/super_admin'dedir, org_admin'e hiçbir zaman verilmez.
- Fotoğraf saklama alanı bu projede ilk kez kullanılan bir depolama (storage) yeteneği gerektirir; bu spec kapsamında yalnızca tekil, resim tipi, boyut sınırlı bir dosya desteklenir — çoklu dosya, video veya ses eki kapsam dışıdır (MHEWS-FR-0226'nın ses kısmı hariç tutulmuştur).
- Otomatik/NLP tabanlı kategorileştirme (MHEWS-FR-0004/0112/0212, MHEWS-SD-FEEDBACK-02) bu iterasyonun kapsamı dışındadır çünkü projede henüz bir AI/LLM altyapısı yoktur (Forecasting/AI modülüyle tutarlı, post-PoC); bunun yerine moderatör afet tipini manuel atar.
- Spam/kötüye kullanıma karşı oran sınırlama (rate limiting) veya CAPTCHA bu iterasyonda yoktur; moderasyon kuyruğu (hiçbir içerik onaysız görünür olmaz) tek koruma katmanı olarak kabul edilir.
- Zamanlanmış coğrafi küme özet raporu (MHEWS-SD-FEEDBACK-04, 2 saatte bir), canlı SSE bildirim akışı (MHEWS-FR-0241) ve kimlik doğrulaması gerektirmeyen Public Portal'da bildirim gösterimi bu iterasyonun kapsamı dışındadır; ana harita zaten yalnızca giriş yapmış kullanıcılara açıktır (spec 027 ile tutarlı desen) ve bu spec o erişim modelini değiştirmez.
- Kamu self-registration / double opt-in (MHEWS-SD-SELFREG-01) bu projede hiçbir yerde yoktur ve bu spec de eklemez — bildirim formu kimlik gerektirmeden, hesapsız çalışır.
- Bir bildirimin `APPROVED` durumundan geri "PENDING"e veya doğrudan `REJECTED`'a döndürülmesi (onayı geri alma) kapsam dışıdır; moderatör gerekirse bildirimi `ARCHIVED`'a taşıyarak haritadan kaldırabilir.
