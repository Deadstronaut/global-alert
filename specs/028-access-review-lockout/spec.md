# Feature Specification: Erişim İnceleme Raporu ve Hesap Kilitleme

**Feature Branch**: `028-access-review-lockout`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "PRD'nin (docs/mhewsprd.md) standartlaştırılmış gereksinim listesinde açıkça yer alan ama hiç yapılmamış iki kalem: (1) Erişim İnceleme Raporu — tüm kullanıcı hesaplarını ve rollerini/izinlerini listeleyen periyodik rapor. (2) Hesap Kilitleme — yapılandırılabilir başarısız giriş denemesi sayısından sonra hesabı yapılandırılabilir bir süre kilitleme (NIST SP 800-92 referanslı)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Super Admin tüm kullanıcıların rol/izin durumunu tek bir raporda görür (Priority: P1) 🎯 MVP

Bir Super Admin, periyodik bir güvenlik incelemesi yaparken, sistemdeki tüm kullanıcı hesaplarını, rollerini, ülke/organizasyon kapsamını, sahip oldukları ek yetkileri (capability grants) ve en son giriş zamanlarını tek bir görünümde inceleyebilir; bu listeyi CSV/JSON olarak dışa aktarabilir.

**Why this priority**: Bu, PRD'nin standartlaştırılmış gereksinimlerinden biri (Req 1) ve tek başına değer sağlayan, salt-okunur, düşük riskli bir özellik — Hesap Kilitleme'nin (login akışına dokunan, daha riskli) uygulanmasını beklemeden teslim edilebilir.

**Independent Test**: Super Admin hesabıyla giriş yapılır, yeni "Erişim İnceleme Raporu" görünümü açılır, tüm kullanıcıların rol/ülke/yetki/son giriş bilgilerinin listelendiği doğrulanır, CSV/JSON dışa aktarım denenir. Diğer kullanıcı hikayesinden tamamen bağımsız test edilebilir.

**Acceptance Scenarios**:

1. **Given** sistemde birden fazla kullanıcı profili (farklı roller, bazılarına ek yetki verilmiş) varken, **When** bir Super Admin "Erişim İnceleme Raporu" görünümünü açar, **Then** her kullanıcı için e-posta, rol, ülke/organizasyon, sahip olduğu ek yetkiler (varsa), aktif/askıya alınmış durumu ve en son giriş zamanı (varsa) listelenir.
2. **Given** açık rapor görünümü, **When** Super Admin dışa aktarımı tetikler, **Then** mevcut audit export mekanizmasıyla aynı şekilde CSV veya JSON dosyası indirilir.
3. **Given** Super Admin olmayan bir kullanıcı (Country Admin, Org Admin, Viewer), **When** bu kullanıcı raporu görüntülemeye çalışır, **Then** erişim reddedilir (mevcut Denetim sekmesiyle aynı super_admin-only kısıtlama).
4. **Given** hiç giriş yapmamış bir kullanıcı profili, **When** rapor oluşturulur, **Then** o kullanıcı için "en son giriş" alanı boş/"—" olarak gösterilir, hata vermez.

---

### User Story 2 - Sistem, tekrarlanan başarısız giriş denemelerinden sonra hesabı geçici olarak kilitler (Priority: P2)

Bir hesaba karşı art arda birden fazla başarısız giriş denemesi yapıldığında (yanlış şifre), sistem o hesabı belirli bir süre için otomatik olarak kilitler; bu süre boyunca doğru şifre girilse bile giriş engellenir ve kullanıcıya hesabının geçici olarak kilitli olduğu bildirilir. Süre dolduğunda veya bir Super Admin hesabı manuel olarak kilidini açtığında, hesap normal şekilde tekrar kullanılabilir hale gelir.

**Why this priority**: Güvenlik açısından önemli (NIST SP 800-92 referanslı, brute-force koruması) ama login akışına dokunduğu için P1'e göre daha dikkatli bir implementasyon gerektirir; Erişim İnceleme Raporu'nun teslimini engellememesi için P2 olarak sıralandı.

