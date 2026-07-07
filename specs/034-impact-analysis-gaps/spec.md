# Feature Specification: Impact Analysis Gaps (Kritik Altyapı, Onay Anı Arşivleme, Sektörel Agregasyon, Veri Tamlığı)

**Feature Branch**: `034-impact-analysis-gaps`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Impact Analysis modülünde (M5) PRD'de açıkça yer alan ama daha önce hiç yapılmamış 4 HIGH öncelikli, buildable gereksinim: (1) MHEWS-FR-0078/FR-0171 — kritik altyapı kategorisi/etiketi ve öne çıkarma yok. (2) MHEWS-FR-0020 — CAP onayında impact snapshot arşivlenmiyor. (3) MHEWS-FR-0337/FR-0345 — sektörel/idari sınır seviyesi agregasyonu yok. (4) MHEWS-FR-0260 — veri tamlığı/güven metriği yok."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Kritik altyapıyı öne çıkarma (Priority: P1) 🎯 MVP

Bir afet yöneticisi, bir bölgedeki exposure verisini incelerken, hastane, okul, itfaiye gibi kritik altyapı varlıklarını genel varlık listesinden ayırt edip öncelikli olarak görmek ister; bu varlıklar tahliye/müdahale kararlarını doğrudan etkiler.

**Why this priority**: Kritik altyapının etkilenip etkilenmediğini bilmek, müdahale önceliklendirmesinin temelidir; bu bilgi olmadan yönetici tüm ham varlık listesini elle taramak zorunda kalır.

**Independent Test**: Bir exposure dataset'ine kritik altyapı kategorisine sahip varlıklar yüklenir; Impact panelinde bu varlıkların ayrı bir liste/filtre olarak göründüğü, diğer varlıklardan görsel olarak ayrıştığı doğrulanır.

**Acceptance Scenarios**:

1. **Given** bir exposure dataset'i hastane, okul ve konut varlıkları içeriyor, **When** yönetici Impact panelini açar, **Then** kritik altyapı varlıkları (hastane, okul, itfaiye/emniyet, sağlık tesisi) ayrı bir "Kritik Altyapı" listesinde/filtresinde gösterilir.
2. **Given** bir exposure dataset'inde hiç kritik altyapı etiketli varlık yok, **When** yönetici Impact panelini açar, **Then** "kritik altyapı verisi yok" mesajı gösterilir, hata oluşmaz.
3. **Given** bir exposure dataset yüklenirken varlık kategorisi belirtilmemiş, **When** dataset kaydedilir, **Then** varlık varsayılan olarak kritik-olmayan bir kategoriye düşer (geriye dönük uyumluluk, mevcut veriler bozulmaz).

---

### User Story 2 - CAP onayında impact snapshot arşivleme (Priority: P1) 🎯 MVP

Bir onaylayıcı (Approver) bir CAP uyarısını onayladığında, o anki impact analizi sonucunun (etkilenen nüfus/varlık özeti) kalıcı, değişmez bir kayıt olarak saklanmasını ister; böylece daha sonra "o alarm yayınlandığında tahmini etki neydi" sorusuna denetlenebilir şekilde cevap verilebilir.

**Why this priority**: Onay anındaki etki tahmini arşivlenmezse, sonradan `impact_scenarios` güncellenip üzerine yazıldığında geçmişteki karar gerekçesi kanıtlanamaz hale gelir — bu hem denetim hem hesap verebilirlik açısından kritiktir.

**Independent Test**: Bir impact senaryosu hesaplanmış bir bölge için CAP taslağı onaylanır; onay sonrası ilgili bölgenin o anki impact sonucunun donmuş bir kopyasının oluştuğu, sonradan `impact_scenarios` değişse bile bu kopyanın değişmediği doğrulanır.

**Acceptance Scenarios**:

1. **Given** bir CAP taslağının bölgesi için güncel bir impact senaryosu sonucu mevcut, **When** taslak onaylanır, **Then** o anki impact sonucunun bir anlık görüntüsü (impact snapshot) CAP taslağıyla ilişkilendirilerek kalıcı olarak saklanır.
2. **Given** bir CAP taslağının bölgesi için hiç impact senaryosu hesaplanmamış, **When** taslak onaylanır, **Then** onay süreci hatasız tamamlanır, sadece "impact verisi mevcut değil" durumu snapshot'ta işaretlenir.
3. **Given** bir CAP taslağı onaylandıktan sonra impact senaryosu tekrar hesaplanıp güncellenir, **When** yönetici o CAP'in geçmiş kaydını görüntüler, **Then** onay anındaki orijinal snapshot değişmeden gösterilir (güncel impact sonucuyla karıştırılmaz).

