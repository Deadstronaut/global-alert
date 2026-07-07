# Implementation Plan: Sığınakların Harita Üzerinde Gösterimi

**Branch**: `027-shelter-map-display` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-shelter-map-display/spec.md`

## Summary

Ana harita görünümüne (`MapView.vue`, MapLibre GL JS), mevcut afet-olayı marker deseninden (`updateMarkers()`/`clearMarkers()`) bağımsız ama paralel bir sığınak marker katmanı eklenir. Aktif ve koordinatlı sığınaklar (`sheltersStore`'dan salt-okunur tüketilir) durumlarına göre renklendirilmiş işaretçilerle gösterilir, tıklanınca ad/doluluk/durum/bağlı-olay bilgisi popup'ta görünür. Katman `uiStore.showShelters` boolean'ıyla açılıp kapatılabilir. Backend'e (migration/RLS/`map_layers` registry) hiçbir değişiklik yapılmaz — tamamen frontend-only bir spec.

## Technical Context

**Language/Version**: JavaScript (ES2020+), Vue 3 Composition API (`<script setup>`)

**Primary Dependencies**: Vue 3, Pinia, `maplibregl` (proje içinde "Leaflet" olarak anılıyor ama gerçek kütüphane MapLibre GL JS), vue-i18n

**Storage**: Supabase Postgres — sadece mevcut `shelters` tablosunun salt-okunur tüketimi (`sheltersStore.fetchShelters()` zaten var); bu spec migration İÇERMEZ

**Testing**: Vitest (`tests/unit/*.test.js`) — saf fonksiyonlar için mock'suz birim test, proje convention'ı

**Target Platform**: Web (masaüstü + mobil tarayıcı), Capacitor ile mobil sarmalama

**Project Type**: Web application (tek Vue 3 + Supabase projesi, `frontend`/`backend` ayrımı yok)

**Performance Goals**: Sığınak sayısı düşük (onlarca-yüzlerce), marker render'ı disaster-event marker'larıyla aynı senkron DOM oluşturma yaklaşımını kullanır — ek performans optimizasyonu (clustering, virtualization) gerekmez (spec'te YAGNI olarak işaretlendi)

**Constraints**: Mevcut `updateMarkers()`/`clearMarkers()`/disaster-event mantığına dokunulmaz; `shelters` tablosu/RLS'i ve `map_layers` registry'si değiştirilmez; sığınak marker'ları zoom-seviyesine bağlı gizleme kuralına (disaster event'lerin tabi olduğu) tabi DEĞİLDİR

**Scale/Scope**: Tek dosyaya (`MapView.vue`) yeni fonksiyonlar + `ui.js`'e bir boolean + bir yeni saf-fonksiyon dosyası + 7 dilde i18n anahtarları; migration yok, yeni Edge Function yok

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Hazard-agnostic/model-driven tasarım**: Etkilenmiyor — bu spec hazard type/severity şemasına dokunmuyor, sadece mevcut `shelters` verisini görselleştiriyor. PASS.
- **Kapsam sınırları (dissemination)**: Bu özellik dissemination kanalı değil, mevcut bir görselleştirme özelliği; kapsam ihlali yok. PASS.
- **Erişilebilirlik ve i18n**: Yeni kullanıcı arayüzü metinleri (toggle etiketi, popup alan etiketleri) 7 dile eklenecek, mevcut dark/light/high-contrast tema değişkenleri kullanılacak. PASS.
- **Basitlik/YAGNI**: Clustering, gerçek zamanlı güncelleme, `map_layers` registry'sine uydurma gibi karmaşıklıklar bilinçli olarak dışlandı; mevcut disaster-event marker desenine paralel, minimal yeni kod. PASS.
- **Test**: Sığınak durumu→renk eşleme mantığı gibi saf fonksiyonlar Vitest ile test edilecek (proje convention'ı — deduplication/severity mapping/CAP validation gibi kritik iş mantığı testi ilkesiyle tutarlı, burada "marker stil seçimi" benzer şekilde test edilebilir saf mantık). PASS.
- **Güvenlik/erişim**: Yeni bir yetkilendirme yolu açılmıyor — mevcut `authenticated_shelters_read` RLS'i (spec 021) aynen kullanılıyor, hiçbir tabloya/policy'ye dokunulmuyor. PASS.

Sonuç: Hiçbir ihlal yok, Complexity Tracking bölümü gerekmiyor.

## Project Structure

### Documentation (this feature)

```text
specs/027-shelter-map-display/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
src/
├── components/
│   └── MapView.vue                 # MODIFIED: shelter marker layer, onMounted fetch, watch
├── services/
│   └── shelterMarkerStyle.js       # NEW: pure function(s) — getShelterMarkerColor(status)
├── stores/
│   ├── ui.js                       # MODIFIED: showShelters boolean + toggleShelters()
│   └── shelters.js                 # UNCHANGED (already has fetchShelters/occupancyPercentage)
└── i18n/locales/*.json             # MODIFIED: 7 locale files, new shelterMap.* keys

tests/
└── unit/
    └── shelterMarkerStyle.test.js  # NEW: Vitest, pure function coverage
```

**Structure Decision**: Tek Vue 3 + Supabase projesi (mevcut proje yapısı), `frontend`/`backend` ayrımı yok. Bu spec migration/Edge Function içermediği için `supabase/` dizininde değişiklik yok — sadece `src/` altında.

## Complexity Tracking

*Yok — Constitution Check'te hiçbir ihlal tespit edilmedi.*
