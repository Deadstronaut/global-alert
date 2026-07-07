# Feature Specification: Sığınakların Harita Üzerinde Gösterimi

**Feature Branch**: `027-shelter-map-display`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Dissemination modülünün kalan tek buildable kalemi: sığınakların (shelters) harita üzerinde gösterimi."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Herhangi bir signed-in kullanıcı sığınakları haritada görebilir (Priority: P1) 🎯 MVP

Bir felaket sırasında, sisteme giriş yapmış herhangi bir kullanıcı (Viewer dahil) ana harita görünümünü açtığında, aktif sığınakların konumlarını ayırt edici bir işaretçiyle görebilir; bir işaretçiye tıkladığında sığınağın adını, doluluk durumunu ve durumunu (açık/dolu/kapalı) gösteren bir bilgi kutusu açılır.

**Why this priority**: Bu, spec'in tüm değerini tek başına sağlar — kullanıcılar şu anda sığınak bilgisini sadece ayrı bir liste sayfasında (`/shelters`) görebiliyor, coğrafi bağlamda (yakınındaki diğer sığınaklar, olay bölgesine göre konum) göremiyor. Harita üzerinde göstermek, "en yakın hangi sığınak müsait" sorusuna doğrudan görsel cevap verir.

**Independent Test**: Ana harita görünümü açılır, en az bir aktif sığınak varken sığınak işaretçisinin haritada göründüğü doğrulanır; işaretçiye tıklanır, açılan bilgi kutusunda sığınağın adı/doluluk/durumu görüntülenir. Diğer kullanıcı hikayelerinden bağımsız olarak test edilebilir.

**Acceptance Scenarios**:

1. **Given** en az bir aktif (is_active=true), koordinatlı (lat/lng dolu) sığınak varken, **When** herhangi bir signed-in kullanıcı ana harita görünümünü açar, **Then** o sığınak için haritada bir işaretçi görünür.
2. **Given** haritada görünen bir sığınak işaretçisi, **When** kullanıcı işaretçiye tıklar, **Then** açılan bilgi kutusunda sığınağın adı, doluluk oranı ("X/Y, %Z") ve durumu (açık/dolu/kapalı) gösterilir.
3. **Given** bir sığınağın koordinatı (lat veya lng) boş, **When** harita sığınakları yüklerken, **Then** o sığınak için işaretçi oluşturulmaz (hata vermeden sessizce atlanır).
4. **Given** bir sığınak pasif (is_active=false), **When** harita sığınakları yüklerken, **Then** o sığınak için işaretçi oluşturulmaz.

---

### User Story 2 - Kullanıcı sığınak katmanını isteğe bağlı gizleyebilir/gösterebilir (Priority: P2)

Harita zaten afet olayları, ısı haritası, hexbin gibi birden fazla görsel katman barındırıyor; kullanıcı sığınak işaretçilerinin görsel karmaşaya neden olduğunu düşünürse, mevcut katman kontrol panelinden tek tıkla sığınak katmanını kapatabilir/açabilir.

**Why this priority**: Görsel netlik için önemli ama P1'in temel değerini engellemez — sığınaklar varsayılan olarak açık gösterilebilir, bu sadece bir iyileştirmedir.

**Independent Test**: Harita kontrol panelinde "Sığınakları Göster/Gizle" seçeneği açılır/kapatılır, sığınak işaretçilerinin haritadan kaybolup tekrar göründüğü doğrulanır. User Story 1'in üzerine ekli, bağımsız test edilebilir bir davranış.

**Acceptance Scenarios**:

1. **Given** sığınak katmanı varsayılan olarak açık, **When** kullanıcı "Sığınakları Gizle" kontrolünü kullanır, **Then** tüm sığınak işaretçileri haritadan kaldırılır.
2. **Given** sığınak katmanı gizli, **When** kullanıcı "Sığınakları Göster" kontrolünü kullanır, **Then** aktif/koordinatlı sığınakların işaretçileri tekrar haritada görünür.

---

### Edge Cases

