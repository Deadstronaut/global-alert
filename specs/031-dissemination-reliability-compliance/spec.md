# Feature Specification: Dissemination Güvenilirliği ve Uyum

**Feature Branch**: `031-dissemination-reliability-compliance`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Dissemination modülünde PRD'de açıkça yer alan ama daha önce hiç yapılmamış 5 HIGH öncelikli, buildable gereksinim: e-posta dil lokalizasyonu, unsubscribe linki, otomatik/backoff'lu retry, admin'e aktif hata bildirimi, GDPR contact anonimizasyonu."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bir alıcı, uyarı e-postasını kendi tercih ettiği dilde alır (Priority: P1) 🎯 MVP

Bir kişi (contact), profilinde belirttiği tercih ettiği dilde bir CAP uyarı e-postası aldığında, e-posta içeriği (başlık, açıklama) o dilde görünür — eğer o CAP taslağı için o dilde bir çeviri girilmemişse, e-posta orijinal/varsayılan dilde gelir (mevcut davranış, regresyon yok).

**Why this priority**: PRD'nin açık bir gereksinimi (MHEWS-FR-0287/SD-EMAIL-02) ve veri modeli zaten hazır (`contacts.preferred_language`, `cap_drafts.translations`) — sadece bağlanmamış, en düşük riskli ve en yüksek kullanıcı etkili kalem. Tek başına değer sağlar.

**Independent Test**: `preferred_language='tr'` olan bir contact'a, `translations: {"tr": {...}}` içeren bir CAP broadcast edilir; alınan e-postanın Türkçe içerik taşıdığı doğrulanır. Aynı senaryoda çeviri yoksa e-postanın orijinal dilde geldiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** bir contact'ın `preferred_language`'ı `tr` ve broadcast edilen CAP taslağının `translations.tr` alanı doluyken, **When** e-posta dispatch edilir, **Then** e-posta içeriği (başlık+açıklama) Türkçe çeviriden gelir.
2. **Given** bir contact'ın `preferred_language`'ı `fr` ama CAP taslağının `translations.fr` alanı boşken, **When** e-posta dispatch edilir, **Then** e-posta CAP'in orijinal/varsayılan dilindeki içerikle gönderilir (sessizce hata vermez).
3. **Given** manuel retry (`handleRetry`) tetiklendiğinde, **When** e-posta yeniden gönderilir, **Then** aynı dil-seçim mantığı uygulanır (ilk gönderimle tutarlı).

---

### User Story 2 - Bir alıcı, e-posta uyarılarından tek tıkla çıkabilir (Priority: P1) 🎯 MVP

Bir kişi, aldığı bir uyarı e-postasındaki "abonelikten çık" linkine tıkladığında, artık gelecekteki uyarı e-postalarını almaz — bu işlem oturum açmaya gerek duymadan, tek tıkla tamamlanır.

**Why this priority**: PRD'nin açık bir gereksinimi (MHEWS-SD-EMAIL-04), e-posta gönderiminin yasal/uyum boyutu (spam/rıza mevzuatı) — `ack-dispatch`'in kanıtlanmış deseninin doğrudan bir kopyası, düşük risk.

**Independent Test**: Bir e-postadaki unsubscribe linkine (kimlik doğrulamasız) tıklanır; o contact'ın artık gelecek dispatch'lerde eşleşmediği (e-posta kanalından hariç tutulduğu) doğrulanır.

**Acceptance Scenarios**:

1. **Given** bir contact bir uyarı e-postası aldığında, **When** e-postadaki unsubscribe linkine tıklar, **Then** sistem o contact'ı e-posta kanalından çıkarır (gelecekteki dispatch'lerde e-posta almaz) ve linkin tıklandığını onaylayan bir sayfa gösterir.
2. **Given** bir contact zaten e-postadan çıkmışken, **When** aynı linke tekrar tıklanırsa, **Then** sistem hata vermez, aynı onay sayfasını gösterir (idempotent, `ack-dispatch` deseniyle tutarlı).
3. **Given** bir contact e-postadan çıktıktan sonra, **When** WhatsApp kanalından hâlâ mesaj alması gerekiyorsa, **Then** WhatsApp kanalı etkilenmez (unsubscribe sadece e-posta kanalına özgüdür).

---

