# Feature Specification: Tatbikat Raporlama ve Geri Bildirim Döngüsü

**Feature Branch**: `032-drill-reporting-feedback`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Preparedness, Drill & Response modülünde PRD'de açıkça yer alan ama daha önce hiç yapılmamış 3 gereksinim: tatbikat özetinin dışa aktarılabilmesi (MHEWS-SD-DRILL-02), yıllık toplu tatbikat performans raporu (MHEWS-FR-0033), ve tatbikat sonrası ders çıkarımı/eşik-kalibrasyon geri bildirim döngüsü (PRD'nin 'After-Action Feedback Loop' maddesi)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bir yönetici, tek bir tatbikatın özetini dışa aktarabilir (Priority: P1) 🎯 MVP

Bir tatbikat tamamlandığında, o tatbikatı yöneten bir yönetici (Super Admin/Country Admin/Org Admin), tatbikatın özetini (süre, yayınlanan uyarı sayısı, tepki süresi, onay oranı) bir dosya olarak indirebilir — üst makamlara veya harici bir denetçiye sunmak için.

**Why this priority**: PRD'nin açık bir gereksinimi (MHEWS-SD-DRILL-02) ve en düşük riskli/en yüksek kullanıcı etkili kalem — mevcut audit/access-review export desenlerinin (spec 007/028) doğrudan bir tekrarı. Tek başına değer sağlar.

**Independent Test**: Tamamlanmış bir tatbikat için "Özeti Dışa Aktar" aksiyonu tetiklenir; indirilen dosyanın süre/uyarı sayısı/tepki süresi/onay oranı bilgilerini içerdiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** tamamlanmış (`status='completed'`) bir tatbikat, **When** bir yönetici "Özeti Dışa Aktar" aksiyonunu tetikler, **Then** sistem tatbikatın tüm özet bilgilerini (süre, yayınlanan uyarı sayısı, tepki süresi, onay oranı) bir dosya olarak sunar.
2. **Given** henüz devam eden (`status='active'`) bir tatbikat, **When** dışa aktarma aksiyonu denenirse, **Then** sistem bunu reddeder veya sadece o ana kadarki kısmi veriyi açıkça "devam ediyor" notuyla gösterir (mevcut davranışla tutarlı, tatbikat bitmeden nihai özet yoktur).
3. **Given** tepki süresi veya onay oranı verisi mevcut değilse ("veri yok"), **When** dışa aktarma yapılır, **Then** bu alanlar dosyada da "veri yok" olarak görünür, sessizce sıfır veya boş gösterilmez (mevcut `computeResponseTimeSeconds`/`computeAckRate` davranışıyla tutarlı).

---

### User Story 2 - Bir yönetici, belirli bir yıl için tüm tatbikatların toplu performans raporunu görebilir (Priority: P2)

Bir yıl boyunca yapılan tüm tatbikatlar tamamlandığında, sistem bunları otomatik olarak yıllık bir performans raporunda toplar (toplam tatbikat sayısı, ortalama tepki süresi, ortalama onay oranı, senaryo tipine göre dağılım) — böylece bir yönetici tek tek tatbikatlara bakmadan genel eğilimi görebilir.

**Why this priority**: PRD'nin açık bir gereksinimi (MHEWS-FR-0033), Incident Tracking modülünün (spec 026) `incident_reports` deseninin doğrudan bir tekrarı — mimari risk taşımaz ama US1'den sonra gelir çünkü onun toplulaştırılmış hali.

