# Feature Specification: Audit & Compliance Gaps (Retention, Evidence Package, Controlled Deletion, Breach Logging, Security Config Report)

**Feature Branch**: `035-audit-compliance-retention`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Audit & Compliance modülünde PRD'de açıkça yer alan ama daha önce hiç yapılmamış 3 HIGH + 2 MEDIUM öncelikli, buildable gereksinim: (1) yapılandırılabilir veri saklama (retention) politikaları, (2) Evidence Package ZIP export, (3) kontrollü/auditable veri silme iş akışı, (4) security breach event logging, (5) security config audit raporu."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Yapılandırılabilir veri saklama politikası (Priority: P1) 🎯 MVP

Bir super_admin, farklı veri kategorileri (ör. denetim kayıtları, dispatch alım makbuzları) için ne kadar süreyle saklanacağını ve süre dolduğunda ne yapılacağını (arşivle veya sil) yapılandırabilmek ister; böylece kurum kendi düzenleyici/uyumluluk gereksinimlerine göre veri ömrünü kontrol edebilir.

**Why this priority**: Diğer dört gereksinim ya bu politikaların varlığına bağlıdır (evidence package/controlled deletion bir veri yönetişimi bağlamında anlam kazanır) ya da bağımsızdır ama saklama politikası eksikliği, kurumun uyumluluk denetimlerinden geçememesi riskini doğrudan taşır — en yüksek öncelik.

**Independent Test**: Bir super_admin bir kategori için kısa bir saklama süresi ve "arşivle" eylemi tanımlar; süre dolduğunda ilgili kayıtların arşivlendiği (silinmediği) ve bir denetim izinin bu işlemi kaydettiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** super_admin bir veri kategorisi için saklama süresi ve eylem (arşivle/sil) tanımlar, **When** politika kaydedilir, **Then** politika mevcut değerlerle birlikte listelenir ve düzenlenebilir.
2. **Given** bir kategori için saklama süresi dolmuş kayıtlar mevcut, **When** periyodik saklama kontrolü çalışır, **Then** yapılandırılan eylem (arşivle veya sil) uygulanır ve bu işlem kendisi bir denetim kaydı olarak loglanır.
3. **Given** bir kategori için henüz hiçbir saklama politikası tanımlanmamış, **When** periyodik kontrol çalışır, **Then** o kategorideki hiçbir kayıt etkilenmez (varsayılan davranış: politika yoksa hiçbir şey silinmez/arşivlenmez).
4. **Given** bir yönetici "sil" eylemini seçer, **When** politika kaydedilir, **Then** sistem bunun geri döndürülemez olduğuna dair açık bir uyarı gösterir ve onay ister.

---

### User Story 2 - Kanıt paketi (Evidence Package) export (Priority: P1) 🎯 MVP

Bir denetçi veya yönetici, yayınlanmış bir uyarı için tüm ilgili kanıtları (uyarı içeriği, kime ne zaman ulaştığı, ilgili sistem olayları) tek bir indirilebilir pakette toplu olarak almak ister; böylece bir düzenleyici incelemesinde veya olay sonrası değerlendirmede tüm kanıtı ayrı ayrı toplamak zorunda kalmaz.

**Why this priority**: Denetim/uyumluluk süreçlerinin somut çıktısı budur; P1 çünkü dış paydaşlarla (denetçi, düzenleyici kurum) doğrudan etkileşimde kullanılır.

**Independent Test**: Yayınlanmış bir uyarı için kanıt paketi indirilir; paketin uyarı içeriğini, alım kayıtlarını ve ilgili denetim kayıtlarını içerdiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** yayınlanmış bir uyarı ve buna bağlı alım kayıtları/denetim kayıtları mevcut, **When** yönetici o uyarı için kanıt paketini indirir, **Then** tek bir paket dosyası; uyarı içeriğinin standart export formatını, ilgili alım kayıtlarının özetini ve ilgili denetim kayıtlarını içerir.
2. **Given** bir uyarının hiç alım kaydı yok, **When** kanıt paketi indirilir, **Then** paket yine oluşturulur, ilgili bölüm "alım kaydı yok" olarak işaretlenir (hata vermez).
3. **Given** henüz yayınlanmamış (taslak durumundaki) bir uyarı, **When** yönetici kanıt paketi indirmeye çalışır, **Then** sistem bunun sadece yayınlanmış uyarılar için kullanılabileceğini belirtir.