---

### User Story 3 - Sektörel / idari sınır seviyesi agregasyon (Priority: P2)

Bir planlamacı, bir bölgenin toplam etkilenen varlık/nüfus sayısını değil, sektöre (sağlık, eğitim, konut vb.) veya idari sınır seviyesine (il/ilçe/mahalle) göre kırılmış halini görmek ister; böylece hangi sektörün veya alt bölgenin en çok etkilendiğini anlayabilir.

**Why this priority**: Tek bir toplam rakam, kaynakların nereye yönlendirileceği konusunda yetersiz bilgi verir; P1'lerden sonra en çok operasyonel değeri bu kırılım sağlar.

**Independent Test**: Farklı sektör etiketlerine sahip exposure varlıkları olan bir bölge için impact hesaplanır; sonucun sektöre göre gruplanmış alt toplamlar içerdiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** bir bölgedeki exposure varlıkları sağlık, eğitim ve konut sektörlerine etiketlenmiş, **When** impact hesaplanır, **Then** sonuç her sektör için ayrı bir alt toplam içerir (toplamların genel toplamla tutarlı olduğu doğrulanabilir).
2. **Given** bir varlığın sektör bilgisi girilmemiş, **When** impact hesaplanır, **Then** bu varlık "sınıflandırılmamış" (unclassified) bir sektör grubuna dahil edilir, hesaplama hata vermez.
3. **Given** bir bölge birden fazla idari alt sınır (ör. ilçe) içeriyor, **When** yönetici idari sınır seviyesine göre görünümü seçer, **Then** sonuç seçilen sınır seviyesine göre gruplanmış alt toplamlar gösterir.

---

### User Story 4 - Veri tamlığı / güven metriği (Priority: P3)

Bir yönetici, bir impact hesaplama sonucunu incelerken, bu sonucun ne kadar güvenilir olduğunu (kullanılan exposure verisinin ne kadarının dolu/güncel olduğunu) bilmek ister; böylece eksik veriye dayanan bir tahmine aşırı güvenmez.

**Why this priority**: Diğer üç story'e göre daha az kritik ama karar kalitesini artıran tamamlayıcı bir şeffaflık katmanı; P1/P2 olmadan da tek başına anlamlıdır.

**Independent Test**: Metrik alanının bir kısmı boş olan bir exposure dataset'i için impact hesaplanır; sonuçta gösterilen veri tamlığı skorunun beklenen yüzdeyle eşleştiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** bir exposure dataset'indeki varlıkların %80'inin ilgili metrik alanı dolu, **When** impact hesaplanır, **Then** sonuçla birlikte ~%80 veri tamlığı skoru gösterilir.
2. **Given** bir exposure dataset'inin tüm varlıklarının metrik alanı dolu, **When** impact hesaplanır, **Then** veri tamlığı skoru %100 olarak gösterilir.
3. **Given** bir exposure dataset'inde hiç varlık yok, **When** impact hesaplanır, **Then** veri tamlığı skoru "veri yok" olarak gösterilir (0 veya yanıltıcı %100 olarak gösterilmez).

---

### Edge Cases

