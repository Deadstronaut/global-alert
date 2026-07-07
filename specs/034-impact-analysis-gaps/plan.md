# Implementation Plan: Impact Analysis Gaps

**Branch**: `034-impact-analysis-gaps` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/034-impact-analysis-gaps/spec.md`

## Summary

Impact Analysis modülüne (spec 008) dört additive genişleme: (1) exposure varlıklarına kritik altyapı kategorisi etiketleme + panelde öne çıkarma, (2) bir CAP taslağı yayına (`status='broadcast'`) geçtiğinde o anki impact sonucunun değişmez bir snapshot'ının otomatik arşivlenmesi, (3) sektör/idari sınır seviyesine göre gruplanmış agregasyon, (4) hesaplama sonucuna eşlik eden bir veri tamlığı skoru. Tüm değişiklikler `exposure_features`/`impact_scenarios` şemasına additive kolonlar + yeni bir `impact_snapshots` tablosu + iki yeni SQL fonksiyonu (`compute_sector_breakdown`, `compute_data_completeness`) olarak eklenir; mevcut `compute_zonal_stats()` değişmez.

## Technical Context

**Language/Version**: JavaScript (Vue 3 `<script setup>`), PL/pgSQL (Postgres 15, Supabase)

**Primary Dependencies**: Vue 3 + Vite, Pinia (bu modülde henüz kullanılmıyor — component-local state), Supabase JS client, PostGIS (`geometry`/`ST_DWithin`)

**Storage**: PostgreSQL (Supabase) — `exposure_datasets`, `exposure_features`, `impact_scenarios` (spec 008), yeni `impact_snapshots` tablosu

**Testing**: Vitest (mevcut proje convention'ı) — DB fonksiyonları unit test edilmiyor (transactional canlı doğrulama, spec 008/028/029/030 convention'ı); sadece varsa çıkarılabilecek saf JS yardımcı fonksiyonlar test edilir

**Target Platform**: Web (masaüstü/tablet tarayıcı), Supabase Edge (Postgres fonksiyonları/trigger)

**Project Type**: Web application (Vue frontend + Supabase backend) — mevcut single-project yapı

**Performance Goals**: `compute_sector_breakdown`/`compute_data_completeness` sorguları, `compute_zonal_stats` ile aynı büyüklük sınıfındaki exposure dataset'lerinde (mevcut performans karakteristiği) makul sürede (saniyeler mertebesinde) tamamlanmalı

**Constraints**: Mevcut `exposure_datasets`/`exposure_features`/`impact_scenarios` şeması ve RLS'i (country_code/org_id bazlı) korunur; `impact_snapshots` de aynı RLS desenini mirror eder; onay-anı arşivleme senkron bir trigger içinde olur (pg_cron/pg_net gerekmez, spec 009'daki `dispatch_jobs` state machine'i bozulmaz)

**Scale/Scope**: 4 user story, 1 yeni tablo, 2 yeni SQL fonksiyonu, `exposure_features`'a 2-3 yeni kolon, `ImpactPanel.vue` genişletmesi

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Hazard-agnostic/model-driven**: Kritik altyapı kategorileri ve sektör etiketleri veri sütunu/config olarak eklenir, hazard tipine özel kod dallanması yok. ✅ PASS
- **Kapsam sınırları**: Dissemination kanalları değişmiyor; kimlik doğrulama değişmiyor; CAP authoring/export mantığı değişmiyor (sadece onay-anı yan etkisi ekleniyor). ✅ PASS
- **Veri kalitesi**: Veri tamlığı skoru zaten constitution'ın "data freshness indicator" ruhuna uygun yeni bir gösterge ekliyor. ✅ PASS (güçlendiriyor)
- **Güvenlik/RBAC**: `impact_snapshots` mevcut `exposure_datasets`/`impact_scenarios` RLS desenini (country_code/org_id) birebir mirror eder; onay-anı arşivleme `SECURITY DEFINER` trigger ile yapılır (log_table_change deseniyle aynı, spec 007/029). ✅ PASS
- **Basitlik/YAGNI**: Yeni Edge Function/mikroservis yok; tamamı mevcut Postgres fonksiyon/trigger mimarisi içinde. ✅ PASS
- **Test**: Kritik iş mantığı (severity mapping vb.) zaten test ediliyor; bu spec'teki hesaplamalar DB-seviyesinde, proje convention'ına göre transactional doğrulama ile kontrol edilir. ✅ PASS

Gate ihlali yok, Complexity Tracking gerekmiyor.

## Project Structure

### Documentation (this feature)

```text
specs/034-impact-analysis-gaps/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks - not yet created)
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    └── <timestamp>_impact_analysis_gaps.sql   # additive: exposure_features kolonları,
                                                # impact_snapshots tablosu + trigger,
                                                # compute_sector_breakdown(), compute_data_completeness()

src/
└── components/
    └── impact/
        └── ImpactPanel.vue   # genişletilir: kritik altyapı listesi, sektör/sınır
                               # kırılımı, veri tamlığı göstergesi, snapshot geçmişi görünümü
```

**Structure Decision**: Mevcut single-project (Vue + Supabase) yapı korunuyor. `ImpactPanel.vue` component-local state kullanıyor (spec 008'den beri Pinia store yok bu modülde) — bu spec de aynı deseni sürdürür, yeni bir store eklemez (YAGNI).

## Complexity Tracking

*Gerek yok — gate ihlali bulunmadı.*
