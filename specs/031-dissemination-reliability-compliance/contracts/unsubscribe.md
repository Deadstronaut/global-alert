# Contract: `unsubscribe` Edge Function

**Pattern**: Doğrudan `ack-dispatch`'in (spec 017) bir kopyası — anon-callable, `verify_jwt=false`, her zaman 200+HTML döner, idempotent.

## Endpoint

`GET /functions/v1/unsubscribe?receipt_id={uuid}`

- `receipt_id`, gönderilen e-postadaki `dispatch_receipts.id`'ye karşılık gelir (ack linkiyle aynı kaynaktan — `buildEmailBody()`'nin zaten aldığı `receiptId` parametresi).

## Davranış

1. `receipt_id` eksik/geçersizse: "Bu link tanınmıyor." mesajıyla 200 HTML döner (hata değil).
2. `receipt_id` geçerliyse: `dispatch_receipts.contact_id`'yi bulur, o `contacts` satırının `email_opt_in`'ini `false` yapar (WHERE `email_opt_in = true` — idempotent, ikinci tıklamada 0 satır etkilenir, aynı mesaj gösterilir).
3. Her durumda (başarı, zaten-çıkmış, DB hatası) aynı onay mesajını gösterir — recipient'a asla bir uygulama hatası sızdırılmaz (ack-dispatch'in FR-006 deseniyle aynı).

## Yetkilendirme

Yok — anon-callable, `supabase/config.toml`'da `verify_jwt=false` (ack-dispatch ile aynı satır deseni).

## Yan etkiler

- Sadece `contacts.email_opt_in`'i etkiler — `whatsapp_opt_in`'e dokunmaz (FR-005).
- Mevcut `audit_contacts` trigger'ı bu güncellemeyi otomatik loglar (yeni loglama gerekmez).