---

### User Story 3 - Kontrollü, gerekçeli veri silme (Priority: P2)

Bir yönetici hassas bir kaydı (ör. bir kişi/kontak veya bir exposure veri seti) silmek istediğinde, sistemin bu işlem için bir gerekçe girmesini zorunlu kılmasını ve bu gerekçenin denetim izinde kalıcı olarak saklanmasını ister; böylece "neden silindiği" sorusu her zaman cevaplanabilir.

**Why this priority**: Mevcut genel denetim mekanizması zaten silme olayının kendisini kaydediyor; bu story sadece "neden" bilgisini ekliyor — P1'lere göre daha az kritik ama tek başına anlamlı bir iyileştirme.

**Independent Test**: Bir yönetici korunan bir tablodan bir kayıt siler, gerekçe girmeden silme işleminin engellendiği, gerekçe girildiğinde silmenin gerçekleştiği ve gerekçenin denetim izinde göründüğü doğrulanır.

**Acceptance Scenarios**:

1. **Given** yönetici korunan bir tablodan bir kayıt silmek istiyor, **When** gerekçe alanını boş bırakıp silmeyi dener, **Then** işlem engellenir ve gerekçenin zorunlu olduğu belirtilir.
2. **Given** yönetici bir gerekçe girer, **When** silme onaylanır, **Then** kayıt silinir ve gerekçe metni denetim izinde o silme olayıyla ilişkilendirilmiş olarak kalıcı biçimde saklanır.
3. **Given** korunan tablolar listesinde olmayan bir tablo, **When** bir kayıt silinir, **Then** mevcut genel denetim davranışı (gerekçesiz) değişmeden devam eder (bu story sadece belirlenmiş hassas tablolara uygulanır).

---

### User Story 4 - Güvenlik olayı (breach) günlüğü (Priority: P3)

Bir super_admin, hesap kilitlenmeleri, başarısız çok faktörlü kimlik doğrulama denemeleri gibi güvenlikle ilgili olayları, genel sistem değişikliği kayıtlarından ayrı, kolayca filtrelenebilir bir "güvenlik olayları" görünümünde incelemek ister; böylece olası bir güvenlik ihlalini genel gürültü içinde kaybetmez.

**Why this priority**: Mevcut genel denetim izni bu olayları zaten (dolaylı olarak) yakalıyor olabilir; bu story bunları ayrıştırıp görünür kılan bir iyileştirme — P1/P2'lere göre daha az acil.

**Independent Test**: Bir hesap art arda başarısız girişlerle kilitlenir; bu olayın "güvenlik olayı" olarak ayrı bir kategoriyle işaretlendiği ve güvenlik olayları görünümünde listelendiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** bir hesap başarısız deneme limitini aşarak kilitleniyor, **When** olay gerçekleşir, **Then** bu olay "güvenlik olayı" kategorisiyle işaretlenmiş şekilde denetim izninde görünür.
2. **Given** bir super_admin güvenlik olayları görünümünü açar, **When** filtre uygulanmaz, **Then** sadece güvenlik-kategorili olaylar listelenir, genel veri değişiklik kayıtları karışmaz.
3. **Given** hiç güvenlik olayı gerçekleşmemiş, **When** görünüm açılır, **Then** boş durum mesajı gösterilir, hata oluşmaz.

---

### User Story 5 - Güvenlik yapılandırması denetim raporu (Priority: P3)

Bir super_admin, sistemin mevcut güvenlik yapılandırmasının (ör. çok faktörlü kimlik doğrulama zorunluluğu durumu, tanımlı saklama politikaları, verilmiş özel yetkiler) tek bir raporda özetlenmiş halini görmek ister; böylece bir düzenleyici denetiminde "güvenlik ayarlarınız nedir" sorusuna anında, güncel bir cevap verebilir.

