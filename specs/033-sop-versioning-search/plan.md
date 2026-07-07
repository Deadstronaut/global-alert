# Implementation Plan: SOP Repository Sürümleme, Kategori ve Arama

**Branch**: `033-sop-versioning-search` | **Date**: 2026-07-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/033-sop-versioning-search/spec.md`

## Summary

`sop_documents`'a bir `category` kolonu + client-side kategori/arama filtresi eklenir (US1); `sop_documents`'a bir `version` sayacı + yeni bir `sop_document_versions` (append-only, salt-okunur) tablosu ve bunu dolduran bir `BEFORE UPDATE` trigger'ı eklenir — sadece içerik-etkileyen alanlar (title/body_content/reference_url) değiştiğinde yeni bir sürüm kaydı oluşur (US2).

## Technical Context

**Language/Version**: JavaScript (Vue 3 Composition API), PL/pgSQL (trigger)

**Primary Dependencies**: Mevcut `sopDocuments.js` store, `SopRepositoryPanel.vue`, `hazardTypes.js` store (kategori dropdown deseni için referans)

**Storage**: PostgreSQL (Supabase) — 1 migration: `sop_documents`'a 2 kolon (`category`, `version`) + yeni `sop_document_versions` tablosu + `BEFORE UPDATE` trigger

**Testing**: Vitest (client-side arama/filtre saf fonksiyonu için)

**Target Platform**: Web (SopRepositoryPanel.vue)

**Project Type**: Vue 3 + Supabase web uygulaması (mevcut proje)

**Performance Goals**: N/A — küçük ölçekli liste, client-side filtreleme

**Constraints**: `sop_documents`'ın mevcut RLS'i/hazard-tipi eşleştirme mantığı/incident entegrasyonu korunur (additive)

**Scale/Scope**: 1 migration, 1 saf fonksiyon dosyası (arama/filtre), `SopRepositoryPanel.vue`'ya filtre UI + sürüm geçmişi görünümü, `sopDocuments.js` store'a `fetchSopDocumentVersions()`, 7 dilde i18n

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle V (Audit/RBAC)**: Yeni işlevlerin hepsi mevcut `sop_documents` RLS'ine (super_admin veya `sop_repository` capability grant) tabi — yeni bir yetkilendirme yolu açılmıyor; sürüm geçmişi salt-okunur, append-only (mevcut `audit_log` ilkesiyle tutarlı). ✅ PASS
- **Principle VIII (Basitlik/YAGNI)**: Arama tam metin arama altyapısı gerektirmiyor (client-side filtre yeterli); rollback/geri yükleme özelliği YOK, sadece görüntüleme (spec.md Assumptions). ✅ PASS

Gate: **PASS**, ihlal yok.

## Project Structure

### Documentation (this feature)

```text
specs/033-sop-versioning-search/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    └── <timestamp>_sop_versioning_search.sql   # NEW: category/version kolonları + sop_document_versions + trigger

src/
├── services/
│   └── sopFilter.js                # NEW: filterSopDocuments() saf fonksiyon
├── stores/sopDocuments.js          # MODIFIED: fetchSopDocumentVersions()
└── components/admin/SopRepositoryPanel.vue   # MODIFIED: kategori/arama filtresi + "Geçmiş Sürümler" görünümü

tests/unit/
└── sopFilter.test.js               # NEW

src/i18n/locales/*.json             # MODIFIED: 7 dilde yeni key'ler
```

**Structure Decision**: Mevcut projenin "saf fonksiyon ayrı dosyada, Vitest ile test edilir" convention'ı izlenir (bkz. `src/utils/sourceScope.js`, `src/services/shelterMarkerStyle.js`). Migration additive — mevcut `sop_documents` şeması/RLS'i bozulmadan genişletilir.

## Complexity Tracking

*Gerekmiyor — Constitution Check'te ihlal yok.*
