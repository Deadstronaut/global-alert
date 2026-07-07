# Implementation Plan: Denetim Günlüğü Dayanıklılığı

**Branch**: `029-audit-log-resilience` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/029-audit-log-resilience/spec.md`

## Summary

PRD'nin M9 modülündeki iki CRITICAL/S1 gereksinimi kapatıyor: (1) `log_table_change()` trigger fonksiyonu, her `INSERT INTO audit_log` çağrısını `EXCEPTION WHEN OTHERS` ile sarmalayacak şekilde güncelleniyor — yazma başarısız olursa hata yeni bir `audit_log_dead_letter` tablosuna düşer, asıl trigger'ı tetikleyen işlem (`profiles`/`organizations` INSERT/UPDATE/DELETE) hiçbir zaman engellenmez. Super Admin, Denetim sekmesinden yeni bir "Bekleyen Denetim Kayıtları" alt bölümünde bunları görüp `flush_audit_dead_letter()` ile tekrar deneyebilir. (2) `audit_log` tablosuna, sadece kaynağa-bağlı (`INSERT`/`UPDATE`/`DELETE`) olaylarda `table_name`/`record_id`'nin boş olamayacağını zorunlu kılan bir `CHECK` constraint eklenir — `LOGIN`/`EXPORT` gibi kaynak-bağımsız olaylar muaf.

## Technical Context

**Language/Version**: SQL (PL/pgSQL) for the trigger/function changes; JavaScript (Vue 3) for the small AdminView.vue addition

**Primary Dependencies**: Supabase Postgres, Vue 3, Pinia

**Storage**: Supabase Postgres — yeni `audit_log_dead_letter` tablosu, `audit_log`'a yeni bir `CHECK` constraint (yeni kolon yok)

**Testing**: Canlıda transactional test (BEGIN/temp-table-log/ROLLBACK, proje convention'ı) — trigger'ın exception-yakalama davranışını ve CHECK constraint'in doğru olayları reddedip doğru olayları kabul ettiğini doğrulamak için; yeni bir Vitest dosyası gerekmiyor (mantık tamamen SQL'de)

**Target Platform**: Supabase Postgres (backend), Vue 3 admin panel (küçük bir UI eklentisi)

**Project Type**: Web application (tek Vue 3 + Supabase projesi)

**Performance Goals**: Standart — dead-letter senaryosu son derece nadir (aynı transaction içindeki bir INSERT'in başarısız olması), performans etkisi ihmal edilebilir

**Constraints**: `audit_log`'un mevcut şeması/RLS'i/hash-zinciri (`verify_audit_chain()`, spec 007) DEĞİŞMEZ; CHECK constraint mevcut satırları etkilemeyecek şekilde tasarlanmalı (hepsi zaten kuralı sağlıyor); trigger'daki exception-yakalama, asıl `RETURN NEW`/`RETURN OLD` davranışını hiçbir koşulda bozmamalı

**Scale/Scope**: Tek migration dosyası (CHECK constraint + yeni tablo + güncellenmiş `log_table_change()` + yeni `flush_audit_dead_letter()` fonksiyonu), `AdminView.vue`'ya küçük bir alt bölüm eklentisi

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Hazard-agnostic/model-driven tasarım**: Etkilenmiyor. PASS.
- **Kapsam sınırları**: Denetim/erişim kontrolü sınırları içinde, dissemination/CAP/kimlik federasyonuna dokunmuyor. PASS.
- **Erişilebilirlik ve i18n**: Yeni UI metinleri ("Bekleyen Denetim Kayıtları", "Tekrar Dene") 7 dile eklenecek. PASS.
- **Basitlik/YAGNI**: Otomatik/zamanlanmış tekrar deneme (pg_cron) bilinçli olarak eklenmiyor, sadece manuel tetikleme (spec Assumptions). PASS.
- **Test**: Trigger/constraint davranışı canlıda transactional test ile doğrulanacak (proje convention'ı — kritik iş mantığı testi ilkesiyle tutarlı, bu durumda "iş mantığı" saf bir JS fonksiyonu değil bir DB kuralı olduğu için canlı SQL testi uygun araç). PASS.
- **Güvenlik/erişim**: `audit_log_dead_letter` sadece super_admin'e açık (mevcut `audit_log` erişim deseniyle birebir aynı), `flush_audit_dead_letter()` super_admin-only SECURITY DEFINER, `SET search_path = public` içerecek. PASS.
- **Veri kalitesi (Principle IV)**: Bu spec doğrudan bu ilkeyle örtüşüyor — "tamlık doğrulaması" tam olarak bu ilkenin ruhuna uygun bir ekleme (malformed/eksik payload'ları reddet). PASS, hatta güçlendiriyor.

Sonuç: Hiçbir ihlal yok, Complexity Tracking gerekmiyor.

## Project Structure

### Documentation (this feature)

```text
specs/029-audit-log-resilience/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    └── <timestamp>_audit_log_resilience.sql   # NEW: CHECK constraint + audit_log_dead_letter + updated log_table_change() + flush_audit_dead_letter()

src/
└── views/
    └── AdminView.vue                           # MODIFIED: "Bekleyen Denetim Kayıtları" alt bölümü (Denetim sekmesi)

src/i18n/locales/*.json                          # MODIFIED: 7 dil, yeni metinler
```

**Structure Decision**: Tek Vue 3 + Supabase projesi. Bu spec `supabase/` altında tek bir yeni migration dosyası ekler, `frontend`/`backend` ayrımı gerekmez.

## Complexity Tracking

*Yok — Constitution Check'te ihlal tespit edilmedi.*
