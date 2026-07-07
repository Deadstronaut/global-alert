# Feature Specification: Denetim Günlüğü Dayanıklılığı (Yazma Hatası Toleransı + Tamlık Doğrulaması)

**Feature Branch**: `029-audit-log-resilience`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Audit & Compliance modülünde PRD'de (docs/mhewsprd.md §3.9 Module M9) açıkça yer alan ama daha önce hiç yapılmamış iki CRITICAL/S1 gereksinim: (1) MHEWS-FC-ERR-09 — audit yazma hatası: ana işlemi engellemeden fallback'e kuyruğa al, bağlantı geri gelince flush et. (2) MHEWS-FC-OUV-06 — kayıt öncesi audit event tamlık doğrulaması."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bir denetim kaydı yazılamazsa asıl işlem yine de tamamlanır (Priority: P1) 🎯 MVP

Bir kullanıcı sistemde kritik bir işlem yaptığında (örn. bir olay kaydı oluşturma, bir profili güncelleme), bu işlemi denetim günlüğüne (audit log) kaydetme adımı herhangi bir nedenle başarısız olursa, kullanıcının asıl işlemi yine de başarıyla tamamlanır — sistem asıl işi denetim kaydı uğruna asla engellemez. Başarısız olan denetim kaydı kaybolmaz, daha sonra tekrar denenebilmesi için ayrı bir yerde bekletilir.

**Why this priority**: Bu, PRD'nin CRITICAL/S1 olarak işaretlediği bir gereksinim (MHEWS-FC-ERR-09) — denetim alt sisteminin bir arızası, felaket müdahalesi gibi hayati önem taşıyan asıl işlemleri asla durduramamalı. Tek başına değer sağlar, tamlık doğrulamasından (User Story 2) bağımsızdır.

**Independent Test**: Denetim günlüğüne yazmayı kasıtlı olarak başarısız kılacak bir durum simüle edilir (örn. geçici bir kısıt ihlali), ardından denetlenen bir tabloda (örn. profiles) bir değişiklik yapılır; değişikliğin başarıyla tamamlandığı VE başarısız denetim kaydının ayrı bir bekleme alanında göründüğü doğrulanır.

**Acceptance Scenarios**:

1. **Given** denetim günlüğüne yazma normal şekilde çalışırken, **When** denetlenen bir tabloda bir değişiklik yapılır, **Then** hem asıl değişiklik hem de karşılık gelen denetim kaydı normal şekilde oluşur (mevcut davranış, regresyon yok).
2. **Given** denetim günlüğüne yazma bir nedenle başarısız olacakken, **When** denetlenen bir tabloda bir değişiklik yapılır, **Then** asıl değişiklik yine de başarıyla tamamlanır.
3. **Given** Senaryo 2'deki gibi bir yazma hatası oluştuğunda, **Then** başarısız olan denetim kaydı bilgisi (hangi işlem, hangi kayıt, hata nedeni) ayrı bir bekleme alanında kalıcı olarak saklanır, kaybolmaz.
4. **Given** bekleme alanında bekleyen kayıtlar varken, **When** bir Super Admin bunları tekrar göndermeyi tetikler, **Then** sistem her birini tekrar denetim günlüğüne yazmayı dener; başarılı olanlar bekleme alanından kalıcı olarak kaldırılır.

---

### User Story 2 - Eksik bilgiyle bir denetim kaydı asla oluşturulamaz (Priority: P2)

Sistemin herhangi bir yerinde (mevcut otomatik mekanizma veya ileride yazılacak yeni bir kod yolu), bir kaynağa bağlı bir denetim olayı (bir tablodaki ekleme/güncelleme/silme) kaydedilmeye çalışıldığında, hangi tablonun ve hangi kaydın etkilendiği bilgisi olmadan bu kayıt oluşturulamaz — sistem bu tür eksik kayıtları en baştan reddeder.

