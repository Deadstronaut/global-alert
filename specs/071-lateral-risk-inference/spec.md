# Feature Specification: Çapraz-Afet Risk Çıkarımı ve Öngörü Raporu

**Feature Branch**: `071-lateral-risk-inference`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "Çapraz-afet (\"lateral\") risk çıkarım ve öngörü raporu motoru: bir afet meydana geldiğinde/seçildiğinde, o bölgedeki diğer mevcut veri katmanlarını (kuraklık, sıcak/soğuk hava dalgası, toz fırtınası, yol ağı yoğunluğu, kritik altyapı yakınlığı, nüfus, ve yeni eklenecek bir kıyı/batimetri katmanı) çapraz tarayarak potansiyel ikincil riskleri çıkarır. Ana panelde kritik bir durum tespit edildiğinde yanıp sönen bir tetikleyici ile erişilen, tek sayfalık, grafik/sayısal verilerle desteklenmiş bir öngörü raporu: etkilenen şehir/kasaba listesi, etkilenen bina/kritik tesis listesi, potansiyel ikincil riskler listesi, ve haber verilmesi önerilen kurum TÜRLERİ. Kesin kısıtlar: hiçbir zaman otomatik mesaj/bildirim gönderilmez; her rapor 'sezgisel öngörü, doğrulanmamış' etiketi taşır; sadece gerçekten var olan veri katmanları kullanılır (doğalgaz hattı verisi yok, atlanır; kıyı/batimetri verisi şu an yok, yeni eklenmesi gerekiyor)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seçili bir afetin potansiyel ikincil risklerini görmek (Priority: P1) 🎯 MVP

Bir operatör haritada bir afeti (ör. bir deprem) seçtiğinde, sistem o bölgedeki diğer mevcut veri katmanlarına (kuraklık, sıcak/soğuk hava dalgası, toz fırtınası, yol ağı yoğunluğu, kritik altyapı yakınlığı) otomatik olarak bakar ve "bu koşullar altında şu ikincil riskler potansiyel olarak artmış olabilir" şeklinde bir liste üretir — örn. "bölgede kuraklık ve sıcak hava dalgası aktif → yangın çıkma/yayılma riski potansiyeli", "yakında sağlık tesisi var ve yol ağı yoğunluğu düşük → erişim riski potansiyeli". Operatör bu listeyi doğrudan afetin yanında görür, ekstra bir işlem yapmasına gerek yoktur.

**Why this priority**: Bu, tüm özelliğin çekirdek çıkarım mantığı — diğer her şey (tetikleyici, tek sayfalık rapor) bu bulgular üzerine inşa edilir. Tek başına da değerlidir: operatör bir afeti incelerken ek bağlamı hemen görür.

**Independent Test**: Rüzgara duyarlı olmayan bir afet (ör. deprem) seçildiğinde, o bölgede aktif kuraklık/sıcak hava dalgası katmanı varsa "yangın riski potansiyeli" bulgusunun listelendiği, hiçbir ilgili katman aktif değilse listenin boş/"belirgin ikincil risk tespit edilmedi" durumunda olduğu doğrulanarak bağımsız test edilebilir.

**Acceptance Scenarios**:

1. **Given** bir deprem seçili ve o bölgede kuraklık + sıcak hava dalgası katmanı aktif, **When** operatör afet detayına bakar, **Then** "yangın çıkma/yayılma riski potansiyeli" bulgusu, hangi katmanlara dayandığı belirtilerek listelenir.
2. **Given** bir afet seçili ama o bölgede hiçbir ilgili ikincil-risk katmanı aktif değil, **When** operatör afet detayına bakar, **Then** sistem "belirgin bir ikincil risk tespit edilmedi" mesajı gösterir, uydurma bir risk göstermez.
3. **Given** bir afet seçili ve yakınında kritik altyapı (sağlık/eğitim/acil durum) tesisi var, **When** operatör afet detayına bakar, **Then** bu tesisler ve yol ağı yoğunluğuna göre erişim/kapasite riski değerlendirmesi listelenir.

---

### User Story 2 - Kritik durumda tek sayfalık öngörü raporuna hızlı erişim (Priority: P2)

