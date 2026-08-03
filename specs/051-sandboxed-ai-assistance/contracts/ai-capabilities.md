# Contracts: Sandboxed AI Assistance Edge Functions

Tümü mevcut Supabase Edge Function deseniyle (Deno, CORS header'ları, JWT doğrulama)
uyumludur. Hiçbiri yeni bir dissemination kanalı açmaz; hiçbiri `cap_drafts`/risk/dispatch
tablolarını yazmaz.

## `ai-translate`

**Auth**: Kullanıcı JWT (authenticated). Çağıran, `source_table`/`source_id` üzerinde mevcut
düzenleme yetkisine sahip olmalı (Edge Function içinde RLS'e eşdeğer bir kontrolle doğrulanır).

**İstek**:
```json
{
  "source_table": "cap_drafts",
  "source_id": "uuid",
  "source_text": "Deprem uyarısı: ...",
  "source_locale": "tr",
  "target_locale": "en"
}
```

**Yanıt (başarı, 200)**:
```json
{
  "suggestion_id": "uuid",
  "status": "pending",
  "ai_output": { "translated_text": "Earthquake warning: ..." }
}
```

**Yanıt (sağlayıcı erişilemez/timeout, 200 — hata olarak değil, "kullanılamıyor" olarak modellenir)**:
```json
{ "ok": false, "reason": "provider_unavailable" }
```
Frontend bu durumda AI öneri panelini gizler/devre dışı bırakır; alert/SOP düzenleme akışı
etkilenmez (FR-008, SC-004).

**Yanıt (yetkisiz, 403)**: capability ülke için kapalıysa veya çağıranın kaynak üzerinde
düzenleme yetkisi yoksa.

## `ai-summarize`

Aynı istek/yanıt şekli, `source_table` yalnızca `sop_documents`/`incidents`, `target_locale` yok,
`ai_output = { "summary_text": "..." }`.

## `ai-classify-photo`

**Tetikleme**: `submit-community-report` içinden fire-and-forget olarak (research.md Karar 3);
ayrıca moderatör kuyruğundan manuel yeniden tetiklenebilir (aynı sözleşme).

**Auth**: Otomatik tetiklemede service-role (submit-community-report zaten service-role
çalışıyor); manuel yeniden tetiklemede country_admin/super_admin JWT.

**İstek**:
```json
{
  "source_table": "community_reports",
  "source_id": "uuid",
  "photo_path": "community-report-photos/xxxx.jpg"
}
```
(Fotoğraf, Storage'dan Edge Function tarafından okunur; reporter kimlik/iletişim alanları asla
gönderilmez — FR-010.)

**Yanıt (başarı, 200)**:
```json
{
  "suggestion_id": "uuid",
  "status": "pending",
  "ai_output": { "suggested_hazard_type": "flood", "confidence": 0.71 }
}
```

**Yanıt (başarısız/kullanılamıyor)**: Gönderim akışını hiçbir zaman başarısız kılmaz — hata
sessizce `ai_suggestions.status='failed'` olarak loglanır, moderatör kuyruğunda öneri rozeti
görünmez (moderasyon akışı zaten önerisiz de çalışır, spec 036 davranışı korunur).

## `ai-anomaly-check`

**Tetikleme**: pg_cron veya ingestion sonrası hafif bir adım (server/src/output/supabaseWriter.js
yazımından sonra periyodik toplu kontrol) — research.md Karar 2 gereği LLM çağrısı YAPMAZ, saf
istatistik.

**Auth**: service-role.

**İstek**: yok (batch job) — son N dakikadaki yeni satırları ilgili hazard tablosundan okur.

**Davranış**: Her hazard tablosu + kaynak için z-skoru eşiği aşan yeni kayıtlar için
`ai_suggestions` içine `capability='anomaly_flag'`, `status='pending'` bir satır eklenir. Hiçbir
mevcut tabloyu (risk skorları, cap_drafts, dispatch) YAZMAZ/GÜNCELLEMEZ.

## Ortak hata sözleşmesi

Tüm dört fonksiyon, sağlayıcı hatası/timeout durumunda kullanıcıya asla ham hata mesajı
göstermez; `{ "ok": false, "reason": "provider_unavailable" | "capability_disabled" |
"unauthorized" }` şeklinde yapılandırılmış bir yanıt döner, frontend bunu "AI şu an kullanılamıyor,
manuel devam edin" olarak sunar.
