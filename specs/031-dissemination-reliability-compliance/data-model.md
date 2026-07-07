# Data Model: Dissemination Güvenilirliği ve Uyum

## Değişen Entity: `dispatch_receipts`

Kaynak: `supabase/migrations/20260707120100_dispatch_jobs_and_receipts.sql` (spec 009). Yeni kolon:

```sql
ALTER TABLE dispatch_receipts ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ;
```

- İlk gönderim ve her retry denemesinde (manuel veya otomatik) `NOW()` olarak set edilir.
- Otomatik retry'ın backoff hesaplamasının referans noktası (`shouldAutoRetryNow()`, research.md Decision 3).
- Mevcut `status`/`retry_count`/state machine hiç değişmez.

## Değişen Entity: `dispatch_jobs`

Yeni kolon:

```sql
ALTER TABLE dispatch_jobs ADD COLUMN IF NOT EXISTS admin_notified_at TIMESTAMPTZ;
```

- Bir job'ın tüm receipts'i kalıcı olarak başarısız kaldığında (retry_count azami sınıra ulaştığında) bir admin bildirimi gönderildiğinde set edilir — FR-010'un tekrar-bildirim-önleme garantisi.

## Değişen Entity: `contacts`

Şemaya yeni kolon YOK — `email_opt_in`/`whatsapp_opt_in` zaten mevcut (research.md Decision 1). Sadece mevcut CHECK constraint'i güncelleniyor:

```sql
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS chk_contact_has_channel;
ALTER TABLE contacts ADD CONSTRAINT chk_contact_has_channel
  CHECK (is_active = false OR email IS NOT NULL OR whatsapp_number IS NOT NULL);
```

(research.md Decision 7 — anonimleştirilmiş, `is_active=false` bir contact'ın artık iki alanı da NULL olabilir.)

## Yeni saf fonksiyonlar (Deno, `supabase/functions/shared/`)

### `emailLocalization.ts` — `resolveLocalizedContent(draft, preferredLanguage)`

```ts
interface LocalizableDraft {
  title: string
  description: string | null
  translations: Record<string, { title?: string; description?: string }> | null
}

function resolveLocalizedContent(draft: LocalizableDraft, preferredLanguage: string): { title: string; description: string | null }
```

- `draft.translations?.[preferredLanguage]` varsa ve `title` doluysa onu kullanır (description opsiyonel, yoksa orijinal description'a düşer).
- Yoksa `{ title: draft.title, description: draft.description }` döner.

### `dispatchBackoff.ts` — `shouldAutoRetryNow(receipt, now)`

```ts
interface RetriableReceipt {
  status: string
  retry_count: number
  last_attempted_at: string | null
}

const MAX_AUTO_RETRIES = 4
const BASE_BACKOFF_MINUTES = 15 // pg_cron'un kendi çalışma aralığıyla aynı

function shouldAutoRetryNow(receipt: RetriableReceipt, now: Date): boolean
```

- `receipt.status !== 'failed'` veya `receipt.retry_count >= MAX_AUTO_RETRIES` ise `false`.
- `last_attempted_at` null ise (hiç denenmemiş, olmaması gereken bir durum ama savunmacı) `true`.
- Aksi halde: gerekli bekleme dakikası = `BASE_BACKOFF_MINUTES * 2^retry_count`; `now - last_attempted_at` (dakika) bu değere eşit veya büyükse `true`.

## Frontend Değişikliği: `src/stores/contacts.js`

Yeni `anonymizeContact(id)` — mevcut `updateContact()`'ı çağırır:

```js
async function anonymizeContact(id) {
  return updateContact(id, { email: null, whatsapp_number: null, full_name: '[anonymized]', is_active: false });
}
```

## Frontend Değişikliği: `src/components/admin/ContactsPanel.vue`

Her contact satırına (Super Admin-only, `auth.isSuperAdmin` gated) bir "Anonimleştir" butonu — geri döndürülemez olduğunu vurgulayan bir onay adımı (`confirm()` veya mevcut modal deseni) sonrası `anonymizeContact(id)` çağırır.

## Contract Değişikliği: `dispatch-alert` Edge Function

Üçüncü bir mod eklenir — `contracts/dispatch-alert-auto-retry.md`'de detaylandırılmıştır.

## Yeni Contract: `unsubscribe` Edge Function

`contracts/unsubscribe.md`'de detaylandırılmıştır.
