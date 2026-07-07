# Implementation Plan: Tatbikat Raporlama ve Geri Bildirim Döngüsü

**Branch**: `032-drill-reporting-feedback` | **Date**: 2026-07-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/032-drill-reporting-feedback/spec.md`

## Summary

Tatbikat özetleri (`drill_sessions.summary`) mevcut CSV/JSON export altyapısıyla dışa aktarılabilir hale getirilir; Incident Tracking'in (spec 026) `incident_reports`/`generate-incident-report`/pg_cron deseninin birebir bir kopyası olarak yeni bir `drill_reports` tablosu + `generate-drill-report` Edge Function + yıllık pg_cron job eklenir; `drill_sessions`'a bir ders-çıkarımı notu + isteğe bağlı afet tipi ilişkilendirmesi (mevcut `hazard_types`'a FK) eklenir.

## Technical Context

**Language/Version**: TypeScript (Deno Edge Functions), JavaScript (Vue 3 Composition API, `<script setup>`), Vitest, Deno test

**Primary Dependencies**: Mevcut `rowsToCsv`/`rowsToJson`/`triggerDownload` (`src/lib/auditExport.js`), `pg_cron`/`pg_net` (spec 019/026 deseni), `drillMetrics.js`/`drillMetrics.ts` (spec 017)

**Storage**: PostgreSQL (Supabase) — 1 migration: yeni `drill_reports` tablosu (incident_reports'un yapısal ikizi) + `drill_sessions`'a 2 yeni kolon (`lessons_learned`, `related_hazard_type`)

**Testing**: Vitest (frontend export flatten mantığı gerekirse), Deno test (yeni `drillReportSummary.ts` saf fonksiyonu, `incidentReportSummary.test.ts` deseninde)

**Target Platform**: Web (AdminView.vue Tatbikat sekmesi, yeni Deno Edge Function)

**Project Type**: Vue 3 + Supabase web uygulaması (mevcut proje)

**Performance Goals**: N/A — yıllık pg_cron job, gerçek zamanlı değil

**Constraints**: `drill_sessions`'ın mevcut kolonları/RLS/state machine'i korunur (additive); yeni `drill_reports` mevcut `incident_reports`/`compliance_reports` desenini birebir izler

**Scale/Scope**: 1 migration, 1 yeni Edge Function + 1 yeni saf fonksiyon dosyası (Deno), AdminView.vue'ya export butonu + ders-çıkarımı formu + yıllık rapor alt bölümü, 7 dilde i18n

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle V (Audit/RBAC)**: Yeni işlevlerin hepsi mevcut `drill_sessions` RLS'ine (super_admin/country_admin/org_admin, kendi ülke/org) tabi — yeni bir yetkilendirme yolu açılmıyor. Ders-çıkarımı notu mevcut `audit_drill_sessions` trigger'ı tarafından otomatik loglanıyor. ✅ PASS
- **Principle VIII (Basitlik/YAGNI)**: Yıllık rapor, mevcut `incident_reports` deseninin BİREBİR kopyası (yeni bir mimari yaklaşım icat edilmiyor); ders-çıkarımı → eşik değişikliği insan-onaylı bir bağlantı, otomatik kalibrasyon YOK (spec.md Assumptions). ✅ PASS

Gate: **PASS**, ihlal yok.

## Project Structure

### Documentation (this feature)

```text
specs/032-drill-reporting-feedback/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   └── generate-drill-report.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   └── <timestamp>_drill_reporting_feedback.sql   # NEW: drill_reports tablosu + drill_sessions'a 2 kolon + pg_cron job
├── functions/
│   ├── generate-drill-report/index.ts              # NEW: incident_reports'un ikizi
│   └── shared/
│       ├── drillReportSummary.ts                    # NEW: computeDrillReportSummary() saf fonksiyon
│       └── drillReportSummary.test.ts               # NEW

src/
└── views/AdminView.vue   # MODIFIED: downloadDrillSummary(), drillReports listesi + export, ders-çıkarımı formu

src/i18n/locales/*.json   # MODIFIED: 7 dilde yeni key'ler
```

**Structure Decision**: Mevcut `incident_reports`/`generate-incident-report` mimarisine paralel, additive bir genişleme. Ders-çıkarımı UI'ı, AdminView.vue'nun mevcut Tatbikat sekmesine (`drill-card` şablonuna) eklenir — yeni bir component gerekmez (mevcut kartın boyutu küçük bir ek formu barındırmaya uygun).

## Complexity Tracking

*Gerekmiyor — Constitution Check'te ihlal yok.*
