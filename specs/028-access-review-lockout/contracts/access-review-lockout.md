# Contract: Erişim İnceleme Raporu ve Hesap Kilitleme

Bu spec dış bir HTTP API yayınlamıyor — sözleşmeler Supabase RPC (Postgres fonksiyonu) çağrıları olarak tanımlanır, `supabase-js`'in `.rpc()` metoduyla çağrılır.

## `record_failed_login(p_email TEXT) → void`

- **Rol**: `anon`, `authenticated`
- **Girdi**: `p_email` (denenen giriş e-postası)
- **Çıktı**: Yok (her zaman başarılı döner, hesap var/yok bilgisini asla ifşa etmez)
- **Yan etki**: Eşleşen `profiles` satırının `failed_login_attempts`'i +1; eşik (5) aşılırsa `locked_until = NOW() + 15dk`

## `clear_own_login_lock() → void`

- **Rol**: `authenticated` (sadece kendi `auth.uid()` satırı)
- **Girdi**: Yok
- **Çıktı**: Yok
- **Yan etki**: Çağıranın kendi satırında `failed_login_attempts=0, locked_until=NULL`

## `unlock_profile(p_profile_id UUID) → void`

- **Rol**: `authenticated`, sadece `current_profile_role() = 'super_admin'` (aksi halde exception)
- **Girdi**: `p_profile_id`
- **Çıktı**: Yok
- **Yan etki**: Hedef profilde `failed_login_attempts=0, locked_until=NULL`

## `get_access_review() → TABLE(profile_id UUID, email TEXT, role TEXT, country_code TEXT, org_id UUID, is_active BOOLEAN, capabilities TEXT[], last_sign_in_at TIMESTAMPTZ, created_at TIMESTAMPTZ)`

- **Rol**: `authenticated`, sadece `current_profile_role() = 'super_admin'` (aksi halde exception)
- **Girdi**: Yok
- **Çıktı**: Her profil için bir satır, `email` alfabetik sıralı
- **Yan etki**: Yok (salt-okunur)

## Client Kullanımı (auth.js `login()` akışı)

```js
const { data, error } = await supabase.auth.signInWithPassword({ email, password })
if (error) {
  await supabase.rpc('record_failed_login', { p_email: email }).catch(() => {})
  throw error
}

const { data: own } = await supabase.from('profiles').select('locked_until').eq('id', data.user.id).maybeSingle()
if (own?.locked_until && new Date(own.locked_until) > new Date()) {
  await supabase.auth.signOut()
  throw new Error('account_locked') // lockedUntil own.locked_until olarak UI'a taşınır
}

await supabase.rpc('clear_own_login_lock').catch(() => {})
// ...mevcut MFA/AAL kontrolü ve loadProfile() değişmeden devam eder...
```

## Client Kullanımı (AdminView.vue Kullanıcılar tablosu)

```js
const { data, error } = await supabase.rpc('get_access_review')
// data: [{ profile_id, email, role, country_code, org_id, is_active, capabilities, last_sign_in_at, created_at }, ...]

// Kilidi açma:
await supabase.rpc('unlock_profile', { p_profile_id: row.profile_id })

// Dışa aktarma (mevcut Denetim sekmesi yardımcıları):
triggerDownload(rowsToCsv(data), 'erisim-inceleme-raporu.csv')
```
