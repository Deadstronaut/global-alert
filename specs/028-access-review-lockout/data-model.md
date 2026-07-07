# Data Model: Erişim İnceleme Raporu ve Hesap Kilitleme

## Değişen Entity: Profile (`profiles` tablosu)

Kaynak: `supabase/migrations/20260603120000_profiles.sql` (spec 004), `20260706130100_profile_suspension.sql` (is_active). Bu spec 2 yeni nullable/default kolon ekler (additive, idempotent):

| Yeni Alan | Tip | Varsayılan | Açıklama |
|---|---|---|---|
| `failed_login_attempts` | INTEGER | `0` | Ardışık başarısız giriş denemesi sayacı. Başarılı girişte veya manuel unlock'ta sıfırlanır. |
| `locked_until` | TIMESTAMPTZ | `NULL` | Doluysa ve gelecekteyse hesap kilitli sayılır. Süre dolunca veya manuel unlock'ta `NULL`'a döner. |

Mevcut `users_read_own_profile` RLS policy'si (`auth.uid() = id`, tüm kolonları kapsar) bu yeni kolonların kullanıcının kendi login() akışında okunabilmesini otomatik sağlar — RLS değişikliği gerekmez.

## Yeni SECURITY DEFINER Fonksiyonlar (tek migration dosyasında)

### `record_failed_login(p_email TEXT) RETURNS void`

- **Çağıran**: `anon` + `authenticated` (login formu henüz oturum açmamış bir istemciden çağrılır)
- **Davranış**: `p_email` ile eşleşen `profiles` satırının `failed_login_attempts`'ini 1 artırır; yeni değer eşiğe (5) ulaşır/geçerse `locked_until = NOW() + INTERVAL '15 minutes'` ayarlar. Eşleşen satır yoksa sessizce hiçbir şey yapmaz (hesap var/yok bilgisini ifşa etmez — Edge Case). **Not (bilinçli tasarım)**: eşik aşıldıktan sonra, kilit süresi devam ederken gelen her yeni başarısız deneme `locked_until`'i tekrar `NOW() + 15dk`'ya uzatır — bu, saldırganın süreyi bekleyip tam o anda tekrar denemesini engelleyen kasıtlı bir davranıştır, hata değildir.
- **Güvenlik**: `SET search_path = public`; sadece bu iki kolonu değiştirir, başka hiçbir alana dokunmaz, hiçbir veri döndürmez.

### `clear_own_login_lock() RETURNS void`

- **Çağıran**: `authenticated` (sadece kendi `auth.uid()` satırını hedefler)
- **Davranış**: Çağıranın kendi `profiles` satırında `failed_login_attempts = 0, locked_until = NULL` ayarlar.
- **Kullanım noktası**: `login()` akışında, şifre doğru olduğu VE hesap kilitli olmadığı doğrulandıktan SONRA çağrılır (sırayla: locked_until kontrolü → eğer kilitli değilse clear → devam).

### `unlock_profile(p_profile_id UUID) RETURNS void`

- **Çağıran**: `authenticated`, sadece `current_profile_role() = 'super_admin'` (fonksiyon içi kontrol, yoksa exception)
- **Davranış**: Hedef profildeki `failed_login_attempts = 0, locked_until = NULL` ayarlar (FR-007).

### `get_access_review() RETURNS TABLE(...)`

- **Çağıran**: `authenticated`, sadece `current_profile_role() = 'super_admin'`
- **Dönen alanlar**: `profile_id, email, role, country_code, org_id, is_active, capabilities (text[]), last_sign_in_at, created_at`
- **Davranış**: `profiles` ⟕ `profile_capability_grants` (capability'leri `array_agg` ile birleştirir) ⟕ `auth.users` (sadece `last_sign_in_at`) — hiçbir hassas auth alanı (şifre hash'i, vs.) DÖNMEZ.

## Frontend Değişiklikleri

### `src/stores/auth.js` — `login()` fonksiyonu

Yeni akış (sıralı):
1. `signInWithPassword()` — hata varsa `record_failed_login(email)` çağrılır (hata yutulur, kullanıcıya orijinal auth hatası gösterilir), sonra fırlatılır.
2. Başarılıysa: kendi `profiles` satırından `locked_until` okunur (mevcut `users_read_own_profile` RLS'i zaten izin veriyor).
3. `locked_until` gelecekteyse: `signOut()` çağrılır, kilitli olduğunu belirten özel bir hata fırlatılır (kalan süre bilgisiyle).
4. Kilitli değilse: `clear_own_login_lock()` çağrılır (sayaç sıfırlanır), mevcut MFA/AAL kontrolü ve `loadProfile()` akışı DEĞİŞMEDEN devam eder.

### `src/views/AdminView.vue` — mevcut Kullanıcılar tablosu

Mevcut `loadUsers()`/tablo (satır ~95-100, ~907-939) genişletilir:
- Yeni "Son Giriş" kolonu (`get_access_review()`'dan `last_sign_in_at`, yoksa "—")
- Yeni "Kilit Durumu" kolonu (`locked_until` gelecekteyse "🔒 Kilitli (HH:MM'e kadar)", değilse boş)
- Kilitli bir satır için "Kilidi Aç" aksiyon butonu (`unlock_profile()` çağırır, mevcut suspend/reactivate butonlarıyla aynı desende)
- "Dışa Aktar" butonu (mevcut Denetim sekmesindeki `rowsToCsv`/`rowsToJson`/`triggerDownload` yardımcı fonksiyonları import edilip yeniden kullanılır, FR-003)

`loadUsers()`, mevcut düz `profiles` sorgusu yerine (veya onun yanında) `get_access_review()` RPC'sini çağıracak şekilde güncellenir — tek sorguda hem mevcut kolonlar hem yeni alanlar (capabilities, last_sign_in_at) gelir, ayrı bir capability-grants sorgusuna gerek kalmaz.