**Independent Test**: Bir test hesabına kasıtlı olarak eşik sayıda yanlış şifre girilir, hesabın kilitlendiği ve doğru şifreyle bile girişin reddedildiği doğrulanır; kilit süresi geçtikten sonra (veya Super Admin manuel açtıktan sonra) girişin tekrar çalıştığı doğrulanır. User Story 1'den bağımsız test edilebilir.

**Acceptance Scenarios**:

1. **Given** bir kullanıcı hesabı kilitli değilken, **When** art arda eşik sayıda (varsayılan 5) başarısız giriş denemesi yapılır, **Then** hesap belirli bir süre (varsayılan 15 dakika) için kilitlenir.
2. **Given** bir hesap kilitliyken, **When** doğru e-posta/şifre ile giriş denenir, **Then** giriş reddedilir ve kullanıcıya hesabının geçici olarak kilitli olduğu ve ne zaman tekrar deneyebileceği bildirilir.
3. **Given** kilit süresi dolmuşken, **When** kullanıcı doğru bilgilerle tekrar giriş dener, **Then** giriş normal şekilde başarılı olur ve başarısız deneme sayacı sıfırlanır.
4. **Given** bir hesap kilitliyken, **When** bir Super Admin o hesabın kilidini AdminView'daki Kullanıcılar listesinden manuel olarak açar, **Then** hesap süre dolmadan önce bile tekrar kullanılabilir hale gelir.
5. **Given** eşik altında (örn. 2) başarısız deneme yapılmış bir hesap, **When** kullanıcı doğru şifreyi girer, **Then** giriş başarılı olur ve başarısız deneme sayacı sıfırlanır (hesap kilitlenmez).

---

### Edge Cases

- Var olmayan bir e-posta ile giriş denemesi: sistem hesabın var olup olmadığını ifşa etmemeli (mevcut Supabase Auth davranışıyla tutarlı, genel bir hata mesajı).
- Zaten askıya alınmış (is_active=false) bir hesaba başarısız giriş denemeleri: kilitleme sayacı yine de artabilir ama askıya alma zaten girişi engellediği için pratik bir etkisi olmaz — iki mekanizma çakışmaz, birbirinden bağımsız çalışır.
- Bir Super Admin kendi hesabını kilitlerse (kendi şifresini art arda yanlış girerse): başka bir Super Admin'in manuel kilit açması gerekir; sistemde tek bir Super Admin varsa bu durum desteğe başvurmayı gerektirir (bilinçli, düşük olasılıklı bir risk — mevcut askıya alma mekanizmasında da aynı sınırlama var).
- Rapor oluşturulurken bir kullanıcının `auth.users` kaydı bulunamazsa (silinmiş ama profile kaydı kalmışsa): o satır için "en son giriş" alanı boş gösterilir, rapor oluşturma başarısız olmaz.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, Super Admin rolündeki kullanıcılara, tüm kullanıcı profillerini (e-posta, rol, ülke/organizasyon, ek yetkiler, aktif/askıya-alınmış durumu, en son giriş zamanı) listeleyen bir Erişim İnceleme Raporu görünümü sunmalıdır.
- **FR-002**: Erişim İnceleme Raporu, Super Admin olmayan hiçbir role görünür olmamalıdır.
- **FR-003**: Kullanıcılar Erişim İnceleme Raporu'nu mevcut denetim export mekanizmasıyla aynı şekilde CSV veya JSON olarak dışa aktarabilmelidir.
- **FR-004**: Sistem, bir hesaba karşı yapılandırılmış eşik sayıda ardışık başarısız giriş denemesinden sonra o hesabı yapılandırılmış bir süre için kilitlemelidir.
- **FR-005**: Kilitli bir hesaba doğru kimlik bilgileriyle yapılan giriş denemeleri de reddedilmeli ve kullanıcıya hesabının geçici olarak kilitli olduğu bildirilmelidir.
- **FR-006**: Başarılı bir giriş, o hesabın başarısız giriş deneme sayacını sıfırlamalıdır.
- **FR-007**: Bir Super Admin, kilitli bir hesabın kilidini süre dolmadan önce manuel olarak açabilmelidir.
- **FR-008**: Kilit süresi dolduğunda hesap otomatik olarak tekrar kullanılabilir hale gelmelidir (manuel müdahale gerekmeden).
- **FR-009**: Hesap kilitleme mekanizması, mevcut hesap askıya alma (suspension) mekanizmasından bağımsız çalışmalı ve onunla çakışmamalıdır.