### User Story 3 - Başarısız bir dispatch, operatör beklemeden otomatik olarak yeniden denenir (Priority: P2)

Bir dispatch job'ı (veya bir alıcının e-posta gönderimi) geçici bir nedenle başarısız olduğunda, sistem operatörün manuel müdahalesini beklemeden, sınırlı sayıda ve artan aralıklarla otomatik olarak yeniden dener.

**Why this priority**: PRD'nin açık bir gereksinimi (MHEWS-FR-0119) — hayati önem taşıyan uyarıların operatör bir ekrana bakmadığı sürece gecikmesini önler. P1'lerden bağımsız çalışır ama onlardan sonra gelir çünkü otomatik retry'ın da dil-lokalize e-posta göndermesi gerekir (US1'e bağımlı).

**Independent Test**: Bir dispatch_receipt'i kasıtlı olarak `failed` durumuna getirilir; otomatik retry mekanizması tetiklendiğinde (zamanlanmış görev), sistemin bu satırı sınırlı sayıda ve artan aralıklarla yeniden denediği, sonunda başarılı olursa `sent` durumuna geçtiği, tüm denemeler tükenirse kalıcı olarak `failed` kaldığı doğrulanır.

**Acceptance Scenarios**:

1. **Given** bir `dispatch_receipts` satırı `failed` durumundayken, **When** otomatik retry mekanizması çalışır, **Then** sistem bu satırı yeniden göndermeyi dener.
2. **Given** bir satır art arda birden fazla kez başarısız olursa, **When** her deneme arasında geçen süre, **Then** bir önceki denemeden daha uzun olur (backoff).
3. **Given** bir satır azami deneme sayısına ulaştığında, **When** otomatik retry mekanizması tekrar çalışır, **Then** bu satırı bir daha denemez, kalıcı olarak başarısız kalır (operatörün manuel "Tekrar Dene" aksiyonu hâlâ kullanılabilir).
4. **Given** operatör manuel "Tekrar Dene" butonunu kullanırsa, **When** bu aksiyon tetiklenir, **Then** otomatik retry'ın deneme sayacı sıfırlanır (manuel müdahale her zaman yeni bir şans tanır).

---

### User Story 4 - Bir dispatch tamamen başarısız olduğunda, bir yöneticiye aktif olarak haber verilir (Priority: P2)

Bir dispatch job'ı tüm alıcılar için tamamen başarısız olduğunda (ör. e-posta sağlayıcısı yapılandırılmamış/erişilemez), sistem bunu sadece bir panelde pasif olarak göstermek yerine, ilgili ülke/organizasyonun bir yöneticisine aktif olarak (e-posta ile) bildirir.

**Why this priority**: PRD'nin açık bir gereksinimi (MHEWS-FR-0066) — bir yönetici panele girmediği sürece kritik bir dispatch arızasının fark edilmemesi riskini kapatır. P2, çünkü US3'ün "tüm denemeler tükendi" sinyaline bağlı olarak en anlamlı hale gelir.

