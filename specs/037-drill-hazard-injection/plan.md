# Implementation Plan: Tatbikat İçin Simüle Tehlike Enjeksiyonu

**Branch**: `037-drill-hazard-injection` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/037-drill-hazard-injection/spec.md`

## Summary

Aktif bir `drill_session` (spec 013) sırasında, mevcut tatbikat başlatma/durdurma yetkisine sahip
kullanıcılar (country_admin/org_admin/super_admin), yeni ve tamamen ayrı bir `drill_injected_events`
tablosuna simüle tehlike olayları ekleyebilir. Bu olaylar gerçek afet-olayı tablolarına
(earthquake/wildfire/vb.) veya ingestion/normalize boru hattına HİÇ karışmaz (Principle IV). Ana
haritada (`MapView.vue`), yalnızca ait olduğu tatbikat `active` iken, gerçek olaylardan ayrı bir
katmanda, her zaman görünür kaldırılamaz bir "TATBİKAT" rozetiyle gösterilir — `CapView.vue`'nun
mevcut `is_exercise` rozeti (spec 013) ile aynı görsel dil. Bir enjekte olaydan CAP taslağı
oluşturulursa, mevcut `is_exercise` otomatik-işaretleme trigger'ı (spec 013, DEĞİŞTİRİLMEDEN) devreye
girer. Tatbikat `completed` olduğunda olaylar haritadan kalkar ama silinmez (denetim/geçmiş amaçlı).

## Technical Context

**Language/Version**: JavaScript (ES2020+), Vue 3 Composition API (`<script setup>`), PL/pgSQL (RLS/trigger)

**Primary Dependencies**: Vue 3, Pinia, `maplibregl` (mevcut disaster-event DOM-marker deseni yeniden kullanılıyor — MapLibre native cluster GEREKMİYOR, çünkü tatbikat başına birkaç olay bekleniyor, spec 036'nın community-report kümeleme ihtiyacından farklı), Supabase JS client, vue-i18n

**Storage**: Supabase Postgres — yeni `drill_injected_events` tablosu (bkz. data-model.md); gerçek disaster-event tablolarına HİÇBİR yazma/okuma eklenmez

**Testing**: Vitest (`tests/unit/*.test.js`) — `isDrillEventVisible()` gibi saf fonksiyonlar için, proje convention'ı

**Target Platform**: Web (masaüstü + mobil tarayıcı), Capacitor ile mobil sarmalama

**Project Type**: Web application (tek Vue 3 + Supabase projesi, `frontend`/`backend` ayrımı yok)

**Performance Goals**: Tatbikat başına birkaç ile onlarca olay beklenir (spec'in Assumptions'ında belirtildiği gibi üst sınır yok ama tipik kullanım küçük ölçekli) — mevcut disaster-event DOM-marker yaklaşımı (`updateMarkers()`) yeterli, MapLibre native clustering gibi ek bir optimizasyon gerekmiyor

**Constraints**: Gerçek `earthquake`/`wildfire`/`flood`/vb. tablolarına, `fetch-*`/`normalize` boru hattına, `is_exercise`/`cap_drafts` trigger mantığına (spec 013) veya tatbikat özet/metrik mantığına (spec 017/032) HİÇBİR değişiklik yapılmaz — bu spec tamamen additive bir katman

**Scale/Scope**: 1 yeni tablo + RLS + audit trigger + 1 yeni Pinia store + `AdminView.vue`'nun mevcut tatbikat sekmesine küçük bir enjeksiyon formu eklentisi + `MapView.vue`'ya yeni, ayrı bir marker katmanı + 7 dilde i18n anahtarları; yeni migration YOK Edge Function, yeni route YOK

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design**: Enjekte olayın `hazard_type` alanı mevcut `hazard_types` registry'sine FK'dir; yeni bir hazard type hardcode edilmiyor. PASS.
- **II. Scope Discipline**: Yeni bir dissemination kanalı, kimlik federasyonu veya CAP hub ingestion'ı eklenmiyor. PASS.
- **III. CAP v1.2 Compliance**: Bu spec CAP mesajı üretmiyor; enjekte olaydan CAP taslağı oluşturma zaten var olan spec 011/013 akışını hiç değiştirmeden kullanır. PASS.
- **IV. Data Quality & Normalization**: Bu, tam olarak bu ilkenin koruduğu şey — enjekte (simüle, insan yapımı) veri, gerçek harici kaynaklardan normalize edilen `DisasterEvent` boru hattına KESİNLİKLE karıştırılmaz; ayrı bir tabloda, ayrı bir marker katmanında tutulur. Enjekte olaylar için "veri tazeliği" göstergesi anlamsızdır (gerçek bir dış kaynak değil, insan tarafından o an oluşturulan bir kayıt) — spec 027'nin sığınak/incident verisi için verdiği aynı muafiyet gerekçesiyle tutarlı. PASS.
- **V. Access Control & Auditability**: Yetkilendirme mevcut tatbikat başlatma/durdurma yetkisiyle birebir aynı (country_admin/org_admin kendi kapsamında, super_admin her yerde) — yeni bir rol/izin kavramı yok. Enjeksiyon/silme işlemleri mevcut `log_table_change()` audit trigger'ı ile otomatik loglanır. PASS.
- **VI. Accessibility & Internationalization**: Yeni form/rozet/popup metinleri 7 dile eklenecek, mevcut `cap.exerciseOnly` rozetiyle aynı görsel/metinsel netlik (SADECE TATBİKAT tarzı) korunacak. PASS.
- **VII. Performance & Resilience**: Mevcut disaster-event marker mimarisine (DOM tabanlı, küçük ölçek için yeterli) paralel, ayrı bir katman; offline/degrade davranışı etkilenmiyor. PASS.
- **VIII. Simplicity & YAGNI**: Zamanlanmış/çok adımlı senaryo dizileri, yeni bir Edge Function, yeni bir route bilinçli olarak dışlandı; mevcut `drill_sessions` state machine'i ve `is_exercise` trigger'ı yeniden kullanılıyor, hiçbiri değiştirilmiyor. PASS.

Sonuç: Hiçbir ihlal yok, Complexity Tracking bölümü gerekmiyor.

## Project Structure

### Documentation (this feature)

```text
specs/037-drill-hazard-injection/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── drill-injected-events.md
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    └── <timestamp>_drill_injected_events.sql   # NEW: table, RLS, audit trigger — no Storage/Edge Function

src/
├── stores/
│   └── drillInjectedEvents.js       # NEW: Pinia store (fetch/inject/remove, scoped by active drill)
├── views/
│   └── AdminView.vue                # MODIFIED: drill tab gets a small "olay enjekte et" sub-form
├── components/
│   └── MapView.vue                  # MODIFIED: new drill-event marker layer, always-visible "TATBİKAT" badge
└── i18n/locales/*.json              # MODIFIED: 7 locale files, new drillInjection.* keys

tests/
└── unit/
    └── drillInjectedEvents.test.js  # NEW: pure helper function coverage (if any pure logic emerges, e.g. active-drill filtering)
```

**Structure Decision**: Tek Vue 3 + Supabase projesi (mevcut proje yapısı). Yeni Edge Function veya
Storage bucket YOK — sadece bir migration + bir store + iki view/component değişikliği. Mevcut
`drill_sessions` yönetimi (`AdminView.vue`'da doğrudan Supabase sorguları, dedicated store yok)
deseni izleniyor; yalnızca `MapView.vue`'nun reaktif ihtiyacı için yeni bir Pinia store ekleniyor
(spec 036'nın `communityReports.js` store'uyla aynı gerekçe).

## Complexity Tracking

*Yok — Constitution Check'te hiçbir ihlal tespit edilmedi.*
