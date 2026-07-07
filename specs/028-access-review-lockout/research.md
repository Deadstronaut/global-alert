# Research: Erişim İnceleme Raporu ve Hesap Kilitleme

## Decision 1: Kilit kontrolü nerede uygulanır — DB trigger mi, RLS mi, uygulama katmanı mı?

**Decision**: Kilit kontrolü tamamen uygulama katmanında (client `auth.js`'in `login()` fonksiyonu içinde), Supabase Auth'un kendi `signInWithPassword` çağrısından SONRA uygulanır. `current_profile_role()` fonksiyonu DEĞİŞTİRİLMEZ.

**Rationale**: `signInWithPassword` Supabase Auth'un kendi iç mekanizmasıdır ve şifre doğruysa her zaman geçerli bir aal1 oturumu verir — bunu DB tarafında engellemenin bir yolu yok (RLS, PostgREST'e giden sorguları kısıtlar, Supabase Auth'un kendi endpoint'ini değil). Mevcut `is_active` (askıya alma) mekanizması zaten bu deseni kullanıyor: `current_profile_role()` `is_active=false` iken NULL döner, bu da her RLS-korumalı sorguyu sessizce engeller, ama oturumun kendisi hâlâ oluşur. Kilitleme için aynı yaklaşımı `current_profile_role()`'a taşımak (locked_until kontrolü eklemek) mümkün olurdu, ama FR-005 açıkça "kullanıcıya... bildirilmelidir" diyor — sessiz bir RLS engeli yeterli değil, kullanıcıya net bir mesaj gösterilmeli. Bu yüzden `login()` içinde explicit bir kontrol (auth başarılı olduktan hemen sonra `locked_until` okunur, kilitliyse `signOut()` + net hata) daha doğru.

