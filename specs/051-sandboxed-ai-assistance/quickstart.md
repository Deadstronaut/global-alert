# Quickstart: Sandboxed AI Assistance

Bu doğrulama, migration'ların uygulanmış, ilgili Edge Function'ların deploy edilmiş ve en az bir
ülke için `AI_PROVIDER_BASE_URL`/`AI_PROVIDER_API_KEY` ortam değişkenlerinin ayarlanmış olduğu bir
Supabase ortamı varsayar.

## Ön koşullar

- `<timestamp>_ai_capability_config.sql` ve `<timestamp>_ai_suggestions.sql` migration'ları
  uygulanmış.
- `ai-translate`, `ai-summarize`, `ai-classify-photo`, `ai-anomaly-check` Edge Function'ları
  deploy edilmiş.
- Test ülkesi için `ai_capability_config` tablosunda en az `translate` ve `classify_photo`
  `enabled=true`.
- Bir `country_admin` test hesabı.

## Senaryo 1 — Çeviri önerisi ve onayı (User Story 1)

1. `country_admin` ile giriş yap, bir CAP taslağı (veya SOP dokümanı) aç.
2. "AI ile çevir" aksiyonunu tetikle, hedef dil seç.
3. **Beklenen**: Öneri "AI-suggested — review required" etiketiyle görünür, orijinal metin
   değişmeden kalır, hiçbir otomatik kaydetme olmaz.
4. Öneriyi düzenle, onayla.
5. **Beklenen**: `ai_suggestions` satırı `status='approved_edited'`, `final_output` dolu;
   `audit_log`'da onay kaydı var.
6. Aynı öneriyi onaylamadan reddet (yeni bir istekle) → `status='rejected'`, hiçbir çeviri
   kaydedilmedi.

## Senaryo 2 — Sağlayıcı kullanılamıyor (Edge Case, FR-008/SC-004)

1. `AI_PROVIDER_API_KEY`'i geçersiz bir değere ayarla (veya sağlayıcıyı geçici olarak durdur).
2. Senaryo 1'i tekrarla.
3. **Beklenen**: "AI şu an kullanılamıyor" mesajı görünür, CAP taslağı/SOP düzenleme ve manuel
   kaydetme tamamen çalışır durumda kalır — hiçbir blokaj yok.

## Senaryo 3 — Fotoğraf ön-sınıflandırma (User Story 3)

1. `classify_photo` yeteneği açıkken, kimlik doğrulamasız `/report` sayfasından fotoğraflı bir
   bildirim gönder.
2. `country_admin` ile moderasyon kuyruğunu aç.
3. **Beklenen**: Bildirimin yanında "AI-suggested — review required" rozetiyle bir hazard type
   önerisi görünür; bildirimin kendi `hazard_type` alanı henüz moderatör kararını yansıtır
   (öneriden etkilenmemiştir).
4. Moderatör öneriyi kabul et veya farklı bir tür seçerek onayla.
5. **Beklenen**: Kaydedilen `hazard_type` her zaman moderatörün seçimidir; `ai_suggestions`
   satısında öneri ile moderatör kararının eşleşip eşleşmediği (kabul/override) işaretlenmiştir.

## Senaryo 4 — Yetenek kapalıyken hiçbir AI seçeneği görünmez (FR-001)

1. Test ülkesi için `ai_capability_config`'te `summarize`'ı `enabled=false` yap.
2. Bir SOP dokümanını aç.
3. **Beklenen**: "AI ile özetle" aksiyonu hiç görünmez.

## Senaryo 5 — Anomali bayrağı yalnızca pasif (User Story 4)

1. `anomaly_flag` açıkken, bir hazard tablosuna (test ortamında) mevcut geçmişten belirgin şekilde
   sapan bir kayıt ekle (ör. anormal büyüklükte bir deprem test kaydı).
2. `ai-anomaly-check` batch işini çalıştır (veya cron tetiklenene kadar bekle).
3. Admin dashboard'da ilgili kayıt üzerinde "AI-flagged — unusual pattern" rozetini doğrula.
4. Rozeti kapat (dismiss).
5. **Beklenen**: Hiçbir risk skoru, cascading-risk kuralı, alert veya dispatch bu adımdan
   etkilenmedi (spec 039/048/049 tablolarında hiçbir değişiklik yok) — yalnızca
   `ai_suggestions.status='ignored'` oldu.
