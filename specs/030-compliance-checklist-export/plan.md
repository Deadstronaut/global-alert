# Implementation Plan: Uyumluluk Kontrol Listesi Export'u ve Şablon Versiyonlama

**Branch**: `030-compliance-checklist-export` | **Date**: 2026-07-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/030-compliance-checklist-export/spec.md`

## Summary

`compliance_reports` (spec 019) ve `audit_log_dead_letter`/`chk_audit_log_completeness` (spec 029) mevcut verilerinden, PRD'nin MHEWS-FR-0067/0071 gereksinimlerine karşılık gelen yapılandırılmış bir kontrol listesi export'u üretilir; bu çıktı ve mevcut CSV/JSON export'ları sabit bir `TEMPLATE_VERSION` alanı taşır. Tamamen frontend/service-layer bir spec — hiçbir migration gerekmez.

## Technical Context

**Language/Version**: JavaScript (Vue 3 Composition API, `<script setup>`), Vitest

**Primary Dependencies**: Pinia yok (bu spec state gerektirmiyor), mevcut `src/lib/auditExport.js` (`rowsToCsv`/`rowsToJson`/`triggerDownload`), Supabase JS client (salt-okunur select)

**Storage**: Yok — yeni migration gerekmiyor, mevcut `compliance_reports`/`audit_log_dead_letter` tablolarından salt-okunur okuma

**Testing**: Vitest, mock'suz saf fonksiyon testi (mevcut proje convention'ı)

**Target Platform**: Web (mevcut AdminView.vue Denetim sekmesi)

**Project Type**: Vue 3 + Supabase web uygulaması (mevcut proje)

**Performance Goals**: N/A — tek bir rapor kaydı üzerinde senkron hesaplama, ek network isteği yok (dead-letter count zaten mevcut)

**Constraints**: Mevcut `compliance_reports`/`audit_log`/`audit_log_dead_letter` şeması ve mevcut CSV/JSON export davranışı değişmeyecek (additive)

**Scale/Scope**: Tek bir yeni saf fonksiyon dosyası + AdminView.vue'ya küçük bir ek buton/aksiyon + 7 dilde i18n

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle V (Audit/RBAC)**: Kontrol listesi export'u sadece mevcut `compliance_reports`/`audit_log_dead_letter` verisini okur, yeni bir yazma yolu açmaz; erişim mevcut Super Admin-only RLS'e tabidir (FR-005). ✅ PASS
- **Principle VIII (Basitlik/YAGNI)**: Yeni migration yok, yeni tablo yok, PDF/S3 yok — tamamen mevcut export altyapısının üzerine, saf fonksiyon + sabit versiyon alanı. ✅ PASS
- Diğer prensipler bu spec'in kapsamına girmiyor (hazard-agnostic tasarım, CAP uyumluluğu, vs. — ilgisiz).

Gate: **PASS**, ihlal yok.

## Project Structure

### Documentation (this feature)

```text
specs/030-compliance-checklist-export/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── services/
│   └── complianceChecklist.js   # NEW: buildComplianceChecklist(), TEMPLATE_VERSION
├── views/
│   └── AdminView.vue            # MODIFIED: "Kontrol Listesi Olarak Dışa Aktar" aksiyonu eklenir
└── i18n/locales/*.json          # MODIFIED: 7 dilde yeni key'ler

tests/unit/
└── complianceChecklist.test.js  # NEW: buildComplianceChecklist() saf fonksiyon testleri
```

**Structure Decision**: Mevcut projenin "saf fonksiyon ayrı dosyada, Vitest ile test edilir" convention'ı izlenir (bkz. `src/services/shelterMarkerStyle.js`, `src/stores/hazardTypes.js`'deki `wouldCreateCycle`). Migration yok — Constitution Check'te belirtildiği gibi tamamen additive frontend değişikliği.

## Complexity Tracking

*Gerekmiyor — Constitution Check'te ihlal yok.*