**Alternatives considered**:
- `current_profile_role()`'u genişletmek (is_active deseniyle aynı) — reddedildi: sessiz RLS engeli FR-005'in "bildirilmelidir" gereksinimini karşılamaz, ayrıca bu paylaşılan fonksiyonu genişletmek daha geniş bir blast radius yaratır (~50+ RLS policy'yi etkiler).
- Bir Postgres trigger'ı `auth.users` üzerinde (sign-in denemelerini yakalamak için) — reddedildi: `auth.users` Supabase'in içsel şeması, buraya trigger eklemek desteklenmeyen/kırılgan bir yaklaşım (Supabase upgrade'lerinde bozulma riski), proje hiçbir yerde bunu yapmıyor.

## Decision 2: Erişim İnceleme Raporu — yeni bir tablo/pg_cron mu, canlı sorgu mu?

**Decision**: Yeni bir rapor tablosu veya zamanlanmış üretim YOK — `get_access_review()` SECURITY DEFINER fonksiyonu, çağrıldığı anda `profiles` + `profile_capability_grants` + `auth.users.last_sign_in_at`'ı canlı olarak birleştirip döner.

**Rationale**: `compliance_reports`/`incident_reports` deseni (spec 019/026) TARİHSEL/periyodik bir anlık görüntüyü kalıcı olarak saklamak için var (örn. "geçen haftanın özeti", tekrar hesaplanamaz çünkü zaman geçmiş). Erişim İnceleme Raporu ise "şu anda kim hangi role/yetkiye sahip" sorusuna cevap veriyor — bu her zaman "şu an"ın doğru cevabıdır, geçmiş bir dönemin özeti değil. Bu yüzden saklamaya gerek yok, her çağrıda taze veri dönmesi daha doğru (ve daha basit — YAGNI).

**Alternatives considered**: `compliance_reports` deseninin birebir kopyası (yeni `access_review_reports` tablosu + haftalık pg_cron) — reddedildi, gereksiz karmaşıklık: kullanıcı listesi zaten `profiles` tablosunda güncel duruyor, "geçmiş bir anki" görünümüne ihtiyaç yok (PRD'nin "periyodik rapor" ifadesi, admin'in istediği zaman erişebildiği bir görünüm olarak yorumlandı, otomatik zamanlanmış üretim olarak değil).

## Decision 3: `auth.users.last_sign_in_at`'a nasıl erişilir?

**Decision**: `get_access_review()` SECURITY DEFINER fonksiyonu içinde doğrudan `auth.users` tablosuna `LEFT JOIN` yapılır.

**Rationale**: `auth` şeması PostgREST'e (yani doğrudan client sorgularına) açık değildir, ama bir SECURITY DEFINER Postgres fonksiyonu içindeki düz SQL, PostgREST'in şema kısıtlamalarından etkilenmez — fonksiyon Postgres içinde çalışır, `auth.users`'ı normal bir tablo gibi sorgulayabilir (yeterli yetkiye sahip bir rol olarak tanımlandığı sürece). Bu, credential/parola gibi hassas alanlara DOKUNMADAN sadece `last_sign_in_at` gibi zararsız bir meta-veriyi okumak için minimal, dar kapsamlı bir erişim.

**Alternatives considered**: `profiles` tablosuna bir `last_login_at` kolonu ekleyip bunu login() akışında client'tan güncellemek — reddedildi: `auth.users.last_sign_in_at` zaten bu bilgiyi tutuyor (Supabase Auth'un kendi native alanı), onu tekrarlamak (duplicate source of truth) gereksiz senkronizasyon riski yaratır; doğrudan okumak daha basit ve her zaman doğru.

## Decision 4: Frontend'de yeni bir saf fonksiyon/test dosyası gerekiyor mu?

**Decision**: Hayır — bu spec'in mantığının büyük kısmı (kilit kontrolü, sayaç artırma/sıfırlama, yetki kontrolü) SQL fonksiyonlarında yaşıyor; client tarafı sadece bu fonksiyonları çağırıp sonucu gösteriyor (state/computed mantığı yok, saf/test edilebilir bir dönüşüm fonksiyonu gerektirmiyor). Rapor tablosundaki satırların biçimlendirilmesi (örn. "son giriş: X" veya "—") basit bir template ifadesi, ayrı bir dosyaya çıkarılacak kadar karmaşık değil.

**Rationale**: Proje convention'ı (`formatIntegrationStatus`, `computeFalseAlarmRate` gibi) saf fonksiyonları GERÇEKTEN test edilmeye değer mantık için ayırıyor — burada öyle bir mantık yok, zorla bir soyutlama eklemek YAGNI'ye aykırı olurdu.

**Alternatives considered**: Kilit süresinin "kalan dakika" gösterimi için bir `formatLockRemaining()` saf fonksiyonu — değerlendirildi ama basit bir `Math.ceil((new Date(lockedUntil) - Date.now()) / 60000)` ifadesinin ayrı bir dosya+test gerektirecek kadar karmaşık olmadığına karar verildi; template içinde inline hesaplanabilir.

## Decision 5: Eşik/süre sabitleri nereye konur?

**Decision**: `FAILED_LOGIN_THRESHOLD = 5` ve `LOCKOUT_DURATION_MINUTES = 15` sabitleri, `record_failed_login()` SQL fonksiyonunun içine gömülür (migration dosyasında).

**Rationale**: Spec Assumptions'ta netleştirildiği gibi, "yapılandırılabilir" ifadesi bu projenin diğer benzer kararlarıyla (spec 019/026'daki sabit periyotlar) tutarlı olarak "admin tarafından çalışma zamanında değiştirilemez ama makul bir sabit" olarak yorumlandı. Bir ayarlar tablosu eklemek (örn. `system_settings`) bu spec'in kapsamını gereksiz büyütür.

**Alternatives considered**: Bir `system_settings` tablosunda saklamak (admin panelinden değiştirilebilir) — reddedildi, YAGNI; şu an gerçek bir talep yok, ileride gerekirse ayrı bir spec'te eklenebilir.
