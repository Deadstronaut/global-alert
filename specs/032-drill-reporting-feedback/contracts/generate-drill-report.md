# Contract: `generate-drill-report` Edge Function

`generate-incident-report`'un (spec 026) birebir yapısal ikizi.

## İstek

`POST /functions/v1/generate-drill-report` body: `{}`

## Yetkilendirme

Sadece servis-rolü (`Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`) — `generate-incident-report`/`generate-compliance-report` ile birebir aynı kontrol.

## Davranış

1. En son tamamen geçmiş takvim yılını hesaplar (`mostRecentElapsedYear()`, `generate-incident-report`'un aynı fonksiyonunun kopyası).
2. `drill_sessions`'tan `status='completed' AND ended_at >= periodStart AND ended_at < periodEnd` olan kayıtları çeker.
3. `computeDrillReportSummary()` (data-model.md) ile toplulaştırır.
4. `drill_reports`'a `ON CONFLICT (period_start, period_end) DO NOTHING` ile idempotent upsert yapar (aynı dönem için ikinci kayıt asla oluşmaz — FR-004).

## Yanıt

`{ "period_start": string, "period_end": string, "inserted": boolean }`

## Zamanlama

`pg_cron.schedule('generate-drill-report-yearly', '10 0 1 1 *', ...)` — `generate-incident-report-yearly`'nin (`5 0 1 1 *`) 5 dakika sonrası, `trigger_drill_report_generation()` (spec 019/026 deseninin kopyası) ile `pg_net.http_post()` üzerinden tetiklenir.
