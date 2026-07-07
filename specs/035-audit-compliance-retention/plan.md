# Implementation Plan: Audit & Compliance Gaps

**Branch**: `035-audit-compliance-retention` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/035-audit-compliance-retention/spec.md`

## Summary

Audit & Compliance modülüne beş additive genişleme: (1) kategori bazlı veri saklama politikaları (`retention_policies` + periyodik pg_cron uygulaması, varsayılan olarak hiçbir şey silinmez), (2) bir CAP taslağı için CAP XML + alım kayıtları + denetim kayıtlarını tek bir ZIP'te birleştiren evidence package export'u, (3) önceden belirlenmiş hassas tablolarda (başlangıçta `exposure_datasets` — projede bugün gerçek hard-delete olan tek tablo) gerekçe zorunlu kılan bir `delete_with_justification()` RPC'si, (4) `audit_log`'a `event_category` ayrımı ile hesap kilitleme/MFA olaylarını "security_event" olarak işaretleme, (5) `get_access_review()` deseniyle birebir aynı yeni bir `get_security_config_report()` fonksiyonu. Mevcut `audit_log`/`log_table_change()` şeması bozulmadan genişletilir.

## Technical Context

**Language/Version**: JavaScript (Vue 3 `<script setup>`), PL/pgSQL (Postgres 15, Supabase)

**Primary Dependencies**: Vue 3 + Vite, Pinia, Supabase JS client, `jszip` (yeni client-side bağımlılık — evidence package ZIP oluşturma için, proje henüz hiç ZIP kütüphanesi kullanmıyor)

**Storage**: PostgreSQL (Supabase) — `audit_log` (spec 007/029), yeni `retention_policies`, `audit_log_archive`, `profiles`/`mfa_role_policy` (spec 005/028) okuma-amaçlı

**Testing**: Vitest — `computeRetentionExpiry()` ve `buildEvidencePackageManifest()` gibi çıkarılabilir saf fonksiyonlar test edilir; DB fonksiyonları transactional canlı doğrulama ile (proje convention'ı, spec 008/028/029/030)

**Target Platform**: Web (admin paneli), Supabase Edge (Postgres fonksiyonları/pg_cron)

**Project Type**: Web application (Vue frontend + Supabase backend) — mevcut single-project yapı

**Performance Goals**: `enforce_retention_policies()` periyodik işlemi, mevcut compliance/incident/drill report pg_cron job'larıyla aynı büyüklük sınıfında makul sürede tamamlanmalı; evidence package ZIP oluşturma tek bir CAP taslağı için saniyeler mertebesinde olmalı

**Constraints**: Mevcut `audit_log`/`log_table_change()` şeması ve `dispatch_jobs`/`dispatch_receipts` state machine'i (spec 009) korunur; "sil" eylemi hiçbir zaman varsayılan değildir, sadece açık yapılandırmayla etkinleşir (constitution'ın "basitlik/YAGNI" ve veri kalitesi ilkelerine uygun, geri döndürülemez işlemler için en temkinli varsayılan)

**Scale/Scope**: 5 user story, 2 yeni tablo (`retention_policies`, `audit_log_archive`), `audit_log`'a 2 yeni kolon (`event_category`, `justification`), 3 yeni SQL fonksiyonu (`enforce_retention_policies`, `delete_with_justification`, `get_security_config_report`), 1 yeni client-side bağımlılık (jszip)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Hazard-agnostic/model-driven**: Bu spec hazard tipiyle ilgili değil, doğrudan etkilemiyor. ✅ PASS (N/A)
- **Kapsam sınırları**: Dissemination kanalları/kimlik doğrulama/CAP authoring mantığı değişmiyor; sadece additive denetim/uyumluluk katmanları ekleniyor. ✅ PASS
- **Veri kalitesi**: Retention politikaları veri yönetişimini güçlendiriyor, mevcut veri modelini bozmuyor. ✅ PASS
- **Güvenlik/RBAC**: Tüm yeni tablolar/fonksiyonlar super_admin-only (retention_policies, security config raporu) veya mevcut capability-grant desenini (`audit` capability) mirror ediyor; `delete_with_justification()` ve `enforce_retention_policies()` SECURITY DEFINER, log_table_change() ile aynı desen. ✅ PASS
- **Basitlik/YAGNI**: Yeni mikroservis/harici depolama yok; jszip tek yeni client-side bağımlılık, sunucu tarafında hiçbir yeni altyapı gerekmiyor (mevcut Postgres+pg_cron+Edge Function). ✅ PASS
- **Test**: Saf hesaplama mantığı (retention expiry, evidence manifest) test ediliyor; DB fonksiyonları proje convention'ına göre transactional doğrulanıyor. ✅ PASS

Gate ihlali yok, Complexity Tracking gerekmiyor.

## Project Structure

### Documentation (this feature)

```text
specs/035-audit-compliance-retention/
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
    └── <timestamp>_audit_compliance_gaps.sql   # additive: audit_log kolonları,
                                                  # retention_policies, audit_log_archive,
                                                  # enforce_retention_policies(),
                                                  # delete_with_justification(),
                                                  # get_security_config_report(),
                                                  # mevcut record_failed_login()/MFA
                                                  # akışlarına security_event loglama eki

src/
├── lib/
│   ├── auditExport.js              # mevcut yardımcılar yeniden kullanılır
│   ├── capExport.js                 # mevcut generateCapXml() yeniden kullanılır
│   └── evidencePackage.js           # YENİ: buildEvidencePackageManifest() (saf fonksiyon)
├── components/
│   ├── admin/
│   │   ├── RetentionPolicyPanel.vue      # YENİ (US1)
│   │   ├── SecurityEventsPanel.vue       # YENİ (US4)
│   │   └── DeletionJustificationModal.vue # YENİ (US3, ExposureDatasetManager.vue içinde kullanılır)
│   └── impact/
│       └── ExposureDatasetManager.vue     # genişletilir: delete_with_justification() RPC'sini kullanır
└── views/
    └── CapView.vue                        # genişletilir: "Kanıt Paketi İndir" butonu (US2)

package.json                                 # +jszip bağımlılığı
```

**Structure Decision**: Mevcut single-project (Vue + Supabase) yapı korunuyor. Yeni admin panelleri, mevcut `AdminView.vue`'nun Audit/Denetim sekmesine eklenen ek bileşenler olarak tasarlanıyor (spec 019/026/028/030'daki "tüm otomatik rapor/denetim araçları Audit sekmesinde yaşar" convention'ı).

## Complexity Tracking

*Gerek yok — gate ihlali bulunmadı.*