Sistem, önceden tanımlı bir önem eşiğini aşan bir afet (ör. yüksek büyüklükte deprem, kritik seviye yangın) tespit ettiğinde, ana panelde küçük bir tetikleyici görsel olarak dikkat çeker (yanıp sönme). Operatör buna tıkladığında, o afet için tek sayfalık, grafik ve sayısal verilerle desteklenmiş bir öngörü raporu açılır: etkilenen şehir/kasaba listesi, etkilenen bina/kritik tesis listesi, User Story 1'in ürettiği potansiyel ikincil riskler listesi, ve haber verilmesi önerilen kurum TÜRLERİ (itfaiye, sağlık, afet yönetimi gibi genel kategoriler).

**Why this priority**: User Story 1'in ürettiği bulguları operatörün kolayca erişebileceği tek, paylaşılabilir bir görünüme toplar — kritik durumlarda hız kazandırır. User Story 1 olmadan anlamsızdır, bu yüzden P2.

**Independent Test**: Önem eşiğini aşan bir afet simüle edilerek, tetikleyicinin görünür/yanıp söner hale geldiği, tıklandığında raporun tüm bölümleriyle (şehir/kasaba, bina/tesis, risk listesi, kurum türleri, "sezgisel öngörü" etiketi) açıldığı doğrulanarak bağımsız test edilebilir.

**Acceptance Scenarios**:

1. **Given** önem eşiğini aşan yeni bir afet oluştu, **When** operatör ana paneli görüntülüyor, **Then** tetikleyici görsel olarak (yanıp sönerek) dikkat çeker.
2. **Given** operatör tetikleyiciye tıkladı, **When** rapor açılır, **Then** rapor üstünde açıkça "SEZGİSEL ÖNGÖRÜ — gerçek fiziksel simülasyon değildir, doğrulanmamıştır" etiketi görünür ve rapor hiçbir dış sisteme otomatik bir mesaj/bildirim göndermez.
3. **Given** rapor açık, **When** operatör kurum önerileri bölümüne bakar, **Then** yalnızca genel kurum TÜRLERİ (ör. "itfaiye", "sağlık kuruluşları") listelenir, özel kurum isimleri veya gönderim eylemi sunulmaz.

---

### User Story 3 - Kıyıya yakın büyük depremlerde tsunami riski potansiyelini görmek (Priority: P3)

Bir operatör kıyıya yakın, büyüklüğü belirli bir eşiğin üzerinde bir deprem seçtiğinde, sistem yeni eklenen kıyı-mesafe verisini kullanarak "tsunami riski potansiyeli" bulgusunu (kaba coğrafi yakınlık sezgisiyle, gerçek dalga simülasyonu olmadığı açıkça belirtilerek) User Story 1'in bulgu listesine ekler.

**Why this priority**: Gerçek değer taşır ama yeni bir veri katmanının (kıyı/batimetri mesafesi) sisteme eklenmesini gerektirir — User Story 1/2 bu veri olmadan da çalışabildiği için en düşük öncelik.

**Independent Test**: Kıyıya yakın, eşik-üstü büyüklükte bir deprem seçildiğinde "tsunami riski potansiyeli" bulgusunun listelendiği; kıyıdan uzak veya eşik-altı bir deprem için bu bulgunun hiç görünmediği doğrulanarak bağımsız test edilebilir.

**Acceptance Scenarios**:

1. **Given** kıyıya yakın ve büyüklüğü eşik üzerinde bir deprem seçili, **When** operatör ikincil risk listesine bakar, **Then** "tsunami riski potansiyeli (kaba coğrafi sezgi, gerçek dalga simülasyonu değildir)" bulgusu görünür.
2. **Given** karanın iç kesiminde veya eşik-altı büyüklükte bir deprem seçili, **When** operatör ikincil risk listesine bakar, **Then** tsunami bulgusu hiç listelenmez.

---

### Edge Cases