**Why this priority**: Diğer story'lerin sonucu olarak ortaya çıkan bilgiyi bir araya getiren, tamamlayıcı bir görünürlük katmanı; en düşük öncelik çünkü altındaki veriler (US1/US4) zaten kendi başlarına erişilebilir.

**Independent Test**: Rapor açıldığında, mevcut MFA zorunluluğu durumu, tanımlı saklama politikaları sayısı ve aktif özel yetki sayısı gibi alanların güncel veriyle eşleştiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** sistemde tanımlı saklama politikaları ve verilmiş özel yetkiler mevcut, **When** super_admin raporu açar, **Then** rapor bu bilgileri güncel haliyle, tek bir görünümde listeler.
2. **Given** rapor açık, **When** super_admin export ister, **Then** rapor standart export formatlarından (CSV/JSON) birinde indirilebilir.

---

### Edge Cases

- Bir saklama politikası "sil" olarak yapılandırılmışsa ve etkilenen kayıtlar arasında hâlâ aktif/referans edilen (ör. başka bir tabloya FK ile bağlı) kayıtlar varsa, silme işlemi bu kayıtları atlamalı, hata ile tüm işlemi durdurmamalıdır.
- Kanıt paketi indirilirken ilgili denetim kayıtları çok büyükse (ör. binlerce satır), paket oluşturma makul sürede tamamlanmalı veya kullanıcıya kapsamı daraltma seçeneği sunulmalıdır.
- Gerekçe metni aşırı kısa/anlamsız girilse bile (ör. tek karakter) sistem bunu engellemez — gerekçenin var olması zorunlu, içerik kalitesi bu spec'in kapsamı dışındadır.
- Aynı anda birden fazla güvenlik olayı üretilirse (ör. toplu başarısız giriş denemesi), her biri ayrı ayrı loglanır, birleştirme/özetleme yapılmaz.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, super_admin'in veri kategorisi başına bir saklama süresi ve süre dolduğunda uygulanacak eylemi (arşivle veya sil) yapılandırabilmesine izin vermelidir.
- **FR-002**: Bir kategori için saklama politikası tanımlanmamışsa, o kategorideki hiçbir kayıt otomatik olarak etkilenmemelidir (varsayılan: hiçbir işlem yapılmaz).
- **FR-003**: Saklama süresi dolan kayıtlar için yapılandırılan eylem (arşivleme veya silme) periyodik olarak otomatik uygulanmalı ve bu işlemin kendisi denetim izninde kayıt altına alınmalıdır.
- **FR-004**: Bir saklama politikası "sil" eylemiyle yapılandırılırken, sistem bunun geri döndürülemez olduğunu açıkça belirtmeli ve onay istemelidir.
- **FR-005**: Sistem, yayınlanmış bir uyarı için, uyarı içeriğini, ilgili alım kayıtlarını ve ilgili denetim kayıtlarını tek bir indirilebilir pakette birleştirebilmelidir.
- **FR-006**: İlgili alım kaydı veya denetim kaydı bulunmayan bölümler, kanıt paketinde hata üretmeden "veri yok" olarak işaretlenmelidir.
- **FR-007**: Henüz yayınlanmamış bir uyarı için kanıt paketi talebi reddedilmeli ve nedeni kullanıcıya açıkça bildirilmelidir.
- **FR-008**: Sistem, önceden belirlenmiş hassas tablolardaki bir kaydı silerken kullanıcıdan zorunlu bir gerekçe metni istemeli; gerekçe girilmeden silme işlemi gerçekleşmemelidir.
- **FR-009**: Girilen gerekçe metni, ilgili silme olayıyla ilişkilendirilerek denetim izninde kalıcı olarak saklanmalıdır.
- **FR-010**: Hassas tablolar listesinde yer almayan tablolardaki silme işlemleri, mevcut genel denetim davranışıyla (gerekçesiz) değişmeden devam etmelidir.
- **FR-011**: Sistem, belirli güvenlik olaylarını (ör. hesap kilitlenmesi, başarısız çok faktörlü kimlik doğrulama denemesi) ayrı bir "güvenlik olayı" kategorisiyle işaretleyerek kaydetmelidir.
- **FR-012**: Super_admin, sadece güvenlik-kategorili olayları listeleyen ayrı bir görünüme erişebilmelidir.
- **FR-013**: Sistem, mevcut güvenlik yapılandırmasını (çok faktörlü kimlik doğrulama zorunluluğu durumu, tanımlı saklama politikaları, aktif özel yetkiler) özetleyen, güncel veriye dayalı bir rapor sunmalıdır.
- **FR-014**: Güvenlik yapılandırması raporu standart export formatlarından (CSV/JSON) en az biriyle indirilebilir olmalıdır.