- Hiç aktif sığınak yoksa (veya hiçbirinin koordinatı yoksa): harita normal şekilde açılır, sadece sığınak işaretçisi görünmez, hata gösterilmez.
- Bir sığınak bir incident'a bağlıysa (`linked_incident_id` dolu): bilgi kutusunda bu bağlantı belirtilir (ör. "İlgili olay: [incident başlığı]").
- Kullanıcı harita açıkken bir admin başka bir sekmede sığınak ekler/durumunu değiştirirse: mevcut fetch-on-mount deseniyle tutarlı olarak, bu değişiklik ancak harita yeniden yüklendiğinde (sayfa yenileme) yansır — gerçek zamanlı güncelleme kapsam dışı.
- Aynı konumda birden fazla sığınak varsa (çakışan lat/lng): her biri ayrı işaretçi olarak render edilir; görsel çakışma/clustering bu spec'te ele alınmıyor (YAGNI, düşük sığınak sayısı varsayımı).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, herhangi bir signed-in kullanıcı için ana harita görünümünde aktif ve koordinatı (lat/lng) dolu olan tüm sığınakları ayırt edici bir işaretçiyle göstermelidir.
- **FR-002**: Sistem, pasif (is_active=false) veya koordinatı eksik olan sığınakları haritada göstermemelidir.
- **FR-003**: Kullanıcılar bir sığınak işaretçisine tıkladığında, sığınağın adını, doluluk bilgisini (dolu kapasite / toplam kapasite ve yüzde) ve durumunu (açık/dolu/kapalı) gösteren bir bilgi kutusu görebilmelidir.
- **FR-004**: Sistem, sığınak işaretçilerini durumuna göre görsel olarak ayırt etmelidir (açık/dolu/kapalı için farklı renk kodlaması).
- **FR-005**: Sığınak işaretçileri, haritanın afet olayları için uyguladığı zoom-seviyesine-bağlı gizleme kuralına tabi olmamalı; her zoom seviyesinde görünür kalmalıdır.
- **FR-006**: Kullanıcılar, mevcut harita katman kontrollerine benzer bir arayüzle sığınak katmanının görünürlüğünü açıp kapatabilmelidir.
- **FR-007**: Bir sığınağın bağlı bir olayı (incident) varsa, bilgi kutusunda bu bağlantı belirtilmelidir.
- **FR-008**: Sistem, sığınak verilerini salt-okunur olarak tüketmelidir — bu özellik üzerinden sığınak oluşturma/düzenleme/silme yapılamaz.

### Key Entities

- **Sığınak (Shelter)**: Mevcut veri modeli (spec 021) — konum (lat/lng), kapasite (toplam/dolu), durum (açık/dolu/kapalı), aktiflik, opsiyonel bağlı olay. Bu spec yeni alan eklemez, sadece mevcut alanları haritada görselleştirir.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Aktif ve koordinatlı bir sığınağı olan herhangi bir kullanıcı, ana harita görünümünü açtıktan sonra 3 saniye içinde o sığınağın konumunu haritada görebilir.
- **SC-002**: Kullanıcılar, bir sığınağın doluluk durumunu görmek için tek bir tıklama ile (işaretçiye tıklayarak) bilgiye ulaşabilir — ayrı bir sayfaya gitmeye gerek kalmaz.
- **SC-003**: Kullanıcıların %100'ü (Viewer dahil her rol), ek bir yetkilendirme adımı olmadan sığınak katmanını görebilir.
- **SC-004**: Sığınak katmanının açık/kapalı geçişi anlık olur (bir saniyeden az gecikmeyle işaretçiler görünür/kaybolur).

## Assumptions

- Sığınak sayısı görsel kümeleme (clustering) gerektirmeyecek kadar azdır (mevcut sığınak yönetimi küçük/orta ölçekli varsayılıyor, spec 021 ile tutarlı).
- Harita zaten tüm signed-in rollere açıktır; bu spec harita rotasının erişim kontrolüne dokunmaz.
- Sığınak verisinin gerçek zamanlı (canlı) güncellenmesi gerekmez — sayfa yenilendiğinde en güncel veri gösterilmesi yeterlidir, mevcut afet-olayı marker deseniyle tutarlı.
- Kimlik doğrulaması gerektirmeyen Public Portal (`/portal`), mevcut RLS politikası gereği bu özelliğin kapsamı dışındadır (sadece `authenticated` rolüne açık).
- Sığınakların harita üzerinden düzenlenmesi (CRUD) bu spec'in kapsamı dışındadır; mevcut AdminView/ShelterInfoView akışları değişmeden kalır.
- Sığınaklar iç, Supabase-yönetimli operasyonel veridir (tıpkı `contacts`/`incidents` gibi), Anayasa Principle IV'ün kastettiği "harici afet/tehlike veri kaynağı" değildir — bu yüzden bu katman için ayrı bir veri-tazelik (data-freshness) göstergesi gerekmez, mevcut `contacts`/`incidents` gösterimleriyle tutarlıdır.