- Bir CAP taslağı, impact analizi hiç çalıştırılmamış yeni bir bölge için onaylanırsa, onay süreci bloklanmamalı; snapshot "veri yok" olarak işaretlenmeli.
- Bir varlığın hem kritik altyapı hem belirli bir sektöre ait olması durumunda (ör. bir hastane hem "kritik altyapı" hem "sağlık sektörü" etiketine sahip olabilir), her iki gruplamada da doğru şekilde görünmelidir.
- Çok büyük sayıda exposure varlığı olan bir bölgede sektörel agregasyon hesaplaması makul sürede tamamlanmalıdır (mevcut `compute_zonal_stats` performans karakteristiğiyle aynı sınıfta).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, exposure varlıklarının bir "kritik altyapı" olup olmadığını (ve hangi alt kategoriye ait olduğunu, ör. sağlık/eğitim/acil durum hizmeti) etiketleyebilmelidir.
- **FR-002**: Sistem, Impact panelinde kritik altyapı varlıklarını genel varlık listesinden ayrı, öne çıkan bir görünümde (liste/filtre) sunmalıdır.
- **FR-003**: Kritik altyapı kategorisi belirtilmeyen varlıklar hata vermeden varsayılan (kritik olmayan) kategoriye düşmelidir.
- **FR-004**: Bir CAP taslağı onaylandığında, sistem o anki impact hesaplama sonucunun kalıcı, değiştirilemez bir anlık görüntüsünü (snapshot) otomatik olarak oluşturup CAP taslağıyla ilişkilendirmelidir.
- **FR-005**: Bir CAP taslağının bölgesi için impact verisi mevcut değilse, onay süreci engellenmemeli; snapshot bu durumu açıkça yansıtmalıdır.
- **FR-006**: Bir impact snapshot'ı oluşturulduktan sonra, kaynak impact senaryosu güncellense/silinse dahi snapshot içeriği değişmeden kalmalıdır.
- **FR-007**: Sistem, impact sonuçlarını sektöre göre gruplanmış alt toplamlar olarak hesaplayıp gösterebilmelidir.
- **FR-008**: Sistem, impact sonuçlarını yapılandırılabilir bir idari sınır seviyesine göre gruplanmış alt toplamlar olarak hesaplayıp gösterebilmelidir.
- **FR-009**: Sektör veya idari sınır bilgisi eksik olan varlıklar "sınıflandırılmamış" bir grupta toplanmalı, hesaplamayı hatalı hale getirmemelidir.
- **FR-010**: Sistem, her impact hesaplama sonucuyla birlikte, kullanılan exposure verisinin tamlığını yansıtan bir veri tamlığı skoru (yüzde) sunmalıdır.
- **FR-011**: Exposure verisi olmayan bir bölge için veri tamlığı skoru yanıltıcı bir değer (ör. %100 veya %0) yerine açıkça "veri yok" olarak gösterilmelidir.

### Key Entities *(include if feature involves data)*

- **Exposure Varlığı (genişletilmiş)**: Mevcut exposure varlığına eklenen kritik altyapı kategorisi, sektör etiketi ve (varsa) idari sınır seviyesi bilgisini taşır.
- **Impact Snapshot**: Bir CAP taslağının onaylandığı andaki impact hesaplama sonucunun donmuş kopyası; taslakla ilişkilidir, sonradan değişmez.
- **Sektörel/Bölgesel Agregasyon Sonucu**: Bir impact hesaplamasının sektöre veya idari sınır seviyesine göre gruplanmış alt toplamlarını temsil eder.
- **Veri Tamlığı Skoru**: Bir impact hesaplama sonucuna eşlik eden, kullanılan exposure verisinin ne kadarının dolu/kullanılabilir olduğunu gösteren yüzde değeri.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bir yönetici, bir bölgedeki kritik altyapı varlıklarını, genel varlık listesini elle taramadan, panel açıldıktan sonra 5 saniye içinde ayırt edebilir.
- **SC-002**: Onaylanan her CAP taslağının %100'ü için, onay anındaki impact sonucunun bir snapshot'ı geriye dönük olarak sorgulanabilir durumdadır.
- **SC-003**: Bir planlamacı, bir bölgenin sektörel veya idari sınır bazlı etki kırılımını, ayrı bir rapor talep etmeden aynı panelde görüntüleyebilir.
- **SC-004**: Eksik veriye dayanan impact sonuçlarının %100'ünde, kullanıcıya veri tamlığı skoru üzerinden bir güvenilirlik sinyali sunulur (sessizce tam güvenilir gibi gösterilmez).

## Assumptions

- Kritik altyapı kategorileri sabit, önceden tanımlı bir liste olarak ele alınır (ör. sağlık tesisi, eğitim kurumu, acil durum hizmeti, enerji/su altyapısı); yeni kategori eklemek şema/config değişikliğiyle mümkündür (constitution'daki hazard-agnostic model-driven ilkeye paralel).
- Sektör ve idari sınır seviyesi bilgisi, exposure veri yükleme sırasında dataset'in kendi meta verisinden (mevcut `properties` JSONB alanı) türetilir; ayrı bir harici sınır veri kaynağı entegrasyonu bu spec'in kapsamı dışındadır.
- Veri tamlığı skoru, ilgili metrik alanının dolu olduğu varlık oranı gibi basit, açıklanabilir bir hesaplamaya dayanır; istatistiksel güven aralığı/olasılıksal belirsizlik modellemesi (Post-PoC "Risk & Scenario Modeling" kapsamına bırakılmıştır) bu spec'e dahil değildir.
- Impact snapshot, CAP onay akışının zaten var olan mevcut trigger/servis noktasına eklenen additive bir adımdır; onay akışının kendi state machine'i (spec 009) değişmez.
- Vulnerability index, probabilistic simulation, forecast-AI, varlık bağımlılık grafiği/kademeli etki analizi ve otomatik alarm tetikleme kapsam dışıdır (Risk & Scenario Modeling / Forecasting modüllerine bırakılmıştır).
