# Implementation Plan: Rüzgar Yönüne Dayalı Yayılım Tahmini

**Branch**: `070-wind-fire-spread` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/070-wind-fire-spread/spec.md`

## Summary

Rüzgar hızı verisi zaten sisteme giriyor (GFS UGRD/VGRD bileşenleri) ama sadece skaler hıza indirgenip kullanılıyor — asıl yön bilgisi hiçbir yerde saklanmıyor. Bu özellik, ingest sırasında zaten indirilen u/v bileşenlerinden yön bilgisini çıkarıp afet olaylarının kullandığı aynı h3_id sistemine bağlayacak; rüzgardan gerçekten etkilenen afet tiplerinde (yangın, toz fırtınası, yanardağ külü, kasırga — kaba yön göstergesi olarak) olayın konumundan başlayan basit bir komşu-hex yayılım tahmini üretip haritada gösterecek ve mevcut Etki Analizi akışına bağlayacak.

## Technical Context

**Language/Version**: Python 3.x (wind-importer/ ingest), TypeScript/Deno (supabase/functions/), JavaScript/Vue 3 `<script setup>` (frontend)

**Primary Dependencies**: GDAL/numpy (wind-importer, u/v raster işleme — zaten mevcut), h3-js (frontend + server/, hex hesaplama — zaten mevcut), MapLibre GL JS (harita render), Supabase JS client, Pinia (state)

**Storage**: Yeni bir tablo YOK — mevcut `flow_snapshots` texture'ı (Supabase Storage'da PNG + `forecast_snapshots`/`flow_snapshots` tablosundaki min/max metadata) tek veri kaynağı; hex_id, afet olaylarının zaten kullandığı sütunla aynı biçimde yalnızca frontend'de anlık hesaplanır, kalıcı olarak saklanmaz

**Testing**: Vitest (frontend, `tests/unit/*.test.js` deseni), `node:test` (server/, `*.test.js` deseni), Python tarafı için mevcut wind-importer test deseni varsa onunla tutarlı

**Target Platform**: Web (mevcut SPA) + mevcut ingest pipeline'ı (wind-importer Python worker, zaten çalışıyor)

**Project Type**: Web application — mevcut yapının doğal uzantısı (yeni bir servis/mikroservis değil, Constitution VIII gereği)

**Performance Goals**: Seçilen bir afet için olası etki alanının 3 saniye içinde haritada görünmesi (spec SC-001)

**Constraints**: Rüzgar yönü/yayılım verisi eksikse asla uydurulmayacak (FR-005); yalnızca gerçekten rüzgardan etkilenen afet tiplerinde çalışacak (FR-009); Supabase-native kalınacak, yeni bir harici servis/kuyruk eklenmeyecek (Constitution VIII)

**Scale/Scope**: Mevcut h3 çözünürlüğü (bugün afetler için kurulan res 7 grid) ve mevcut rüzgar veri hacmi (GFS 0.25°/0.5° global grid) üzerine kurulu — yeni bir veri kaynağı entegrasyonu yok

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. "Hangi afet tipi rüzgardan etkilenir" listesi (spec Assumptions) kod içinde yapısal bir dallanma değil, tek bir yerden yönetilen bir konfigürasyon/bayrak olarak tutulacak (bkz. data-model.md — `WIND_AFFECTED_HAZARD_TYPES`), yeni bir afet tipi eklendiğinde bu listeye bir satır eklemek yeterli olacak.
- **II. Scope Discipline** — PASS. Dissemination/kimlik/CAP sınırlarına dokunmuyor; mevcut Etki Analizi/alarm akışına sadece bir "seçili bölge" olarak bağlanıyor (US3), yeni bir dağıtım kanalı eklemiyor.
- **III. CAP v1.2 Compliance** — N/A. Bu özellik CAP mesajı üretmiyor/değiştirmiyor.
- **IV. Data Quality & Normalization** — PASS. Yeni rüzgar-hex verisi, mevcut freshness/"as of" desenini (FR-006, SC-002) takip edecek; eksik/bayat veri asla sessizce gizlenmeyecek.
- **V. Access Control & Auditability** — N/A (yeni bir yetki sınırı/audit olayı gerektirmiyor; mevcut anon-okur modelini genişletiyor, yazma yalnızca mevcut ingest pipeline'ından).
- **VI. Accessibility & Internationalization** — PASS (gate, uygulama sırasında izlenecek). Yeni tüm UI metinleri (yön göstergesi etiketleri, "olası etki alanı" başlığı, veri-yok durumu mesajı) 7 dile eklenecek, bugüne kadarki tüm oturum boyunca izlenen desenle aynı.
- **VII. Performance & Resilience** — PASS. Mevcut canvas/raster tabanlı harita render yaklaşımı korunuyor (yeni bir SVG-per-feature yaklaşımı yok); hex sorgulaması mevcut h3_id indeksleri üzerinden.
- **VIII. Simplicity & YAGNI** — PASS. Yeni bir mikroservis/kuyruk/harici veri kaynağı/veritabanı tablosu yok — mevcut Animate katmanının zaten yayınladığı u/v texture'ı istemci tarafında tek bir noktada (seçili afetin hex merkezi) çözülüyor. Bkz. research.md — mevcut `flow_texture_common.py`/`fetch_gfs.py` hiç değişmiyor, yeni bir ingest adımı veya migration açılmıyor.

Gate sonucu: **PASS**, ihlal yok, Complexity Tracking tablosu boş kalabilir.

## Project Structure

### Documentation (this feature)

```text
specs/070-wind-fire-spread/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
# wind-importer/ ve supabase/'a HİÇBİR yeni dosya/migration eklenmiyor —
# research.md'de detaylandırıldığı gibi, Animate katmanı için zaten
# yayınlanan flow_snapshots u/v texture'ı (fetch_gfs.py +
# flow_texture_common.py, ikisi de değişmeden) bu özelliğin de tek veri
# kaynağı. Yeni bir ingest adımı/tablo eklemek yerine, mevcut texture'ı
# istemci tarafında tek bir noktada (seçilen afetin hex merkezinde) çözmek
# Constitution VIII (Simplicity & YAGNI) ile en uyumlu, en küçük değişiklik.

src/
├── utils/
│   ├── windDirectionAtPoint.js        # NEW — verilen (lat,lng) + mevcut flow_snapshot
│   │                                   #   (textureUrl, bounds, uMin/uMax/vMin/vMax) için,
│   │                                   #   texture'ın o noktadaki pikselini okuyup gerçek
│   │                                   #   u/v değerine, oradan hız+yöne çevirir (canvas
│   │                                   #   pixel-read, aynı decode şeması simple-wind-layer.js
│   │                                   #   particle renderer'ının zaten kullandığıyla birebir)
│   └── windSpreadPrediction.js        # NEW — kaynak h3_id + rüzgar yönü verildiğinde, o
│                                       #   yöndeki birkaç komşu hex halkasını (h3-js
│                                       #   gridDisk/directional filtre) "olası etki alanı"
│                                       #   olarak döndüren saf fonksiyon
├── stores/
│   └── ui.js                          # + seçili afet için olası etki alanı state'i (varsa)
├── components/
│   ├── MapView.vue                    # + seçili rüzgardan-etkilenen afet için olası etki
│   │                                   #   alanı hex overlay + yön oku render'ı
│   └── impact/
│       └── ImpactPanel.vue            # + "bu alanı incele" — üretilen hex kümesini mevcut
│                                       #   exposure-dataset bbox/bölge akışına aktarma
└── i18n/locales/*.json                # + yeni anahtarlar (7 dil) — yön/yayılım UI metinleri
```

**Structure Decision**: Yeni bir servis, süreç veya veritabanı tablosu YOK. Mevcut Animate katmanının zaten yayınladığı ham u/v texture'ı, bu özelliğin de tek veri kaynağı — yalnızca istemci tarafında (frontend) birkaç yeni dosya. Bu, ilk taslakta düşünülen "yeni forecast_hex_wind tablosu + yeni Python ingest modülü" yaklaşımından belirgin şekilde daha küçük — research.md bu kararın gerekçesini detaylandırıyor.

## Complexity Tracking

*Gate ihlali yok — bu bölüm boş bırakıldı.*
