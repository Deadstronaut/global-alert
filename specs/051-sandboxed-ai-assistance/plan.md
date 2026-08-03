# Implementation Plan: Sandboxed AI Assistance

**Branch**: `051-sandboxed-ai-assistance` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/051-sandboxed-ai-assistance/spec.md`

## Summary

Dört, ülke başına ayrı ayrı açılıp kapatılabilen, karar-vermeyen AI yardımcı yeteneği eklenir:
(1) CAP/SOP metni çevirisi, (2) SOP/incident özetleme, (3) vatandaş bildirimi fotoğraf
ön-sınıflandırma, (4) hazard veri akışında pasif anomali bayrağı. Her yetenek OpenAI-uyumlu, ortam
değişkenleriyle dağıtım-başına yapılandırılabilir bir HTTP sağlayıcı arayüzü
(`supabase/functions/shared/aiProvider.ts`) üzerinden çalışır — anomali bayrağı istisnadır, o hiç
LLM çağırmaz, saf istatistiksel eşik kullanır (research.md Karar 2). İki yeni jenerik tablo
(`ai_capability_config`, `ai_suggestions`) tüm dört yeteneği tek tip bir şemada tutar; mevcut
`cap_drafts`/SOP/`incidents`/`community_reports` tablolarına hiçbir sütun eklenmez. Her öneri,
insan onayı/reddi/override'ı olmadan hiçbir kalıcı etkiye sahip değildir (FR-004); mevcut
`log_table_change()` audit trigger'ı yeniden kullanılır. Risk endeksi (spec 039), cascading-risk
kuralları (spec 048/049) ve alert/dispatch onay iş akışı (spec 006/009) bu spec kapsamında hiç
dokunulmaz.

## Technical Context

**Language/Version**: JavaScript (ES2020+) frontend (Vue 3 Composition API), TypeScript (Deno)
Edge Functions, PL/pgSQL (Postgres trigger/RLS) — mevcut proje dilleriyle aynı, yeni dil eklenmiyor

**Primary Dependencies**: Vue 3, Pinia, vue-i18n, Supabase JS client, Deno (Edge Functions
runtime) — YENİ: dış bir AI/LLM sağlayıcısına düz `fetch()` ile HTTP çağrısı (OpenAI-uyumlu Chat/
Vision Completions sözleşmesi); yeni bir npm/Deno paketi veya SDK eklenmez, mevcut `fetch`
kullanılır (`fetch-wildfires` vb. mevcut fetcher'ların dış API'ye bağlanma desenine benzer)

**Storage**: Supabase Postgres — 2 yeni tablo (`ai_capability_config`, `ai_suggestions`, bkz.
data-model.md); yeni bir Storage bucket'ı gerekmez (mevcut `community-report-photos` bucket'ı
`ai-classify-photo` tarafından okuma amaçlı yeniden kullanılır)

**Testing**: Vitest (`tests/unit/*.test.js`) — anomali z-skoru hesaplama fonksiyonu ve durum makinesi
geçiş kuralları için saf fonksiyon testleri (mevcut proje convention'ı); `deno test
supabase/functions/shared/` — `aiProvider.ts`'nin hata/timeout dallarını mock fetch ile test etmek
için (spec 016/017'deki Deno test deseniyle tutarlı)

**Target Platform**: Web (masaüstü + mobil tarayıcı), Capacitor sarmalaması — AI aksiyonları
(çevir/özetle/moderasyon rozeti) mevcut admin/authoring ekranlarına eklenir, yeni bir platform-özel
kod yolu açılmaz

**Project Type**: Web application (tek Vue 3 + Supabase projesi, `frontend`/`backend` ayrımı yok)

**Performance Goals**: `ai-translate`/`ai-summarize`/`ai-classify-photo` kullanıcı tetiklemeli
istekler olduğundan gerçek zamanlı ingestion performansını etkilemez; `ai-anomaly-check` ingestion
hot path'inde SENKRON çalışmaz (research.md Karar 2/3) — en hızlı kaynak olan deprem (1 dk döngü)
dahil hiçbir mevcut polling/refresh döngüsü yavaşlamaz (Principle VII korunur)

**Constraints**: Her AI çağrısı sağlayıcı hatası/timeout'ta zarifçe başarısız olmalı ve altta yatan
manuel akışı (kaydetme, gönderme, moderasyon, izleme) ASLA bloklamamalı (FR-008); fotoğraf
sınıflandırmaya reporter kimlik/iletişim verisi asla gönderilmez (FR-010); hiçbir AI çıktısı risk
skoru/cascading-risk/CAP onay-dispatch durumuna yazamaz (FR-002) — bu, RLS ve Edge Function
yetkilendirme kontrolleriyle uygulama katmanında zorunlu kılınır, yalnızca belgeyle değil

**Scale/Scope**: 2 yeni tablo + 4 yeni Edge Function (`ai-translate`, `ai-summarize`,
`ai-classify-photo`, `ai-anomaly-check`) + 1 yeni paylaşımlı Deno modülü (`aiProvider.ts`) + 1 yeni
Pinia store (`aiAssistance.js`) + birkaç küçük UI eklentisi (CAP/SOP editörüne "AI ile çevir/özetle"
butonu, community report moderasyon paneline öneri rozeti, admin dashboard'a anomali rozeti, yeni
bir country-config paneli AI yetenek toggle'ları için) + 7 dilde i18n anahtarları; mevcut hiçbir
tablo şeması değişmiyor (tamamen additive)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design**: `anomaly_flag` yeteneği tüm hazard tablolarına
  (`earthquake`,`flood`,`wildfire`,...) aynı jenerik istatistik fonksiyonuyla uygulanır, yeni bir
  hazard type için özel kod gerekmez. PASS.
- **II. Scope Discipline**: Yeni bir dissemination kanalı AÇILMIYOR (spec'in FR-007'si bunu açıkça
  yasaklıyor); mevcut Email/WhatsApp/Portal kanalları değişmiyor. Identity federasyonu
  eklenmiyor. CAP authoring/export'a dokunulmuyor — yalnızca CAP taslağının metnine bir çeviri
  ÖNERİSİ eklenir, CAP mesajının kendisi/onay akışı değişmez. PASS.
- **III. CAP v1.2 Compliance**: Etkilenmiyor — çeviri önerisi onaylandığında dahi CAP XML
  üretim/validasyon kod yolu değişmez, yalnızca alanın içeriği (insan onaylı) güncellenir. PASS.
- **IV. Data Quality & Normalization**: `anomaly_flag`, mevcut `DisasterEvent` normalizasyon/
  dedup boru hattından SONRA, ayrı bir salt-okunur gözlem katmanı olarak çalışır — dedup/severity
  mapping mantığını değiştirmez. PASS.
- **V. Access Control & Auditability**: Her AI yeteneği, kaynak varlık üzerindeki MEVCUT RBAC
  yetkisine delege eder (research.md Karar 6); yeni bir izin sistemi icat edilmiyor. Her öneri ve
  kararı mevcut `log_table_change()` audit trigger'ı ile append-only audit_log'a düşer (FR-005).
  PASS.
- **VI. Accessibility & Internationalization**: Yeni UI metinleri ("AI-suggested — review
  required" rozeti, config paneli, vb.) 7 dile eklenir; mevcut tema/kontrast ayarları kullanılır.
  Not: `translate` yeteneğinin KENDİSİ i18n sisteminin YERİNE geçmez — statik UI metinleri yine
  vue-i18n üzerinden, yalnızca kullanıcı içeriği (alert/SOP metni) AI ile çevrilir. PASS.
- **VII. Performance & Resilience by Design**: `anomaly_flag` ingestion hot path'ine senkron LLM
  çağrısı eklemez (research.md Karar 2); tüm AI çağrıları sağlayıcı erişilemezliğinde altta yatan
  akışı bloklamadan zarifçe başarısız olur (FR-008). PASS.
- **VIII. Simplicity & YAGNI**: Backend Supabase-native kalıyor — yeni bir servis/kuyruk/mesaj
  broker'ı eklenmiyor, dış AI sağlayıcısına düz `fetch()` ile bağlanılıyor (mevcut
  `fetch-wildfires` vb. dış-API-çağırma desenine benzer, yeni bir mimari katman değil). **Bayrak**:
  Bu, projenin şu ana kadarki teknoloji listesinin (Vue 3, Pinia, Vite, Leaflet, globe.gl, h3-js,
  Supabase/Deno, Capacitor, vue-i18n) DIŞINDA yeni bir dış servis bağımlılığı (AI/LLM sağlayıcı
  API'si) ekliyor — spec'in Assumptions bölümünde açıkça işaretlendi ve kullanıcı tarafından
  onaylandı (konuşma geçmişi: kullanıcı, kararı verme dışı, "sandbox" alanlarda AI kullanımını
  açıkça istedi). Mevcut Email/WhatsApp dispatch adaptörleriyle aynı "dış API'ye entegrasyon"
  kategorisinde değerlendirildiği için bu, Principle VIII'in yasakladığı türden bir mimari
  katman/servis eklenmesi (Celery, ikinci veritabanı, ayrı mikroservis) DEĞİLDİR. PASS (Complexity
  Tracking'de gerekçelendirildi, aşağıya bakın).

Sonuç: Doğrudan bir prensip ihlali yok; VIII'in "yeni dış bağımlılık" bayrağı Complexity
Tracking'de belgelenip onaylandı.

## Project Structure

### Documentation (this feature)

```text
specs/051-sandboxed-ai-assistance/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── ai-capabilities.md
└── tasks.md              # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   ├── <timestamp>_ai_capability_config.sql   # NEW: table, RLS, audit trigger, set_updated_at
│   └── <timestamp>_ai_suggestions.sql         # NEW: table, guard trigger (state machine), RLS, audit trigger
└── functions/
    ├── ai-translate/
    │   └── index.ts                            # NEW: JWT-authed, calls aiProvider.ts (text)
    ├── ai-summarize/
    │   └── index.ts                            # NEW: JWT-authed, calls aiProvider.ts (text)
    ├── ai-classify-photo/
    │   └── index.ts                            # NEW: service-role (auto) + JWT (manual retrigger), calls aiProvider.ts (vision)
    ├── ai-anomaly-check/
    │   └── index.ts                            # NEW: service-role (pg_cron), pure stats, no aiProvider.ts call
    ├── submit-community-report/
    │   └── index.ts                            # MODIFIED: fire-and-forget call to ai-classify-photo after successful insert
    └── shared/
        ├── aiProvider.ts                       # NEW: OpenAI-compatible HTTP client, env-configured, used by translate/summarize/classify_photo
        └── anomalyStats.ts                      # NEW: pure z-score calculation, unit-tested

src/
├── stores/
│   └── aiAssistance.js                          # NEW: Pinia store — capability config cache, suggestion request/approve/reject actions
├── components/
│   ├── ai/
│   │   ├── AiSuggestionBadge.vue                 # NEW: reusable "AI-suggested — review required" label + accept/reject controls
│   │   └── AiCapabilityTogglePanel.vue           # NEW: admin panel — per-country capability on/off
│   └── admin/
│       └── AdminView.vue                         # MODIFIED: new "AI Yardımı" config tab hosting AiCapabilityTogglePanel
├── components/cap/ or sop/ (mevcut editör bileşenleri)  # MODIFIED: "AI ile çevir"/"AI ile özetle" aksiyonu + AiSuggestionBadge entegrasyonu
├── components/admin/CommunityReportsPanel.vue    # MODIFIED: AiSuggestionBadge gösterimi (spec 036 panelinde)
├── components/MapView.vue veya ilgili admin dashboard bileşeni  # MODIFIED: anomali rozeti gösterimi
└── i18n/locales/*.json                            # MODIFIED: 7 locale, yeni ai.* anahtarları

tests/
└── unit/
    ├── anomalyStats.test.js                       # NEW: z-score hesaplama, eşik davranışı
    └── aiSuggestionTransitions.test.js             # NEW: durum makinesi geçiş kuralları (pure)

supabase/functions/shared/
├── aiProvider.test.ts                              # NEW: deno test, mock fetch — timeout/hata/başarı dalları
└── anomalyStats.test.ts                            # NEW: deno test, src/ tarafındaki mantıkla aynı sonucu üretir (iki-port deseni, spec 036 geoCountry.ts ile aynı gerekçe)
```

**Structure Decision**: Tek Vue 3 + Supabase projesi (mevcut proje yapısı), `frontend`/`backend`
ayrımı yok. Yeni yüzey üç katmanda: (1) 2 yeni tablo + guard/audit trigger'ları, (2) 4 yeni Edge
Function + 2 yeni paylaşımlı Deno modülü (AI sağlayıcı istemcisi + istatistik), (3) `src/` altında
yeni store/bileşenler + mevcut editör/moderasyon/dashboard bileşenlerine küçük, additive eklentiler.
Hiçbir mevcut tablo/politika kaldırılmıyor veya davranışı değiştirilmiyor.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Yeni dış servis bağımlılığı: AI/LLM sağlayıcı API'si (Principle VIII teknoloji listesi dışında) | Spec'in dört yeteneği (çeviri, özetleme, fotoğraf sınıflandırma) doğası gereği bir dil/görsel modeline ihtiyaç duyuyor; kullanıcı bunu önceki konuşmada açıkça, "karar-verme dışı sandbox alanlar" sınırıyla onayladı | Kendi içimizde bir model eğitmek/barındırmak: reddedildi — çok daha büyük bir karmaşıklık/işletim yükü, ve önceki karar ("tahminleme dışarıdan alınacak, içeride üretilmeyecek") ile tutarsız olurdu. Özelliği tamamen kapsam dışı bırakmak: reddedildi — kullanıcının açık talebi ve spec'in onaylanmış User Story'leri var. Mimari etki minimize edildi: yeni bir servis/kuyruk/veritabanı YOK, yalnızca mevcut Edge Function desenine (dış API'ye `fetch`) bir örnek daha eklendi — Email/WhatsApp dispatch adaptörleriyle aynı kategori. |
