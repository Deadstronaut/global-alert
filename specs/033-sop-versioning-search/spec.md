# Feature Specification: SOP Repository Sürümleme, Kategori ve Arama

**Feature Branch**: `033-sop-versioning-search`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Incident Tracking modülünde PRD'de açıkça yer alan ama daha önce hiç yapılmamış bir gereksinim: SOP Repository'nin sürüm geçmişi (MHEWS-FR-0275), kategori alanı ve arama (MHEWS-FR-0184) eksik."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bir yönetici, SOP'ları kategoriye göre filtreleyip arayabilir (Priority: P1) 🎯 MVP

Bir yönetici, SOP Repository'de çok sayıda doküman biriktiğinde, belirli bir dokümanı hazard tipine ek olarak bir kategoriye (ör. "Mevzuat", "Standart Prosedür", "Kontrol Listesi") göre filtreleyebilir ve başlığa göre arayabilir — böylece uzun bir liste yerine ilgili dokümana hızlıca ulaşır.

**Why this priority**: PRD'nin açık bir gereksinimi (MHEWS-FR-0184), en düşük riskli/en yüksek kullanıcı etkili kalem — mevcut listeye ek bir filtre/arama katmanı, veri kaybı riski yok. Tek başına değer sağlar.

**Independent Test**: Birkaç farklı kategoride SOP oluşturulur; kategori filtresi ve başlık araması uygulanır, sadece eşleşen dokümanların listelendiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** farklı kategorilerde birden fazla SOP mevcutken, **When** bir yönetici bir kategori seçer, **Then** sadece o kategorideki SOP'lar listelenir.
2. **Given** bir arama terimi girildiğinde, **When** terim bir SOP başlığıyla eşleşirse, **Then** sadece eşleşen SOP'lar listelenir (büyük/küçük harf duyarsız, kısmi eşleşme).
3. **Given** bir SOP'un kategorisi boş bırakılmışsa, **When** kategori filtresi "tümü" veya boşsa, **Then** bu SOP yine de listelenir (kategori zorunlu bir alan değildir).
4. **Given** hem kategori filtresi hem arama terimi aynı anda uygulanmışsa, **When** liste güncellenir, **Then** her iki koşulu da sağlayan SOP'lar gösterilir.

---

### User Story 2 - Bir yönetici, bir SOP'un önceki sürümlerini görüntüleyebilir (Priority: P2)

Bir yönetici bir SOP'u güncellediğinde (başlık, içerik veya referans linki değiştiğinde), önceki sürüm kalıcı olarak saklanır ve daha sonra bir yönetici bu SOP'un geçmiş sürümlerini (hangi tarihte ne içerdiğini) görüntüleyebilir.

**Why this priority**: PRD'nin açık bir gereksinimi (MHEWS-FR-0275) — acil durum prosedürlerinde "hangi sürüm ne zaman geçerliydi" bilgisinin kaybolmaması önemli bir uyum/hesap verebilirlik ihtiyacı. US1'den sonra gelir çünkü daha büyük bir veri modeli değişikliği içerir.

**Independent Test**: Bir SOP güncellenir (içerik değiştirilir), ardından "Geçmiş Sürümler" görünümü açılır; önceki içeriğin tam olarak korunduğu, yeni içeriğin güncel sürüm olarak göründüğü doğrulanır.

**Acceptance Scenarios**:

1. **Given** mevcut bir SOP, **When** başlığı, içeriği veya referans linki değiştirilerek kaydedilir, **Then** değişiklikten önceki hâli kalıcı olarak bir sürüm geçmişi kaydı olarak saklanır.
2. **Given** bir SOP'un birden fazla geçmiş sürümü varsa, **When** bir yönetici "Geçmiş Sürümler" görünümünü açar, **Then** tüm önceki sürümler, en yeniden en eskiye doğru, hangi tarihte arşivlendiğiyle birlikte listelenir.
3. **Given** bir SOP güncellenirken sadece `is_active` (aktif/pasif) durumu değiştiriliyorsa (içerik/başlık/link aynı kalıyorsa), **When** kaydedilir, **Then** yeni bir sürüm geçmişi kaydı OLUŞTURULMAZ (sadece içerik-etkileyen değişiklikler sürümlenir).
4. **Given** bir SOP hiç güncellenmemişse, **When** "Geçmiş Sürümler" görünümü açılır, **Then** sistem "henüz geçmiş sürüm yok" mesajı gösterir, hata vermez.

---

### Edge Cases

