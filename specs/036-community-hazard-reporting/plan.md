# Implementation Plan: Vatandaş Kaynaklı Afet Bildirimi (Community Hazard Reporting)

**Branch**: `036-community-hazard-reporting` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/036-community-hazard-reporting/spec.md`

## Summary

Kimlik doğrulaması gerektirmeyen yeni bir `/report` sayfası üzerinden vatandaşlar geo-tagged bir
afet bildirimi (tür + açıklama + konum + isteğe bağlı tek fotoğraf) gönderebilir. Gönderim, yeni
bir `submit-community-report` Edge Function'ı üzerinden yapılır (service-role ile yazar, ülke
kodunu mevcut bbox-tabanlı `resolveCountryCode()` mantığının bir Deno portuyla server-side belirler,
fotoğrafı yeni bir Storage bucket'ına yükler). Yeni `community_reports` tablosu, `incidents`/
`cap_drafts` ile aynı DB-seviyeli guard-trigger deseniyle bir durum makinesi
(`pending→approved/rejected→archived`) uygular. `country_admin`/`super_admin` AdminView'a eklenen
yeni bir moderasyon sekmesinden onay/red (gerekçeli) yapar; `org_admin` bu tabloya erişemez
(coğrafi veriden organizasyon çıkarılamadığı için). Onaylı bildirimler, MapView'a eklenen yeni,
MapLibre'nin yerleşik `cluster` özelliğini kullanan bağımsız bir marker katmanında tüm giriş yapmış
kullanıcılara gösterilir. Moderatör, onaylı bir bildirimi mevcut bir incident'a bağlayabilir
(audit_log'a otomatik düşer, mevcut `log_table_change()` trigger'ı üzerinden). Onay anında/sonrasında
country_admin/super_admin bildirimi isteğe bağlı olarak bir organizasyona atayabilir
(`assigned_org_id`); o organizasyona bağlı `org_admin`, yalnızca kendisine atanmış ve onaylanmış
bildirimleri salt-okunur olarak görebilir — `org_admin`'in hiçbir zaman onay/red yetkisi yoktur.
Otomatik NLP/LLM kategorileştirme YAPILMAZ — moderatör afet tipini mevcut `hazard_types`
kaydından manuel atar.

## Technical Context

**Language/Version**: JavaScript (ES2020+) frontend (Vue 3 Composition API), TypeScript (Deno) Edge Function, PL/pgSQL (Postgres trigger/RLS)

**Primary Dependencies**: Vue 3, Pinia, `maplibregl` (mevcut, native `cluster` GeoJSON source özelliği kullanılacak), vue-i18n, Supabase JS client (`functions.invoke`), Deno (Supabase Edge Functions runtime) — yeni bir üçüncü taraf paket EKLENMEZ

**Storage**: Supabase Postgres — yeni `community_reports` tablosu (bkz. data-model.md); Supabase Storage — yeni `community-report-photos` bucket'ı (bu projede Storage'ın ilk kullanımı, ama Supabase'in kendi ürün yüzeyinin parçası, Principle VIII'i ihlal etmez)

**Testing**: Vitest (`tests/unit/*.test.js`) — `resolveCountryCode` Deno portu için ayrıca `deno test supabase/functions/shared/` (proje convention'ı, spec 016/017 ile tutarlı)

**Target Platform**: Web (masaüstü + mobil tarayıcı), Capacitor ile mobil sarmalama; bildirim formu mobil kullanım için özellikle önemli (sahadaki vatandaş telefonundan gönderir) — mevcut responsive tasarım desenleri kullanılır, yeni bir platform-özel kod yolu açılmaz

**Project Type**: Web application (tek Vue 3 + Supabase projesi, `frontend`/`backend` ayrımı yok)

**Performance Goals**: Moderasyon kuyruğu ve harita katmanı onlarca-yüzlerce kayıt ölçeğinde çalışır (mevcut sığınak/incident ölçeğiyle aynı mertebe); MapLibre native clustering büyük event sayılarında da (binlerce) performanslı kalır (kütüphanenin kendi optimizasyonu, ek iş gerektirmez)

**Constraints**: Anon yazma yalnızca Edge Function üzerinden (doğrudan RLS INSERT policy'si yok); fotoğraf ≤5MB, yalnızca `image/jpeg`/`image/png`/`image/webp`; moderasyon-öncesi hiçbir bildirim herhangi bir public/authenticated görünümde görünmez (FR-004, SC-004); `org_admin` bu tabloya hiç erişemez

**Scale/Scope**: 1 yeni tablo + 1 yeni Storage bucket + 1 yeni Edge Function + 1 yeni Deno paylaşımlı modül (`geoCountry.ts`) + 1 yeni Pinia store + 2 yeni Vue bileşeni (public form, admin moderasyon paneli) + MapView.vue'ya yeni katman + 1 yeni public route (`/report`) + 7 dilde i18n anahtarları; mevcut `incidents`/`hazard_types`/`profiles`/`audit_log` tablolarına yalnızca FK referansı, şema değişikliği yok

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design**: `hazard_type` mevcut `hazard_types` registry'sine FK'dir; yeni bir hazard type hardcode edilmiyor, moderatör mevcut kayıttan seçiyor. PASS.
- **II. Scope Discipline**: Yeni bir dissemination kanalı açılmıyor (SMS/push/siren yok); kimlik federasyonu eklenmiyor; CAP'a dokunulmuyor. Bu, mevcut kanalların DIŞINDA yeni bir "veri toplama" yeteneği (community reporting), SRS M7'de zaten tanımlı bir modül — kapsam ihlali yok. PASS.
- **III. CAP v1.2 Compliance**: Etkilenmiyor, bu spec CAP mesajı üretmiyor/değiştirmiyor. PASS.
- **IV. Data Quality & Normalization**: `community_reports` bir `DisasterEvent` değildir (ayrı bir varlık, ayrı bir kullanıcı akışı) — mevcut normalizasyon/deduplikasyon boru hattına dahil edilmiyor, bu bilinçli bir ayrım (spec'te "afet olayı katmanından görsel olarak ayrı" olarak belirtiliyor). Veri tazeliği göstergesi gerektirmiyor çünkü bu harici bir otomatik veri kaynağı değil, insan tarafından gönderilen tekil kayıtlardır (spec 027'nin sığınak/incident verisi için verdiği "iç operasyonel veri" muafiyetiyle aynı gerekçe). PASS.
- **V. Access Control & Auditability**: Moderasyon country_code'a göre RBAC ile kapsamlanıyor (country_admin/super_admin); her onay/red/incident-bağlama işlemi mevcut `log_table_change()` audit trigger'ı ile append-only audit_log'a yazılıyor — yeni bir audit yolu icat edilmiyor. PASS.
- **VI. Accessibility & Internationalization**: Yeni form/panel/harita popup metinleri 7 dile (tr/en/es/fr/ru/ar/zh) eklenecek, mevcut dark/light/high-contrast temaları kullanılacak. PASS.
- **VII. Performance & Resilience**: Yeni katman disaster-event polling/cache mekanizmasına dokunmuyor; offline/degrade davranışı etkilenmiyor (bildirim formu zaten anlık bir aksiyon, cache gerektirmiyor); MapLibre native clustering büyük veri setlerinde performanslı. PASS.
- **VIII. Simplicity & YAGNI**: Yeni bir dünya-sınırları veri seti, yeni bir dış servis, yeni bir mesaj kuyruğu EKLENMİYOR — mevcut bbox ülke-tespiti, mevcut guard-trigger deseni, mevcut Supabase Storage (Supabase'in kendi parçası) yeniden kullanılıyor. Otomatik NLP/LLM kategorileştirme (PRD'de MEDIUM öncelikli, AI altyapısı gerektiren) bilinçli olarak kapsam dışı bırakıldı. PASS.

Sonuç: Hiçbir ihlal yok, Complexity Tracking bölümü gerekmiyor.

## Project Structure

### Documentation (this feature)

```text
specs/036-community-hazard-reporting/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── community-reports.md
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   └── <timestamp>_community_reports.sql   # NEW: table, guard trigger, RLS, audit trigger, storage bucket
└── functions/
    ├── submit-community-report/
    │   └── index.ts                        # NEW: anon-callable, service-role write, photo upload, country resolve
    └── shared/
        └── geoCountry.ts                    # NEW: Deno port of resolveCountryCode() (research.md Decision 1)

src/
├── stores/
│   └── communityReports.js                 # NEW: Pinia store (data-model.md)
├── components/
│   ├── CommunityReportForm.vue              # NEW: public submission form
│   └── admin/
│       └── CommunityReportsPanel.vue        # NEW: moderation queue tab
├── views/
│   ├── ReportHazardView.vue                 # NEW: hosts CommunityReportForm at /report (mirrors ShelterInfoView/HazardEncyclopediaView pattern)
│   └── AdminView.vue                        # MODIFIED: new "Vatandaş Bildirimleri" tab
├── components/
│   └── MapView.vue                          # MODIFIED: new clustered marker layer + uiStore.showCommunityReports toggle
├── router/
│   └── index.js                             # MODIFIED: new public /report route (no auth guard, mirrors /shelters, /hazards)
├── utils/
│   └── geoCountry.js                        # UNCHANGED (reused, not modified)
└── i18n/locales/*.json                      # MODIFIED: 7 locale files, new communityReport.* keys

tests/
└── unit/
    ├── communityReportTransitions.test.js   # NEW: pure state-machine validity checks (mirrors incident/cap_draft transition tests if present)
    └── ...

supabase/functions/shared/
└── geoCountry.test.ts                        # NEW: deno test, mirrors src/utils/geoCountry.js behavior
```

**Structure Decision**: Tek Vue 3 + Supabase projesi (mevcut proje yapısı), `frontend`/`backend`
ayrımı yok. Yeni yüzey üç katmanda: (1) DB migration (tablo + guard trigger + RLS + Storage
bucket), (2) yeni bir Edge Function + paylaşımlı Deno modülü (anon yazma + ülke tespiti), (3)
`src/` altında yeni store/bileşen/route + mevcut `MapView.vue`/`AdminView.vue`'ya ekler. Hiçbir
mevcut dosya/tablo/politika kaldırılmıyor veya davranışı değiştirilmiyor (tamamen additive).

## Complexity Tracking

*Yok — Constitution Check'te hiçbir ihlal tespit edilmedi.*