**Why this priority**: Bu da PRD'nin CRITICAL/S1 gereksinimlerinden biri (MHEWS-FC-OUV-06) — ama User Story 1'in aksine, bugün sistemde bu durumu tetikleyen bilinen bir kod yolu yok (mevcut otomatik mekanizma zaten bu alanları her zaman dolduruyor); bu, gelecekteki hatalara karşı önleyici bir koruma. Bu yüzden P2.

**Independent Test**: Sistemin denetim tablosuna, bir kaynağa bağlı olması gereken bir olay tipi için kasıtlı olarak eksik bilgiyle (hangi tablo/hangi kayıt belirtilmeden) bir kayıt eklenmeye çalışılır; sistemin bunu reddettiği doğrulanır. Kaynak-bağımsız bir olay tipi (örn. giriş/dışa-aktarma gibi belirli bir tabloya bağlı olmayan olaylar) için aynı bilginin eksik olması durumunda kaydın yine de kabul edildiği doğrulanır (mevcut davranış korunur).

**Acceptance Scenarios**:

1. **Given** bir kaynağa bağlı olay tipi (ekleme/güncelleme/silme), **When** hangi tablo/hangi kayıt bilgisi olmadan bir denetim kaydı oluşturulmaya çalışılır, **Then** sistem bu kaydı reddeder.
2. **Given** kaynağa bağlı olmayan bir olay tipi (örn. giriş olayı), **When** tablo/kayıt bilgisi olmadan bir denetim kaydı oluşturulur, **Then** sistem bunu normal şekilde kabul eder (mevcut davranış, regresyon yok — bu tip olaylar zaten böyle çalışıyor).
3. **Given** mevcut otomatik denetim mekanizması (tablo değişikliklerini otomatik kaydeden), **When** bu mekanizma çalışır, **Then** her zaman olduğu gibi tüm gerekli bilgiyi dolu bırakır, yeni kural tarafından hiçbir zaman reddedilmez (regresyon yok).

---

### Edge Cases

- Bekleme alanındaki bir kayıt tekrar denendiğinde yine başarısız olursa: bekleme alanında kalmaya devam eder, veri kaybolmaz, ikinci bir deneme daha sonra tekrar yapılabilir.
- Denetim günlüğüne yazma normalde hemen hemen hiç başarısız olmaz (aynı veritabanı, aynı işlem içinde) — bu mekanizmanın gerçek dünyada nadiren devreye gireceği, ama devreye girdiğinde asıl işlemi engellememesinin kritik olduğu kabul edilir.
- Bekleme alanındaki kayıtları sadece Super Admin görebilir ve tekrar gönderme işlemini sadece Super Admin tetikleyebilir (mevcut denetim günlüğü erişim kısıtlamasıyla tutarlı).
- Bekleme alanı kendisi de asla düzenlenemez/silinemez (mevcut denetim günlüğünün "sadece ekleme" ilkesiyle tutarlı) — sadece başarılı bir tekrar deneme sonrası sistem tarafından temizlenir.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, bir denetim kaydı yazma girişimi başarısız olduğunda, bu başarısızlığın tetikleyen asıl işlemi (ör. bir kaydın oluşturulması/güncellenmesi/silinmesi) engellememesini SAĞLAMALIDIR.
- **FR-002**: Sistem, başarısız olan her denetim yazma girişimini (hangi işlem, hangi kayıt, hata nedeni dahil) kalıcı olarak, ayrı bir bekleme alanında saklamalıDIR — bilgi kaybolmamalıdır.
- **FR-003**: Bir Super Admin, bekleme alanındaki kayıtların sayısını görebilmeli ve bunları tekrar denetim günlüğüne yazmayı manuel olarak tetikleyebilmelidir.
- **FR-004**: Tekrar deneme başarılı olan bir kayıt, bekleme alanından kalıcı olarak kaldırılmalıdır; başarısız olan bir kayıt bekleme alanında kalmaya devam etmelidir.
- **FR-005**: Sistem, bir kaynağa bağlı (etkilenen tablo belirten) bir denetim olayının, hangi tablonun etkilendiği bilgisi olmadan oluşturulmasını ENGELLEMELİDİR. (Not: etkilenen kaydın kimliği — `record_id` — bazı tabloların birincil anahtarı `id` dışında bir alan olduğu için her zaman dolu olamaz; canlı veriyle doğrulanmıştır — bu spec sadece "hangi tablo" bilgisinin zorunlu olmasını kapsar.)
- **FR-006**: Sistem, kaynağa bağlı olmayan bir denetim olayının (belirli bir tabloya/kayda işaret etmeyen), tablo/kayıt bilgisi olmadan oluşturulmasına İZİN VERMELİDİR (mevcut davranış korunmalı).
- **FR-007**: Bekleme alanındaki kayıtlar, mevcut denetim günlüğüyle aynı erişim kısıtlamasına (sadece Super Admin görebilir) tabi olmalıdır.
- **FR-008**: Mevcut denetim günlüğünün bütünlük doğrulama mekanizması (hash-zinciri) bu spec ile HİÇ değişmemelidir.

