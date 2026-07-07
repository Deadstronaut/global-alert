# Quickstart: Dissemination Güvenilirliği ve Uyum

## Ön koşullar

- Migration uygulanmış olmalı (`npx supabase db push --linked`)
- `dispatch-alert` ve yeni `unsubscribe` Edge Function'ları deploy edilmiş olmalı
- En az bir test `contact` (preferred_language='tr' gibi) ve bir `translations` içeren `cap_draft`

## Senaryo 1: Dil lokalizasyonu

1. `deno test supabase/functions/shared/emailLocalization.test.ts` — `resolveLocalizedContent()` testlerini çalıştır: (a) çeviri varsa onu kullanma, (b) çeviri yoksa orijinale düşme.
2. Bir CAP taslağını `translations.tr` dolu şekilde broadcast et, `preferred_language='tr'` olan bir contact'a e-postanın Türkçe geldiğini doğrula.

## Senaryo 2: Unsubscribe

1. Bir e-postadaki unsubscribe linkine (`GET /functions/v1/unsubscribe?receipt_id=...`) tıkla/curl ile çağır, 200 HTML döndüğünü doğrula.
2. `contacts.email_opt_in`'in `false` olduğunu, `whatsapp_opt_in`'in ETKİLENMEDİĞİNİ doğrula (salt-okunur sorgu).
3. Aynı linke tekrar tıkla — aynı mesajın göründüğünü, hata olmadığını doğrula (idempotent).
4. O contact için yeni bir broadcast yap — e-posta artık gelmediğini (`matchesContact` zaten `email_opt_in` kontrol ediyor) doğrula.

## Senaryo 3: Otomatik retry

1. `deno test supabase/functions/shared/dispatchBackoff.test.ts` — `shouldAutoRetryNow()` testlerini çalıştır.
2. Bir `dispatch_receipts` satırını manuel olarak `status='failed', retry_count=0, last_attempted_at=NOW()-16 dakika` yap (transactional test, ROLLBACK ile).
3. `dispatch-alert`'i `{ "auto_retry": true }` ile (service-role key) çağır, satırın yeniden denendiğini (`retry_count=1`, `last_attempted_at` güncellendi) doğrula.
4. Aynı satırı `retry_count=4` yap, tekrar çağır — artık denenmediğini doğrula.

## Senaryo 4: Admin bildirimi

1. Bir `dispatch_jobs`'un tüm receipts'ini `retry_count=4, status='failed'` yap (transactional test).
2. `auto_retry` modunu çağır, ilgili ülkenin bir admin'ine bildirim e-postası gittiğini (mock/test email adapter logunda) doğrula, `admin_notified_at`'in set edildiğini doğrula.
3. Aynı modu tekrar çağır — ikinci bir bildirim GİTMEDİĞİNİ doğrula (idempotent).

## Senaryo 5: GDPR anonimizasyonu

1. Bir Super Admin olarak ContactsPanel.vue'da bir contact için "Anonimleştir" aksiyonunu tetikle.
2. Contact'ın `email`/`whatsapp_number`'ının NULL, `is_active`'in `false` olduğunu doğrula.
3. O contact'a ait geçmiş `dispatch_receipts`/`audit_log` kayıtlarının bozulmadığını (hâlâ mevcut olduğunu) doğrula.

## Senaryo 6: Regresyon kontrolü

1. `npm run test` (tüm suite) — mevcut testlerin bozulmadığını doğrula.
2. `npm run build` — temiz build.
3. Mevcut manuel "Tekrar Dene" akışının (DispatchPanel.vue) hâlâ çalıştığını, artık `retry_count`'u sıfırladığını doğrula.