### Key Entities *(include if feature involves data)*

- **Saklama Politikası (Retention Policy)**: Bir veri kategorisi için tanımlanan saklama süresi ve süre dolduğunda uygulanacak eylem (arşivle/sil).
- **Kanıt Paketi (Evidence Package)**: Bir uyarıya ait içerik, alım kayıtları ve denetim kayıtlarının birleştirilmiş, indirilebilir temsili.
- **Silme Gerekçesi**: Hassas bir tablodaki bir silme olayına eşlik eden, kullanıcı tarafından girilen zorunlu açıklama metni.
- **Güvenlik Olayı (Security Event)**: Genel denetim izninden ayrı olarak işaretlenen, güvenlikle doğrudan ilgili bir olay kaydı.
- **Güvenlik Yapılandırması Raporu**: Sistemin o anki güvenlik ayarlarının (MFA, saklama politikaları, özel yetkiler) özetlendiği rapor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bir super_admin, herhangi bir veri kategorisi için saklama politikasını 2 dakikadan kısa sürede tanımlayabilir.
- **SC-002**: Yayınlanmış her uyarının %100'ü için, o uyarıya ait bir kanıt paketi talep üzerine indirilebilir durumdadır.
- **SC-003**: Hassas tablolardaki silme olaylarının %100'ü, ilişkili bir gerekçe metniyle birlikte denetim izninde bulunur.
- **SC-004**: Bir super_admin, sistemin güncel güvenlik yapılandırmasını ayrı kaynaklara bakmadan tek bir raporda görüntüleyebilir.

## Assumptions

- Saklama politikalarının kapsayacağı veri kategorileri, mevcut yüksek-hacimli/zaman-damgalı tablolarla sınırlıdır (ör. denetim kayıtları, dispatch alım kayıtları); iş-kritik referans verisi (ör. hazard_types, cap_drafts'ın kendisi) bu spec'in ilk kapsamına dahil edilmez — genişletme kolaydır (config satırı eklemek), kod değişikliği gerektirmez.
- "Arşivle" eylemi, kaydı ayrı bir arşiv tablosuna/temsiline taşımak anlamına gelir (kalıcı silme değildir); "sil" eylemi geri döndürülemezdir ve varsayılan değildir — bir politika açıkça "sil" olarak yapılandırılmadıkça hiçbir kayıt kalıcı olarak silinmez.
- Kanıt paketi formatı, mevcut CAP XML export (spec 014) ve mevcut CSV/JSON export yardımcılarının birleşimidir; harici bir dijital imza/mühürleme mekanizması (ör. kriptografik zaman damgası) bu spec'in kapsamı dışındadır.
- Hassas tablolar listesi (controlled deletion'ın uygulanacağı tablolar) sabit, önceden tanımlı bir küçük küme olarak ele alınır (ör. contacts, exposure_datasets); yeni bir tablo eklemek config değişikliği gerektirir, otomatik/genel bir mekanizma değildir.
- Güvenlik olayı kategorisi, mevcut hesap kilitleme (spec 028) ve MFA (spec 005) akışlarına additive bir etiketleme katmanıdır; yeni bir tehdit tespiti/anomali analizi (ör. makine öğrenmesi tabanlı) bu spec'in kapsamı dışındadır.
- Güvenlik yapılandırması raporu canlı bir sorgu sonucu olarak sunulur (mevcut access review raporu deseniyle tutarlı, spec 028); ayrı bir zamanlanmış/arşivlenen rapor tablosu gerektirmez.
