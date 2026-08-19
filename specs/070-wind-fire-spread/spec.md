# Feature Specification: Rüzgar Yönüne Dayalı Yayılım Tahmini

**Feature Branch**: `070-wind-fire-spread`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "Rüzgar yönü verisine dayalı yangın (ve diğer hava koşullarından etkilenen afet tiplerinin) yayılım tahmin motoru: Şu an sistemde rüzgar sadece hız (skaler ısı haritası) olarak var, yön verisi hiç çekilmiyor/kullanılmıyor. Bu özellik (1) rüzgar yönü verisini kaynaktan (GFS u/v bileşenleri) çekip pipeline'a ekleyecek, (2) bunu afet olaylarıyla aynı h3_id sistemine bağlayacak (yeni bir forecast_hex_values benzeri tablo/mekanizma ile), (3) aktif bir yangın (veya rüzgara duyarlı başka bir afet) için, bulunduğu hex'ten başlayıp rüzgar yönündeki komşu hex'leri "olası etki alanı" olarak işaretleyen basit bir yayılım mantığı kuracak, (4) bunu haritada bir yön oku/koni veya renklendirilmiş hex grubu olarak gösterecek ve mevcut etki analizi/alarm akışına bağlanabilir hale getirecek. Kullanıcı bunun radar panelindeki (Rüzgar & Akıntı) ve öngörü panelindeki mevcut rüzgar hız görselleştirmesinin doğal bir devamı olmasını istiyor. Takip eden mesajda kapsam genişletildi: yangınla sınırlı kalmasın — tsunami, kasırga, toz fırtınası gibi diğer afet tiplerinin de rüzgar yönünden etkilenip etkilenmediği değerlendirilip, gerçekten uygun olanlar aynı mekanizmaya dahil edilsin."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rüzgar yönünü görebilmek (Priority: P1)

Bir operatör, aktif bir afetin bulunduğu bölgede rüzgarın hangi yönden hangi yöne estiğini haritada görebilmeli — şu anda sadece rüzgar hızı (renk yoğunluğu) gösteriliyor, yön hiç yok.

**Why this priority**: Yön verisi olmadan hiçbir yayılım tahmini mümkün değil — bu, özelliğin geri kalanının üzerine kurulduğu temel veri katmanı.

**Independent Test**: Rüzgar & Akıntı panelinde veya Öngörü panelinde "Wind" katmanı açıldığında, mevcut hız ısı haritasının üzerinde/yanında bir yön göstergesi (ok, vektör vb.) görülebiliyor mu diye test edilerek, başka hiçbir bileşen olmadan tek başına doğrulanabilir.

**Acceptance Scenarios**:

1. **Given** seçili bir bölgede güncel rüzgar verisi mevcut, **When** kullanıcı Rüzgar & Akıntı panelinde Wind katmanını açar, **Then** rüzgarın estiği yön haritada görsel olarak (ör. ok/vektör) belirtilir.
2. **Given** seçili bölgede rüzgar yönü verisi hiç ingest edilmemiş, **When** kullanıcı Wind katmanını açar, **Then** sistem yön bilgisini olduğundan varmış gibi göstermez — sadece mevcut hız verisi görünür, yön göstergesi sessizce atlanır.

---

### User Story 2 - Rüzgardan etkilenen bir afetin olası yayılım yönünü görmek (Priority: P2)