**Independent Test**: Bir yılın tamamlanmış tatbikatları için yıllık rapor üretimi tetiklenir (otomatik zamanlanmış görev); raporun toplam tatbikat sayısı, ortalama metrikler ve senaryo dağılımını içerdiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** bir takvim yılı içinde tamamlanmış birden fazla tatbikat, **When** yıllık rapor üretimi çalışır (yılın başında, otomatik), **Then** sistem o yıla ait toplam tatbikat sayısını, ortalama tepki süresini, ortalama onay oranını ve senaryo tipine göre dağılımı içeren tek bir rapor kaydı oluşturur.
2. **Given** aynı yıl için rapor zaten üretilmişse, **When** üretim tekrar tetiklenirse, **Then** sistem aynı yıl için ikinci bir rapor oluşturmaz (mevcut haftalık/yıllık rapor desenleriyle tutarlı, tekilleştirme garantisi).
3. **Given** bir yıl içinde hiç tamamlanmış tatbikat yoksa, **When** rapor üretimi çalışır, **Then** sistem sıfır tatbikatlı, boş bir rapor üretir veya üretimi atlar (hata vermez).
4. **Given** yıllık rapor üretildikten sonra, **When** bir yönetici bu raporu görüntüler, **Then** raporu dışa aktarabilir (US1'in export mekanizmasıyla aynı desen).

---

### User Story 3 - Bir yönetici, tatbikat sonrası ders çıkarımını kaydedip isteğe bağlı bir eşik değişikliği önerisine bağlayabilir (Priority: P3)

Bir tatbikat tamamlandığında, bir yönetici serbest metin olarak "bu tatbikattan çıkardığımız dersler" notunu kaydedebilir — isteğe bağlı olarak, bu notu belirli bir afet tipinin şiddet eşiğini gözden geçirme önerisiyle ilişkilendirebilir (mevcut Hazard Taxonomy eşik düzenleyicisine bir bağlantı ile).

**Why this priority**: PRD'nin "After-Action Feedback Loop" maddesi, ama diğer ikisinden daha az somut/daha düşük öncelikli (asıl eşik değişikliğinin kendisi zaten mevcut Hazard Taxonomy admin panelinden yapılıyor, bu sadece bir not + bağlantı katmanıdır). P3.

**Independent Test**: Tamamlanmış bir tatbikata bir ders-çıkarımı notu eklenir; not tatbikat özetinde görünür; nota bir afet tipi ilişkilendirilirse, ilgili eşik düzenleyiciye giden bir bağlantı gösterilir.

**Acceptance Scenarios**:

1. **Given** tamamlanmış bir tatbikat, **When** bir yönetici bir ders-çıkarımı notu girer, **Then** bu not tatbikat kaydına kalıcı olarak eklenir ve tatbikat özetinde görünür.
2. **Given** bir ders-çıkarımı notu girilirken, **When** yönetici isteğe bağlı olarak bir afet tipi seçerse, **Then** sistem bu notu o afet tipiyle ilişkilendirir ve mevcut Hazard Taxonomy eşik düzenleyicisine giden bir bağlantı gösterir.
3. **Given** bir afet tipi ilişkilendirilmeden not girilirse, **When** not kaydedilir, **Then** sistem bunu kabul eder (afet tipi ilişkilendirmesi zorunlu değildir).
4. **Given** bir ders-çıkarımı notu, **When** kaydedilir, **Then** bu işlem mevcut audit trigger'ı (`log_table_change()`) tarafından otomatik olarak loglanır.

---

### Edge Cases

- Bir tatbikatın hiç exercise uyarısı yayınlanmadığı (tepki süresi "veri yok") durumda export/rapor bu durumu açıkça yansıtır.
- Yıllık rapor üretimi sırasında bir tatbikatın `summary` alanı eksik/bozuksa (ör. eski bir tatbikat kaydı): o tatbikat toplulaştırmadan güvenle atlanır, tüm rapor üretimi başarısız olmaz.
- Ders-çıkarımı notu çok uzun serbest metin olabilir — herhangi bir uzunluk sınırı dayatılmaz (mevcut `description` alanları gibi TEXT).
- İlişkilendirilen afet tipi daha sonra Hazard Taxonomy'den silinirse/pasifleşirse: not kaydı etkilenmez, sadece bağlantı artık geçersiz bir afet tipine işaret edebilir (kabul edilebilir, nadir bir durum).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, tamamlanmış bir tatbikatın özetini (süre, yayınlanan uyarı sayısı, tepki süresi, onay oranı) bir dosya olarak dışa aktarılabilir kılmalıDIR.
- **FR-002**: Dışa aktarılan özette, mevcut olmayan bir metrik (tepki süresi/onay oranı) açıkça "veri yok" olarak görünmeli, sessizce sıfır/boş gösterilmemeliDIR.
- **FR-003**: Sistem, her takvim yılı için, o yıl tamamlanmış tüm tatbikatları toplulaştıran otomatik bir yıllık rapor üretmelidir (toplam sayı, ortalama tepki süresi, ortalama onay oranı, senaryo tipine göre dağılım).
- **FR-004**: Sistem, aynı yıl için ikinci bir yıllık rapor üretmemelidir (tekilleştirme).
- **FR-005**: Yıllık rapor, US1'in dışa aktarma mekanizmasıyla aynı şekilde dışa aktarılabilir olmalıDIR.
- **FR-006**: Sistem, tamamlanmış bir tatbikata serbest metin bir ders-çıkarımı notu eklenmesine izin vermelidir.
- **FR-007**: Sistem, bir ders-çıkarımı notunun isteğe bağlı olarak bir afet tipiyle ilişkilendirilmesine ve ilgili eşik düzenleyicisine bir bağlantı gösterilmesine izin vermelidir.
- **FR-008**: Ders-çıkarımı notu, mevcut denetim günlüğü mekanizması tarafından otomatik olarak loglanmalıDIR (ek bir loglama mekanizması gerekmez).
- **FR-009**: Bu spec'in tüm yeni işlevleri, mevcut `drill_sessions` erişim kısıtlamalarıyla (super_admin/country_admin/org_admin, kendi ülke/org kapsamında) aynı yetkilendirmeye tabi olmalıDIR.

### Key Entities

- **Tatbikat Özeti (mevcut, genişletilmiş davranış)**: `drill_sessions.summary` artık dışa aktarılabilir; export mekanizması yeni bir varlık değildir.
- **Yıllık Tatbikat Raporu (yeni)**: Belirli bir takvim yılına ait toplulaştırılmış tatbikat metrikleri — mevcut `compliance_reports`/`incident_reports` desenine benzer, kalıcı bir kayıt.
- **Ders Çıkarımı Notu (yeni alan)**: Bir tatbikat kaydına eklenen serbest metin not + isteğe bağlı afet tipi ilişkilendirmesi.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bir yönetici, tamamlanmış herhangi bir tatbikatın özetini tek bir aksiyonla dışa aktarabilir ve sonucu anında görebilir.
- **SC-002**: Her takvim yılı için en fazla bir yıllık tatbikat raporu üretilir (asla ikinci bir tekrar üretilmez).
- **SC-003**: Bir yönetici, tamamlanmış bir tatbikata tek bir aksiyonla bir ders-çıkarımı notu ekleyebilir ve isteğe bağlı olarak ilgili eşik düzenleyicisine yönlendirilebilir.

## Assumptions

- "Dosya olarak dışa aktarma" mevcut CSV/JSON export altyapısına (`rowsToCsv`/`rowsToJson`/`triggerDownload`) dayanır — PDF gibi yeni bir format gerekmez (Constitution Principle VIII/YAGNI ile tutarlı, önceki specler 007/019/026/028/030'da da aynı karar verildi).
- Yıllık tatbikat raporu, Incident Tracking modülünün (spec 026) `incident_reports` + `generate-incident-report` Edge Function + `pg_cron` (1 Ocak, otomatik) deseninin birebir tekrarıdır — yeni bir mimari yaklaşım icat edilmez.
- Ders-çıkarımı notu ve afet tipi ilişkilendirmesi, mevcut `hazard_types` tablosuna (spec 010) bir foreign key ile bağlanır — asıl eşik değişikliğinin kendisi bu spec'in kapsamında DEĞİLDİR, sadece mevcut eşik düzenleyicisine bir bağlantı/referans sağlanır (PRD'nin "feed calibration recommendations to risk/threshold workflows" ifadesi, otomatik bir eşik değişikliği yapan bir sistem olarak değil, insan-onaylı bir öneri/bağlantı mekanizması olarak yorumlanmıştır — YAGNI, tam otomatik kalibrasyon aşırı riskli/karmaşık olurdu).
- Bu spec, `drill_sessions` şemasının mevcut kolonlarını/RLS'ini/state machine'ini değiştirmez (additive: yeni kolonlar/tablo eklenebilir).