- Bir SOP'un kategorisi daha sonra boşaltılırsa: mevcut sürüm geçmişi kayıtları etkilenmez (kategori sürümlenen alanlardan biri değildir, sadece güncel SOP kaydının bir özelliğidir).
- Çok sayıda geçmiş sürüm birikirse: hepsi saklanır, herhangi bir otomatik silme/budama yapılmaz (denetim/hesap verebilirlik amacı — mevcut `audit_log`'un hiç silinmeyen doğasıyla tutarlı).
- Arama ve kategori filtresi, mevcut hazard-tipi filtresiyle (incident'ta otomatik eşleşen SOP gösterimi) ÇAKIŞMAZ — bu spec sadece SOP Repository admin panelindeki listeleme/arama deneyimini etkiler, incident'lardaki otomatik SOP eşleştirme mantığını değiştirmez.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, bir SOP dokümanına isteğe bağlı bir kategori atanmasına izin vermelidir.
- **FR-002**: Sistem, SOP Repository listesinin kategoriye göre filtrelenmesine izin vermelidir.
- **FR-003**: Sistem, SOP Repository listesinin başlığa göre (kısmi, büyük/küçük harf duyarsız) aranmasına izin vermelidir.
- **FR-004**: Kategori filtresi ve arama terimi birlikte uygulanabilmelidir.
- **FR-005**: Sistem, bir SOP'un başlığı, içeriği veya referans linki değiştirildiğinde, değişiklikten önceki hâlini kalıcı bir sürüm geçmişi kaydı olarak saklamalıDIR.
- **FR-006**: Sistem, sadece `is_active` durumu değişen bir güncellemede YENİ bir sürüm geçmişi kaydı OLUŞTURMAMALIDIR (içerik-etkilemeyen değişiklikler sürümlenmez).
- **FR-007**: Bir yönetici, bir SOP'un tüm geçmiş sürümlerini (içerik + arşivlenme tarihi) görüntüleyebilmelidir.
- **FR-008**: Sürüm geçmişi kayıtları hiçbir zaman silinmemeli veya düzenlenmemeliDIR (append-only, mevcut `audit_log`'un ilkesiyle tutarlı).
- **FR-009**: Bu spec'in tüm yeni işlevleri, mevcut `sop_documents` erişim kısıtlamalarıyla (super_admin veya `sop_repository` capability grant'ine sahip country_admin/org_admin) aynı yetkilendirmeye tabi olmalıDIR.

### Key Entities

- **SOP Dokümanı (mevcut, genişletilmiş)**: `category` alanı eklenir; ayrıca artık bir sürüm numarası taşır.
- **SOP Sürüm Geçmişi (yeni)**: Bir SOP'un önceki bir hâlinin (başlık, içerik, referans linki, arşivlenme tarihi) kalıcı, salt-okunur kaydı.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bir yönetici, kategori ve/veya başlık araması kullanarak istediği SOP'u tek bir filtreleme adımında bulabilir.
- **SC-002**: İçerik-etkileyen her SOP güncellemesinin %100'ünde önceki hâl kalıcı olarak saklanır, hiçbir sürüm kaybolmaz.
- **SC-003**: Sadece aktif/pasif durumu değişen güncellemelerin %100'ünde yeni bir sürüm kaydı oluşmaz (gereksiz sürüm birikmesi önlenir).

## Assumptions

- Arama, tam metin arama (full-text search) altyapısı gerektirmez — mevcut küçük ölçekli SOP listesi için client-side (zaten yüklenmiş veri üzerinde) basit bir kısmi-eşleşme filtresi yeterlidir (YAGNI, Postgres full-text search/extension eklemek bu ölçekte gereksiz).
- Kategori, sabit bir enum/kontrollü liste değil, serbest metin bir alan olarak modellenir — panelde mevcut kategorilerden seçim + yeni kategori girme imkânı sunulur (PRD'nin örnek kategorileri "Legislation, SOPs, etc." zaten açık uçlu bir liste öneriyor).
- Sürüm geçmişi görüntüleme salt-okunurdur — bu spec bir SOP'u önceki bir sürüme "geri yükleme" (rollback) özelliği İÇERMEZ, sadece geçmişi görüntüleme sağlar (PRD'nin "searchable"/"version-controlled" ifadesi saklama+görüntülemeyi gerektiriyor, otomatik geri yüklemeyi değil — YAGNI, gerekirse ayrı bir iterasyona bırakılabilir).
- Bu spec, `sop_documents`'ın mevcut RLS'ini/hazard-tipi eşleştirme mantığını/incident entegrasyonunu değiştirmez (additive: yeni bir kolon + yeni bir tablo).