Bir operatör, haritada rüzgardan gerçekten etkilenen bir afet tipini (bkz. Assumptions'taki liste — örn. yangın, toz fırtınası) seçtiğinde, o afetin bulunduğu hex'teki güncel rüzgar yönüne göre hangi komşu hex'lerin olası etki alanı içinde olduğunu görebilmeli — böylece "batıya doğru yayılabilir" gibi bir öngörüyle önceden hazırlık yapabilsin.

**Why this priority**: Bu, User Story 1'in (rüzgar yönü verisi) üzerine kurulan asıl değer — ham yön verisini kullanıcı için anlamlı bir "buraya dikkat" işaretine çevirir.

**Independent Test**: Rüzgar yönü verisi mevcut, rüzgardan etkilenen bir afet olayı seçildiğinde, haritada o afetin konumundan başlayıp rüzgar yönünde uzanan bir "olası etki alanı" gösterimi (renklendirilmiş hex grubu veya yön oku/koni) beliriyor mu diye, User Story 1'in ürettiği yön verisi üzerine bağımsız olarak test edilebilir.

**Acceptance Scenarios**:

1. **Given** rüzgardan etkilenen aktif bir afet olayı ve o bölgede güncel rüzgar yönü verisi mevcut, **When** kullanıcı bu afeti haritada seçer, **Then** rüzgarın estiği yöndeki komşu hex'ler "olası etki alanı" olarak görsel şekilde işaretlenir.
2. **Given** rüzgar hızı ihmal edilebilecek kadar düşük (durgun hava), **When** kullanıcı rüzgardan etkilenen bir afeti seçer, **Then** sistem yanıltıcı bir yön göstermek yerine "belirgin bir yayılım yönü yok" durumunu iletir.
3. **Given** aynı bölgede birden fazla, rüzgardan etkilenen aktif afet, **When** kullanıcı haritayı görüntüler, **Then** her birinin kendi olası etki alanı birbirinden bağımsız olarak gösterilir.
4. **Given** rüzgardan etkilenmeyen bir afet tipi (ör. tsunami, deprem — bkz. Assumptions), **When** kullanıcı bu afeti seçer, **Then** sistem hiçbir rüzgar-yönü tabanlı yayılım tahmini göstermez (bu afet tipleri için özellik hiç devreye girmez).

---

### User Story 3 - Olası etki alanını mevcut etki analizi/alarm akışına bağlamak (Priority: P3)

Bir operatör, gösterilen "olası etki alanı"nı, halihazırda var olan Etki Analizi paneline (nüfus, kritik altyapı vb.) veya alarm gönderme akışına doğrudan aktarabilmeli — ayrıca elle bölge çizmek zorunda kalmadan.

**Why this priority**: Tahmin, aksiyona dönüşmedikçe (alarm/etki analizi) sadece görsel bir bilgi olarak kalır — bu son adım, özelliği operasyonel olarak faydalı hale getirir.

**Independent Test**: User Story 2'de üretilen "olası etki alanı" seçildiğinde, mevcut Etki Analizi panelinin bu alanı bir bölge olarak kabul edip nüfus/kritik altyapı hesaplaması yapabildiği, önceki iki hikayeden bağımsız olarak (var olan Etki Analizi akışı zaten çalışır durumdaysa) doğrulanabilir.

**Acceptance Scenarios**:

1. **Given** bir afet için gösterilen olası etki alanı, **When** kullanıcı bu alanı seçip "Etki Analizi" ile incele der, **Then** mevcut Etki Analizi paneli bu alanı bir bölge olarak kullanarak hesaplama yapar.

---

### Edge Cases

- Seçili bölgede rüzgar yönü verisi hiç yoksa (kaynaktan hiç çekilmemiş veya ingest başarısız olmuşsa) ne olur? → Sistem hiçbir yayılım tahmini/yön göstergesi üretmez, veri eksikliğini olduğu gibi belirtir (asla uydurma yön göstermez).
- Rüzgar yönü verisi eski (bayat) ise ne olur? → Mevcut "as of" (güncelleme zamanı) gösterim deseni burada da uygulanır; tahmin, en son mevcut veriye göre üretilir ama bayatlığı kullanıcıya bildirilir.
- Rüzgardan etkilenmeyen bir afet tipi (ör. deprem, tsunami) için bu özellik ne yapar? → Bu afet tipleri için yayılım tahmini hiç gösterilmez; özellik yalnızca gerçekten rüzgardan etkilenen afet tiplerine uygulanır (bkz. Assumptions'taki liste ve gerekçeler).
- Aynı bölgede birden fazla, rüzgardan etkilenen aktif afet varsa ne olur? → Her biri kendi bağımsız olası etki alanını üretir, çakışan alanlar üst üste gösterilebilir.
- Rüzgar yönü kısa sürede önemli ölçüde değişirse (ör. saatlik) ne olur? → Gösterilen olası etki alanı, en güncel veriye göre otomatik olarak güncellenir; eski tahmin kalıcı bir kayıt olarak saklanmaz.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, mevcut rüzgar veri kaynağından (şu an sadece hız/skaler değer için kullanılan kaynak) rüzgar **yönü** bilgisini de çekip saklamalıdır.
- **FR-002**: Sistem, rüzgar hızı ve yönünü, afet olaylarının konumlandırılmasında kullanılan aynı hexagonal hücre (h3) sistemiyle ilişkilendirmelidir — böylece bir hex'in hem afet hem hava durumu bilgisi aynı anahtarla sorgulanabilir.
- **FR-003**: Sistem, yalnızca gerçekten rüzgardan etkilenen afet tipleri (bkz. Assumptions'taki liste) için, olayın bulunduğu hex'ten başlayarak güncel rüzgar yönündeki komşu hex'leri "olası etki alanı" olarak belirleyebilmelidir.
- **FR-004**: Sistem, belirlenen olası etki alanını haritada görsel olarak (yön oku/koni veya renklendirilmiş hex grubu) göstermelidir.
- **FR-005**: Sistem, ilgili hex için rüzgar yönü verisi mevcut değilse veya rüzgar hızı anlamlı bir yön çıkarımı için yetersizse (durgun hava), olası etki alanını GÖSTERMEMELİDİR — asla veriye dayanmayan bir yön uydurmamalıdır.
- **FR-006**: Sistem, gösterilen olası etki alanının hangi rüzgar verisine (ve o verinin ne zaman güncellendiğine) dayandığını kullanıcıya açık şekilde belirtmelidir.
- **FR-007**: Kullanıcılar, gösterilen olası etki alanını mevcut Etki Analizi akışına (nüfus, kritik altyapı hesaplaması) bir bölge olarak aktarabilmelidir.
- **FR-008**: Sistem, aynı bölgede birden fazla, rüzgardan etkilenen aktif afet varsa, her biri için bağımsız bir olası etki alanı üretmelidir.
- **FR-009**: Sistem, rüzgardan etkilenmeyen afet tiplerinde (bkz. Assumptions — ör. deprem, tsunami) bu mekanizmayı hiç devreye sokmamalıdır; bu, yanlış/yanıltıcı bir bilimsel çıkarımın önüne geçmek için kasıtlı bir sınırdır.

### Key Entities *(include if feature involves data)*

- **Hex Rüzgar Koşulu**: Bir hex hücresinin belirli bir zamandaki rüzgar hızı ve yönü — hangi hex, hangi hız, hangi yön, ne zamana ait (as-of).
- **Olası Etki Alanı (Yayılım Tahmini)**: Belirli bir afet olayına bağlı; kaynak olay, kaynak afet tipi, kaynak hex, kullanılan rüzgar koşulu ve etkilenmesi öngörülen komşu hex'lerin listesinden oluşur.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Rüzgar yönü verisi mevcut olan bir bölgede, rüzgardan etkilenen bir afet seçildiğinde, kullanıcı olası etki alanını 3 saniye içinde haritada görebilir.
- **SC-002**: Gösterilen olası etki alanı, kullanılan rüzgar verisinin güncelleme zamanından daha eski bir bilgiye dayanmaz — veri tazeliği her zaman izlenebilir durumdadır.
- **SC-003**: Kullanıcılar, olası etki alanını elle bölge çizmeye gerek kalmadan, tek bir etkileşimle mevcut Etki Analizi akışına aktarabilir.
- **SC-004**: Rüzgar yönü verisi eksik olduğunda, kullanıcıların %100'ü sistemin bir tahmin göstermediğini (uydurma bir yön göstermediğini) anlayabilir — belirsiz/sessiz bir boşluk yerine açık bir durum mesajı görülür.
- **SC-005**: Rüzgardan etkilenmeyen bir afet tipi (ör. tsunami, deprem) seçildiğinde, kullanıcıların %100'ü bu özelliğin o afet için hiç uygulanmadığını fark eder — yanlış bir bilimsel çıkarım (ör. "tsunami rüzgarla yayılıyor" izlenimi) asla verilmez.

## Assumptions

- Rüzgar yönü verisi, mevcut rüzgar hızı verisini sağlayan aynı kaynaktan (GFS tabanlı model, u/v rüzgar bileşenleri) türetilebilir — yeni bir harici veri kaynağı entegrasyonu gerekmez.
- **Kapsam değerlendirmesi — hangi afet tipleri rüzgardan gerçekten etkilenir?** (kullanıcının açıkça sorduğu "tsunami, kasırga, toz fırtınası" değerlendirmesi):
  - **Dahil (v1 kapsamında)**:
    - **Yangın**: Duman/alev yayılımı doğrudan rüzgar yönüyle ilerler — en net örnek, orijinal senaryo.
    - **Toz fırtınası**: Toz bulutu doğrudan rüzgarla taşınır — yangınla aynı derecede uygun.
    - **Yanardağ (kül bulutu)**: Volkanik kül bulutunun dağılımı büyük ölçüde rüzgar yönüyle belirlenir — dahil edildi.
    - **Kasırga**: Fırtınanın kendi hareket yönü, çevresindeki "yönlendirici" rüzgar akıntılarıyla ilişkilidir; gerçek meteorolojik iz tahmini bu basit sezgiselden çok daha karmaşıktır, ama yerel rüzgar yönünü kaba bir hareket-yönü göstergesi olarak kullanmak makul bir v1 yaklaşımıdır — dahil, ama "kesin iz tahmini değil, kaba yön göstergesi" olarak açıkça etiketlenecek.
  - **Hariç (bu özellik bilinçli olarak uygulanmaz)**:
    - **Tsunami**: Yayılımı okyanus tabanı yer değiştirmesi ve dalga fiziğiyle belirlenir, rüzgarla hiçbir ilgisi yoktur — rüzgar yönü göstermek bilimsel olarak yanlış/yanıltıcı olur, bu yüzden kasıtlı olarak dışarıda bırakıldı.
    - **Deprem**: Rüzgardan etkilenen bir yayılım kavramı yok.
    - **Sel**: Yayılımı büyük ölçüde arazi/su akışıyla belirlenir, rüzgar ikincil bir etken — basit rüzgar-yönü sezgiseli için uygun değil, bu sürümün kapsamı dışında.
    - **Kuraklık, gıda güvenliği, salgın**: Nokta-kaynaklı/yönlü bir "yayılım" kavramı yok, bölgesel/kalıcı durumlar — kapsam dışı.
    - **Sıcak/soğuk hava dalgası**: Yayılımı yerel rüzgar yönünden çok geniş ölçekli hava kütlesi hareketiyle belirlenir — basit komşu-hex sezgiseli için uygun değil, kapsam dışı.
  - Bu liste `hazard_types` tablosuna (veya eşdeğer taksonomiye) eklenecek bir "rüzgardan etkilenir mi" bayrağıyla ileride genişletilebilir/düzenlenebilir olmalı — kod içine sabit kodlanmış bir liste olarak kalsa bile, tek bir yerden yönetilmeli.
- Yayılım mantığı, gerçek bir fizik simülasyonu (yakıt yükü, nem, eğim, meteorolojik iz modelleri vb. içeren detaylı modeller) değil, basitleştirilmiş bir yön/komşuluk sezgiselidir (rüzgar yönündeki birkaç komşu hex halkasını işaretlemek) — daha gelişmiş bir model, sonraki bir sürümün kapsamı olabilir.
- Olası etki alanının kaç "hex halkası" genişliğinde olacağı, ilk sürümde sabit ve küçük bir değer olarak belirlenir (ayarlanabilirlik sonraki bir iyileştirme olabilir).
- Hex çözünürlüğü, afet olaylarının zaten kullandığı mevcut h3 çözünürlüğüyle aynıdır — yeni bir çözünürlük şeması gerekmez.
- Olası etki alanı, kullanıcının haritada bir afeti seçmesiyle (talep üzerine) hesaplanır/gösterilir; otomatik/proaktif bildirim bu sürümün kapsamı dışındadır.
