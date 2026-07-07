# Contract: `dispatch-alert` — Yeni Mode C (`auto_retry`)

Mevcut Mode A (`draft_id`) ve Mode B (`job_id`)'ye ek, üçüncü bir mod.

## İstek

`POST /functions/v1/dispatch-alert` body: `{ "auto_retry": true }`

## Yetkilendirme

Sadece servis-rolü (`Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`) — Mode A ile birebir aynı kontrol. `pg_cron` → `pg_net.http_post()` tetikleyicisi (spec 019/026 deseni) dışında hiçbir client bu modu çağırmamalı.

## Davranış

1. `status='failed' AND retry_count < 4` olan tüm `dispatch_receipts` satırlarını çeker.
2. Her biri için `shouldAutoRetryNow(receipt, now)` (research.md Decision 3) kontrolü yapar — backoff süresi dolmamışsa atlar.
3. Uygun olanları `status='queued'`, `retry_count+1`, `last_attempted_at=NOW()` yapıp `sendReceiptRetry()` ile yeniden dener (dil-lokalizasyonlu `buildEmailBody()` dahil, US1 ile tutarlı).
4. Ardından, `dispatch_jobs` arasında TÜM `dispatch_receipts`'i `retry_count >= 4 AND status='failed'` olan (yani artık hiç otomatik denenmeyecek) VE `admin_notified_at IS NULL` olan job'ları bulur.
5. Her böyle job için, ilgili CAP taslağının `country_code`/`org_id`'sine göre `profiles` tablosundan uygun admin(ler)e (`role='super_admin'` VEYA `role IN ('country_admin','org_admin')` + eşleşen scope) mevcut email adapter'ı ile bir bildirim gönderir, `admin_notified_at=NOW()` set eder.

## Yanıt

`{ "auto_retried_count": number, "admin_notified_job_count": number }`

## Zamanlama

`pg_cron.schedule('dispatch-auto-retry-15min', '*/15 * * * *', ...)` — `trigger_compliance_report_generation()` (spec 019) deseninin bir kopyası, `pg_net.http_post()` ile bu Edge Function'ı `{ "auto_retry": true }` body'siyle çağırır.

## Manuel retry ile ilişki (FR-008)

Mode B (`handleRetry`, operatörün manuel "Tekrar Dene" butonu) artık `retry_count: 0` set eder (önceden `retry_count + 1` idi) — manuel müdahale otomatik sayacı sıfırlar, sistem bu kaydı temiz bir sayfa olarak görür.