### Key Entities

- **Kullanıcı Profili (Profile)**: Mevcut varlık (spec 004) — bu spec, başarısız giriş sayacı ve kilit bitiş zamanı bilgisini taşıyacak şekilde genişletilir.
- **Yetki Tanımı (Capability Grant)**: Mevcut varlık (spec 018) — Erişim İnceleme Raporu'nda her kullanıcının sahip olduğu ek yetkileri göstermek için okunur.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bir Super Admin, Erişim İnceleme Raporu'nu açtıktan sonra 3 saniye içinde tüm kullanıcıların rol/yetki durumunu görebilir.
- **SC-002**: Sistemdeki kullanıcıların %100'ü (rol fark etmeksizin) için rapor aynı alan setini (rol, ülke, yetki, son giriş, durum) tutarlı şekilde gösterir.
- **SC-003**: Eşik sayıda başarısız denemeden sonra hesap girişleri %100 oranında reddedilir (kilitleme atlanamaz).
- **SC-004**: Kilit süresi dolduktan sonra doğru kimlik bilgileriyle yapılan girişlerin %100'ü başarılı olur (kilit süresiz kalmaz).

## Assumptions

- "Yapılandırılabilir" ifadesi (PRD metninde), bu projenin diğer benzer gereksinimlerinde (spec 019/026'daki sabit haftalık/yıllık rapor periyodu kararlarıyla tutarlı olarak) çalışma zamanında admin tarafından değiştirilebilir bir ayar değil, sabit ama makul varsayılan değerler (5 başarısız deneme, 15 dakika kilit süresi — NIST SP 800-63B'nin yaygın önerileriyle uyumlu) olarak yorumlanmıştır. Gelecekte gerçek bir ihtiyaç ortaya çıkarsa admin-yapılandırılabilir hale getirilebilir.
- Erişim İnceleme Raporu, `compliance_reports`/`incident_reports` gibi periyodik/tarihsel bir anlık görüntü DEĞİL, sistemin "şu anki" durumunu gösteren canlı bir sorgu görünümüdür — bu yüzden yeni bir rapor tablosu veya zamanlanmış (pg_cron) üretim gerektirmez, mevcut Kullanıcılar (Users) admin panelinin bir uzantısı/varyantı olarak ele alınır.
- Hesap kilitleme, Supabase Auth'un kendi oturum açma mekanizmasını (`signInWithPassword`) DEĞİŞTİRMEZ — kilit kontrolü, kimlik doğrulama sonrası (post-auth) profil yükleme aşamasında uygulanır, mevcut `is_active` (askıya alma) kontrolünün aynı noktada uygulandığı desenle tutarlı.
- Başarısız giriş denemesi sayacının güncellenmesi, kimlik doğrulanmamış (anon) bir istemciden çağrılabilen dar kapsamlı bir SECURITY DEFINER fonksiyon aracılığıyla yapılır (mevcut `ack-dispatch` Edge Function'ının anon-callable-ama-dar-yetkili deseniyle tutarlı) — bu fonksiyon sadece ilgili sayaç/kilit alanlarını günceller, başka hiçbir veriye erişim/değişiklik sağlamaz.
- IP bazlı hız sınırlama (rate limiting) veya CAPTCHA bu spec'in kapsamı dışındadır — sadece hesap-bazlı deneme sayacı ele alınır (PRD'nin metniyle tutarlı, "user accounts" diyor, IP değil).