- Seçili afetin konumunda hiçbir ilave katman verisi yoksa (ör. o bölge için kuraklık/exposure verisi hiç çekilmemiş), sistem o katmanı "veri yok" olarak es geçer, riski varsayılan/uydurma göstermez.
- Aynı anda birden fazla kritik afet oluşursa, tetikleyici en yüksek önem derecesindeki afeti öne çıkarır; operatör diğerlerine de erişebilmelidir.
- Bir afet zaten "rüzgara duyarlı" kategorideyse (spec 070), o afetin rüzgar-yayılım bulgusu bu raporun ikincil-risk listesine de bir satır olarak dahil edilir (mükerrer bir ayrı mekanizma kurulmaz, mevcut sonuç yeniden kullanılır).
- Kritik altyapı/yol ağı verisi seçili bölgede hiç yoksa, erişim/kapasite riski bulgusu üretilmez ("veri yok" durumu, "risk yok" ile karıştırılmaz).
- Kullanıcı raporu kapatıp tekrar açtığında (veya farklı bir afet seçtiğinde), önceki raporun bulguları yeni seçime göre yeniden hesaplanır, eskisi kalıntı olarak görünmez.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, bir afet seçildiğinde, o afetin konumundaki mevcut veri katmanlarını (kuraklık, sıcak/soğuk hava dalgası, toz fırtınası, yol ağı yoğunluğu, kritik altyapı yakınlığı, nüfus) otomatik olarak taramalı.
- **FR-002**: Sistem, taranan katmanların durumuna göre kural-tabanlı potansiyel ikincil risk bulguları üretmeli (ör. deprem + kuraklık/sıcak hava dalgası aktif → yangın riski potansiyeli; sel → salgın hastalık riski potansiyeli).
- **FR-003**: Sistem, hiçbir ilgili katman aktif/anlamlı değilse "belirgin bir ikincil risk tespit edilmedi" durumunu açıkça iletmeli, varsayılan veya uydurma bir risk göstermemeli.
- **FR-004**: Sistem, seçili afetin yakınındaki kritik altyapı (sağlık/eğitim/acil durum) tesislerini ve bu tesislere yol ağı üzerinden erişimin ne kadar yoğun/seyrek olduğunu değerlendirerek bir erişim/kapasite riski bulgusu üretmeli.
- **FR-005**: Sistem, spec 070'in ürettiği rüzgar-yayılım bulgusunu (varsa) bu özelliğin ikincil-risk listesine bir bulgu satırı olarak dahil etmeli, aynı hesaplamayı tekrar üretmemeli.
- **FR-006**: Sistem, önceden tanımlı bir önem eşiğini (afet büyüklüğü/şiddeti) aşan bir afet tespit ettiğinde, ana panelde görsel olarak dikkat çeken (yanıp sönen) bir tetikleyici göstermeli.
- **FR-007**: Tetikleyiciye tıklandığında sistem, seçili/ilgili afet için tek sayfalık bir öngörü raporu açmalı; rapor şunları içermeli: etkilenen şehir/kasaba listesi, etkilenen bina/kritik tesis listesi, potansiyel ikincil riskler listesi (grafik/sayısal verilerle desteklenmiş), ve haber verilmesi önerilen kurum TÜRLERİ.
- **FR-008**: Kurum önerileri yalnızca genel kategori/tür (ör. "itfaiye", "sağlık kuruluşları", "afet yönetimi") olarak gösterilmeli; özel kurum ismi zorunlu değildir ve sistem hiçbir gerçek kurumla entegre olmamalı.
- **FR-009**: Sistem hiçbir koşulda otomatik mesaj, e-posta veya bildirim GÖNDERMEMELİ — rapor yalnızca ekranda gösterilen bir öneridir, tetiklediği hiçbir dış eylem yoktur.
- **FR-010**: Her öngörü raporu, görünür ve belirgin şekilde "SEZGİSEL ÖNGÖRÜ — gerçek fiziksel simülasyon değildir, doğrulanmamıştır, bir pilot/test uygulamasıdır" etiketini taşımalı.
- **FR-011**: Sistem yalnızca gerçekten mevcut veri katmanlarını kullanmalı; bir veri kategorisi (ör. doğalgaz hattı) sistemde yoksa, o kategori tamamen atlanmalı, hiçbir zaman tahmini/uydurma veriyle doldurulmamalı.
- **FR-012**: Sistem, kıyıya yakınlık ve deprem büyüklüğü eşiğine dayanan kaba bir coğrafi sezgiyle "tsunami riski potansiyeli" bulgusu üretebilmeli; bu bulgu açıkça "gerçek dalga simülasyonu değildir" notunu taşımalı ve gerekli kıyı-mesafe verisi mevcut değilse üretilmemeli.
- **FR-013**: Sistem, kıyı/batimetri (en azından kıyı-mesafe) verisini yeni bir veri katmanı olarak sisteme kazandırmalı; bu veri, mevcut afet/exposure katmanlarıyla aynı coğrafi/h3 tabanlı sorgulama mekanizmasına entegre olmalı.
- **FR-014**: Rapordaki her bulgu, kaynağını (hangi katman/kural kombinasyonu bu bulguyu ürettiğini) izlenebilir şekilde belirtmeli — operatör "bu risk neden çıktı" sorusunu cevaplayabilmeli.