### Key Entities

- **Denetim Kaydı (Audit Log Entry)**: Mevcut varlık — bu spec'te tamlık kuralı eklenir (kaynağa bağlı olaylar için tablo/kayıt bilgisi zorunlu).
- **Bekleyen Denetim Kaydı (Audit Log Dead Letter)**: Yeni varlık — başarısız bir denetim yazma girişiminin bilgisini (ne yazılmaya çalışıldığı, ne zaman, neden başarısız olduğu) geçici olarak tutan, sadece Super Admin'e görünür bir kayıt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Denetim günlüğüne yazma başarısız olduğu senaryoların %100'ünde, tetikleyen asıl işlem yine de başarıyla tamamlanır.
- **SC-002**: Başarısız olan denetim yazma girişimlerinin %100'ü, bekleme alanında kalıcı olarak görünür hale gelir (hiçbiri sessizce kaybolmaz).
- **SC-003**: Bir Super Admin, bekleme alanındaki kayıtları tek bir aksiyon ile (tekrar gönder butonu) yeniden deneyebilir ve sonucu (kaç tanesinin başarılı olduğu) anında görebilir.
- **SC-004**: Kaynağa bağlı eksik-bilgili bir denetim kaydı oluşturma girişimlerinin %100'ü reddedilir; kaynağa bağlı olmayan olaylar %100 oranında etkilenmeden çalışmaya devam eder.

## Assumptions

- Bu proje denetim yazımını bir veritabanı tetikleyicisiyle (aynı işlem/transaction içinde) yapıyor — PRD'nin "bağlantı geri gelince flush et" ifadesi, burada gerçek bir ağ bağlantısı senaryosuna değil, "bir sonraki başarılı tekrar deneme" anlamına yeniden yorumlanmıştır.
- Otomatik/zamanlanmış tekrar deneme (örn. periyodik bir arka plan görevi) bu spec'in kapsamı dışındadır — sadece Super Admin'in manuel tetiklediği bir "tekrar dene" aksiyonu yeterlidir (gerçek bir bekleme-alanı kaydı oluşması son derece nadir bir senaryo olduğu için, YAGNI).
- Tamlık kuralı sadece kaynağa bağlı (bir tabloyu/kaydı etkileyen) olay tiplerine uygulanır; giriş/dışa-aktarma gibi kaynak-bağımsız olay tipleri bu kuraldan muaftır — mevcut uyum raporu hesaplamasının bu tip olaylarda tablo/kayıt bilgisinin boş olmasını zaten beklediği tespit edilmiştir.
- Mevcut denetim günlüğü şeması, erişim kısıtlamaları ve bütünlük doğrulama mekanizması bu spec ile değişmez — sadece additive (ek) bir tamlık kuralı ve yeni bir bekleme-alanı varlığı eklenir.