**Independent Test**: Bir dispatch job'ı `failed` durumuna (provider-wide failure) ulaştığında, ilgili ülke/org'un en az bir admin/super_admin kullanıcısına bir bildirim e-postası gönderildiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** bir dispatch job'ı tüm otomatik retry denemeleri tükendikten sonra hâlâ `failed` durumundaysa, **When** bu durum tespit edilir, **Then** ilgili ülke/org'un en az bir super_admin/country_admin/org_admin kullanıcısına bir bildirim e-postası gönderilir.
2. **Given** bir bildirim e-postası zaten gönderilmiş bir job için, **When** durum tekrar kontrol edilir, **Then** aynı job için ikinci bir bildirim e-postası gönderilmez (tekrar bildirim spam'i önlenir).
3. **Given** hiçbir admin kullanıcının e-posta adresi bulunamazsa, **When** bildirim gönderilmeye çalışılır, **Then** sistem sessizce hata vermez, durum yine de mevcut panelde görünür kalır (mevcut davranış korunur).

---

### User Story 5 - Bir Super Admin, artık iletişim kurulmaması gereken bir kişinin kişisel verilerini kalıcı olarak anonimleştirebilir (Priority: P3)

Bir Super Admin, bir contact kaydını sadece pasif hale getirmek (deactivate) yerine, o kişinin e-posta/WhatsApp numarası gibi kişisel verilerini geri döndürülemez şekilde kaldırabilir — GDPR gibi veri koruma taleplerine (ör. "verilerimi sil") yanıt vermek için.

**Why this priority**: PRD'nin açık bir gereksinimi (MHEWS-SD-CONTACT-06), ama düşük sıklıkta kullanılan, riski en düşük idari bir aksiyon — diğer 4 kalemden bağımsız, en son sıraya konabilir.

**Independent Test**: Bir Super Admin bir contact için "Anonimleştir" aksiyonunu tetikler; contact kaydının artık okunabilir bir email/whatsapp_number taşımadığı, ama geçmiş dispatch_receipts kayıtlarının (audit/hash-zinciri bütünlüğü için) bozulmadığı doğrulanır.

**Acceptance Scenarios**:

1. **Given** bir contact kaydı, **When** bir Super Admin "Anonimleştir" aksiyonunu tetikler, **Then** contact'ın email/whatsapp_number alanları geri döndürülemez şekilde temizlenir/hashlenir ve kayıt `is_active=false` olur.
2. **Given** anonimleştirilmiş bir contact, **When** gelecekteki bir CAP broadcast'i eşleştirme yapmaya çalışır, **Then** bu contact hiçbir kanaldan mesaj almaz (zaten inactive olduğu için mevcut davranışla tutarlı).
3. **Given** bir contact anonimleştirildikten sonra, **When** geçmiş `dispatch_receipts`/`audit_log` kayıtları incelenir, **Then** bu kayıtlar bozulmadan kalır (anonimleştirme sadece `contacts` tablosundaki canlı PII alanlarını etkiler, geçmiş denetim izini silmez).
4. **Given** anonimleştirme aksiyonu, **When** tetiklenir, **Then** bu aksiyonun kendisi mevcut audit trigger'ı (`log_table_change()`) tarafından otomatik olarak loglanır (yeni bir loglama mekanizması gerekmez).

---

### Edge Cases

- Bir CAP taslağının `translations` alanı tamamen boşsa (`{}`): tüm alıcılar orijinal dilde e-posta alır (US1 Senaryo 2'nin genel hali).
- Otomatik retry mekanizması çalışırken aynı anda operatör manuel retry tetiklerse: aynı satır için çakışan iki deneme olmaması, mevcut `queued`/`failed`/`bounced` durum makinesinin (spec 009) bu çakışmayı zaten engellediği varsayılır.
- Bir contact hem e-postadan çıkmış hem WhatsApp'tan aktifse: sadece e-posta kanalı hariç tutulur, WhatsApp mesajları almaya devam eder.
- Admin bildirim e-postası göndermeye çalışırken bu e-postanın kendisi de başarısız olursa: sonsuz bir bildirim döngüsü oluşturmaz (bildirim e-postaları için otomatik retry/admin-bildirimi tetiklenmez).
- Anonimleştirilmiş bir contact için CSV toplu içe aktarma ile aynı email tekrar eklenmeye çalışılırsa: yeni, ayrı bir contact kaydı olarak değerlendirilir (mevcut CSV import mantığı korunur).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, bir e-posta dispatch edilirken, alıcının tercih ettiği dilde CAP taslağının bir çevirisi mevcutsa, e-posta içeriğini o dilde oluşturmalıDIR.
- **FR-002**: Sistem, alıcının tercih ettiği dilde bir çeviri mevcut değilse, e-postayı CAP'in orijinal/varsayılan dilindeki içerikle oluşturmalıDIR (hata vermemeli).
- **FR-003**: Sistem, her e-posta dispatch'ine, alıcının oturum açmadan tıklayabileceği bir "abonelikten çık" linki eklemelidir.
- **FR-004**: Bu linke tıklandığında sistem, o alıcıyı e-posta kanalından kalıcı olarak hariç tutmalı, işlem idempotent olmalı (ikinci tıklama hata vermemeli).
- **FR-005**: Abonelikten çıkma işlemi sadece e-posta kanalını etkilemeli, alıcının diğer kanallardaki (WhatsApp) durumunu değiştirmemelidir.
- **FR-006**: Sistem, geçici nedenlerle başarısız olan bir dispatch alıcısını, operatör müdahalesi olmadan, sınırlı sayıda ve artan aralıklarla otomatik olarak yeniden denemelidir.
- **FR-007**: Sistem, azami otomatik deneme sayısına ulaşan bir kaydı bir daha otomatik denememeli, ama operatörün manuel yeniden deneme aksiyonu için kullanılabilir bırakmalıDIR.
- **FR-008**: Operatörün manuel yeniden deneme aksiyonu, otomatik deneme sayacını sıfırlamalıDIR.
- **FR-009**: Bir dispatch job'ı tüm otomatik denemelerden sonra hâlâ tamamen başarısızsa, sistem ilgili ülke/organizasyonun en az bir yönetici kullanıcısına bir bildirim göndermelidir.
- **FR-010**: Sistem, aynı dispatch job'ı için birden fazla bildirim göndermemelidir (tekrar bildirim engellenmeli).
- **FR-011**: Sistem, bir Super Admin'in bir contact kaydının kişisel verilerini (email, WhatsApp numarası) geri döndürülemez şekilde anonimleştirmesine izin vermelidir.
- **FR-012**: Anonimleştirme işlemi, contact'ın geçmiş dispatch/denetim kayıtlarının bütünlüğünü bozmamalıDIR.
- **FR-013**: Anonimleştirilmiş bir contact, gelecekteki hiçbir dispatch eşleştirmesinde yer almamalıDIR.

### Key Entities

- **Contact (mevcut, genişletilmiş davranış)**: `preferred_language` artık dispatch'te kullanılıyor; yeni bir "e-postadan çıktı" durumu (kanal-özgü) ve bir "anonimleştirildi" durumu eklenir.
- **Dispatch Receipt (mevcut, genişletilmiş davranış)**: otomatik retry deneme sayısı ve backoff zamanlaması için ek bir izleme alanı.
- **Dispatch Job Bildirimi (yeni, kalıcı olmayabilir)**: bir job için bildirim gönderilip gönderilmediğini izleyen bir işaret (tekrar bildirimi önlemek için).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tercih dili için çevirisi mevcut bir CAP broadcast edildiğinde, alıcıların %100'ü o dildeki içeriği alır.
- **SC-002**: Bir e-postadaki unsubscribe linkine tıklayan alıcıların %100'ü, sonraki dispatch'lerde artık e-posta almaz.
- **SC-003**: Geçici bir nedenle başarısız olan bir dispatch alıcısının, operatör hiçbir işlem yapmadan otomatik olarak yeniden denendiği oranı %100'dür (azami deneme sayısına kadar).
- **SC-004**: Tamamen başarısız bir dispatch job'ı için, ilgili yöneticiye bildirim gönderilme oranı %100, tekrar bildirim oranı %0'dır (aynı job için).
- **SC-005**: Bir Super Admin, tek bir aksiyonla bir contact'ın kişisel verilerini anonimleştirebilir ve işlemin sonucunu anında görebilir.

## Assumptions

- "Abonelikten çık" işlemi, mevcut `is_active` alanını değil, e-posta kanalına özgü ayrı bir durumu etkiler — çünkü `is_active=false` tüm kanalları (WhatsApp dahil) devre dışı bırakır, ama FR-005 unsubscribe'ın sadece e-postayı etkilemesini gerektiriyor (plan aşamasında kesin alan adı belirlenecek).
- Otomatik retry, mevcut `pg_cron`/`pg_net` desenine (spec 013/019/026) dayanır — gerçek zamanlı/anlık bir retry değil, periyodik bir zamanlanmış görev yeterlidir (YAGNI, PRD'nin "backoff" ifadesi periyodik artan-aralıklı deneme olarak yorumlanır).
- Admin bildirimi, mevcut email adapter'ı (Resend/SendGrid) kullanılarak gönderilir — yeni bir bildirim kanalı (SMS/push) gerekmez (Constitution'ın kanal kısıtına uygun).
- Anonimleştirme "hard delete" değildir — kayıt `contacts` tablosunda kalır (foreign key bütünlüğü ve denetim izi için), sadece PII alanları temizlenir/hashlenir.
- Bu spec, `dispatch_jobs`/`dispatch_receipts`/`cap_drafts`/`contacts` şemasının temel yapısını korur (additive: yeni kolonlar/tablolar eklenebilir, mevcut kolonlar kaldırılmaz).