### Key Entities *(include if feature involves data)*

- **İkincil Risk Bulgusu (SecondaryRiskFinding)**: Bir afet + bir veya daha fazla ortam katmanı kombinasyonundan üretilen tek bir potansiyel risk kaydı — risk türü, dayandığı katman(lar), kısa açıklama, "sezgisel" etiketi.
- **Öngörü Raporu (ForecastReport)**: Bir afet için üretilen tek sayfalık rapor — etkilenen şehir/kasaba listesi, etkilenen bina/tesis listesi, İkincil Risk Bulgusu listesi, önerilen kurum türleri listesi, oluşturulma zamanı.
- **Kurum Türü (InstitutionCategory)**: Bir risk bulgusuyla ilişkilendirilebilecek genel müdahale kategorisi (itfaiye, sağlık, afet yönetimi, su/altyapı vb.) — gerçek bir kurum kaydı değil, sabit bir kategori listesi.
- **Kıyı Yakınlık Verisi (CoastalProximityLayer)**: Yeni eklenecek, her nokta/hex için en yakın kıyı hattına olan kaba mesafeyi tutan veri katmanı — gerçek batimetri/derinlik verisi değil, tsunami sezgisi için yeterli bir yakınlık ölçüsü.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bir afet seçildiğinde, ikincil risk bulguları 5 saniye içinde görüntülenir.
- **SC-002**: Önem eşiğini aşan bir afet oluştuğunda, tetikleyici 10 saniye içinde ana panelde görünür hale gelir.
- **SC-003**: Kullanıcı testlerinde, operatörlerin en az %90'ı öngörü raporunun "doğrulanmamış/sezgisel" bir tahmin olduğunu, kesin bir gerçek olmadığını doğru şekilde anlıyor (rapor tasarımının yanıltıcı olmadığının kanıtı).
- **SC-004**: Sistem, hiçbir test/kullanım senaryosunda dış bir sisteme (e-posta, mesajlaşma, webhook) otomatik istek göndermez — bu, denetim/log incelemesiyle %100 doğrulanabilir olmalı.
- **SC-005**: Rapordaki her bulgu için, kullanıcı "bu neden gösterildi" bilgisine ek bir tıklama olmadan, raporun kendi içinde ulaşabilir.

## Assumptions

- "Önem eşiği" (kritik durum tetikleyicisi), her afet tipi için mevcut şiddet/büyüklük alanlarına dayanan makul bir varsayılan eşik olarak tanımlanır (ör. deprem için magnitude ≥ 6.0, diğer tipler için "critical" şiddet seviyesi); tam eşik değerleri planlama aşamasında belirlenecektir.
- Doğalgaz hattı, gerçek dalga/tsunami simülasyonu gibi veri/model kaynakları bu özellik kapsamına dahil DEĞİLDİR — sadece gerçekten mevcut veya bu özellik kapsamında eklenen (kıyı-mesafe) katmanlar kullanılır.
- Kıyı-mesafe verisi, tam bir batimetri (derinlik) veri seti değil, her nokta için "en yakın kıyı hattına kaba mesafe" bilgisi olarak yeterli kabul edilir — gerçek dalga yayılım modeli bu özelliğin kapsamı dışındadır.
- Bu özelliğin ürettiği hiçbir bulgu/rapor, gerçek bir afet müdahale kararı için tek başına yeterli/yetkilendirilmiş kabul edilmez; sistem bunu her raporda açıkça belirtir.
- Mevcut kritik altyapı (sağlık/eğitim/acil durum) ve yol ağı (OSM) katmanları, bu özelliğin erişim/kapasite risk değerlendirmesi için yeterli veri kalitesindedir; ek bir veri kaynağı gerektirmez.
- Kurum türü önerileri, afet tipine göre sabit, koddaki tek bir yerde yaşayan bir eşleştirme tablosundan üretilir (ör. deprem→itfaiye+sağlık+afet yönetimi, sel→afet yönetimi+sağlık); gerçek kurum iletişim bilgisi/entegrasyonu hiçbir zaman içermez.
