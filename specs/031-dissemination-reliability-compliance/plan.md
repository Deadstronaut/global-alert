# Implementation Plan: Dissemination Güvenilirliği ve Uyum

**Branch**: `031-dissemination-reliability-compliance` | **Date**: 2026-07-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/031-dissemination-reliability-compliance/spec.md`

## Summary

`dispatch-alert` Edge Function'ına dil-lokalizasyonlu e-posta içeriği, bir unsubscribe linki ve yeni bir servis-rolü-only "otomatik retry" modu eklenir; `dispatch_jobs`/`dispatch_receipts`'e backoff/bildirim için 2 yeni kolon eklenir; `contacts.js`'e bir anonimleştirme aksiyonu eklenir. Araştırma sırasında önemli bir bulgu: `contacts.email_opt_in`/`whatsapp_opt_in` kolonları VE `dispatchMatching.ts`'nin bunları zaten kontrol ettiği tespit edildi — unsubscribe (US2) bu yüzden yeni bir kolon gerektirmiyor, sadece mevcut `email_opt_in`'i `false` yapan anon-callable bir endpoint yeterli.

## Technical Context

**Language/Version**: TypeScript (Deno Edge Functions), JavaScript (Vue 3 Composition API, `<script setup>`), Vitest

**Primary Dependencies**: Mevcut `emailProviders` adapter (Resend/SendGrid), `dispatchMatching.ts`, Supabase JS client, `pg_cron`/`pg_net` (spec 013/019/026 deseni)

**Storage**: PostgreSQL (Supabase) — 1 migration: `dispatch_receipts.last_attempted_at`, `dispatch_jobs.admin_notified_at`; `contacts` şemasına değişiklik YOK (`email_opt_in` zaten var)

**Testing**: Vitest, mock'suz saf fonksiyon testi (dil-seçim mantığı, backoff hesaplama)

**Target Platform**: Web (dispatch-alert/unsubscribe Edge Functions, AdminView.vue ContactsPanel/DispatchPanel)

**Project Type**: Vue 3 + Supabase web uygulaması (mevcut proje)

**Performance Goals**: N/A — periyodik pg_cron (15 dakikada bir), gerçek zamanlı değil

**Constraints**: `dispatch_jobs`/`dispatch_receipts`/`cap_drafts`/`contacts` şemasının mevcut kolonları/RLS/state machine'i korunur (additive); Constitution'ın kanal kısıtı (Email/WebPortal/WhatsApp) değişmez

**Scale/Scope**: 1 migration, `dispatch-alert/index.ts`'e 1 yeni mod + mevcut fonksiyonların genişletilmesi, 1 yeni `unsubscribe` Edge Function, 2 yeni saf fonksiyon dosyası, `contacts.js`/`ContactsPanel.vue`/`DispatchPanel.vue` küçük eklemeler, 7 dilde i18n

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle II (Kapsam sınırları — dissemination kanalları)**: Bu spec sadece mevcut Email kanalını genişletiyor (lokalizasyon, unsubscribe, retry, admin bildirimi) — SMS/push/siren eklenmiyor, WhatsApp'a dokunulmuyor (mock adapter aynı kalıyor). ✅ PASS
- **Principle V (Audit/RBAC)**: Yeni `unsubscribe` endpoint'i `ack-dispatch` ile aynı anon-callable, dar-kapsamlı deseni izliyor — hiçbir yeni RLS bypass'ı açmıyor, sadece `email_opt_in` alanını günceller (zaten var olan bir alan). Anonimleştirme sadece Super Admin'e açık, mevcut RLS ile korunuyor, mevcut `audit_contacts` trigger'ı otomatik loglar. ✅ PASS
- **Principle VIII (Basitlik/YAGNI)**: Otomatik retry gerçek zamanlı değil, mevcut pg_cron deseniyle periyodik; unsubscribe yeni kolon gerektirmiyor (mevcut `email_opt_in` yeniden kullanılıyor) — araştırma sırasında bir kolon daha AZ eklenmesi gerektiği keşfedildi. ✅ PASS

Gate: **PASS**, ihlal yok.

## Project Structure

### Documentation (this feature)

```text
specs/031-dissemination-reliability-compliance/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── unsubscribe.md
│   └── dispatch-alert-auto-retry.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   └── <timestamp>_dissemination_reliability.sql   # NEW: 2 kolon + pg_cron job
├── functions/
│   ├── dispatch-alert/index.ts                      # MODIFIED: dil-lokalizasyonu, unsubscribe linki, Mode C (auto_retry), manual retry reset
│   ├── unsubscribe/index.ts                         # NEW: ack-dispatch'in kopyası
│   └── shared/
│       ├── emailLocalization.ts                      # NEW: resolveLocalizedContent() saf fonksiyon
│       └── dispatchBackoff.ts                        # NEW: shouldAutoRetryNow() saf fonksiyon

src/
├── stores/contacts.js               # MODIFIED: anonymizeContact()
├── components/admin/
│   ├── ContactsPanel.vue            # MODIFIED: "Anonimleştir" aksiyonu
│   └── DispatchPanel.vue            # MODIFIED: (gerekirse) admin bildirim durumu gösterimi
└── i18n/locales/*.json              # MODIFIED: 7 dilde yeni key'ler

tests/unit/
├── emailLocalization.test.js         # NEW (Deno fonksiyonu ama saf mantık ayrıca JS'te de test edilebilir — plan: research.md'de netleştir)
└── dispatchBackoff.test.js           # NEW
```

**Structure Decision**: Mevcut `ack-dispatch`/`emailProviders` mimarisine paralel, additive bir genişleme. Yeni saf fonksiyonlar Deno (`supabase/functions/shared/`) tarafında yaşıyor çünkü `dispatch-alert`/`unsubscribe` Edge Function'ları tarafından kullanılıyor — proje convention'ında zaten `dispatchMatching.ts`/`dispatchStateMachine.ts`/`dispatchRetryAuthorization.ts` bu şekilde (Deno tarafında, `.test.ts` ile) test ediliyor; bu spec de aynı deseni izler (`tests/unit/*.test.js` yerine Deno-native test).

## Complexity Tracking

*Gerekmiyor — Constitution Check'te ihlal yok.*
