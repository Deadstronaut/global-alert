# Implementation Plan: Erişim İnceleme Raporu ve Hesap Kilitleme

**Branch**: `028-access-review-lockout` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-access-review-lockout/spec.md`

## Summary

İki bağımsız PRD gereksinimi tek spec'te bundle ediliyor: (1) Super Admin'in tüm kullanıcıları rol/yetki/son-giriş bilgisiyle görüp dışa aktarabildiği bir Erişim İnceleme görünümü — mevcut Kullanıcılar admin panelinin yeni bir SECURITY DEFINER fonksiyonla (`get_access_review()`, `auth.users.last_sign_in_at`'ı da okuyabilmek için) beslenen bir uzantısı; (2) art arda başarısız giriş denemesinden sonra hesabı geçici kilitleyen bir mekanizma — `profiles` tablosuna eklenen `failed_login_attempts`/`locked_until` kolonları, anon-callable bir `record_failed_login()` fonksiyonu ve `auth.js`'in `login()` akışına eklenen bir post-auth kilit kontrolü. Supabase Auth'un kendi `signInWithPassword` mekanizması değiştirilmiyor.

## Technical Context

**Language/Version**: JavaScript (ES2020+), Vue 3 Composition API; SQL (PL/pgSQL) for new functions

**Primary Dependencies**: Vue 3, Pinia, Supabase (Postgres + Supabase Auth + PostgREST), vue-i18n

**Storage**: Supabase Postgres — 2 yeni nullable/default kolon `profiles`'a eklenir (`failed_login_attempts`, `locked_until`); yeni rapor tablosu YOK (Erişim İnceleme Raporu canlı sorgu, research.md Decision 2)

**Testing**: Vitest (frontend saf fonksiyonlar), proje convention'ı — SQL fonksiyonlarının authorization mantığı canlıda transactional test (BEGIN/ROLLBACK) ile doğrulanacak, önceki spec'lerdeki teknik gibi

**Target Platform**: Web (masaüstü + mobil tarayıcı), Capacitor mobil sarmalama

**Project Type**: Web application (tek Vue 3 + Supabase projesi)

**Performance Goals**: Standart — kullanıcı sayısı düşük/orta ölçekli (onlarca-yüzlerce profil), ek optimizasyon gerekmez

**Constraints**: Supabase Auth'un `signInWithPassword`/rate-limiting davranışı DEĞİŞTİRİLMEZ; kilit kontrolü sadece uygulama katmanında (post-auth) uygulanır; IP bazlı rate-limiting/CAPTCHA kapsam dışı; hesap var/yok bilgisi asla ifşa edilmez (`record_failed_login` var olmayan e-posta için de sessizce no-op döner)

**Scale/Scope**: 2 yeni migration'sız değil — TEK yeni migration dosyası (kolon ekleme + 4 yeni SECURITY DEFINER fonksiyon), `auth.js`'e login akışı değişikliği, `AdminView.vue`'nun mevcut Kullanıcılar tablosuna 2 yeni kolon + unlock aksiyonu + export butonu

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Hazard-agnostic/model-driven tasarım**: Etkilenmiyor, ilgisiz. PASS.
- **Kapsam sınırları**: Bu özellik dissemination/CAP/kimlik-federasyonu sınırlarına dokunmuyor; kimlik doğrulama yerel kalıyor (harici SSO/OIDC eklenmiyor). PASS.
- **Erişilebilirlik ve i18n**: Yeni metinler (kilit mesajı, rapor kolon başlıkları, unlock butonu) 7 dile eklenecek. PASS.
- **Basitlik/YAGNI**: Erişim İnceleme Raporu için yeni tablo/pg_cron YOK (canlı sorgu, research.md Decision 2); kilitleme sabit değerlerle (5/15dk), admin-configurable bir ayarlar sistemi eklenmiyor (spec Assumptions). PASS.
- **Test**: Kilit/reset mantığının authorization kısmı (kimin neyi görebildiği/yapabildiği) canlıda transactional test ile doğrulanacak; frontend tarafında yeni saf fonksiyon yoksa (mantık çoğunlukla SQL + doğrudan store çağrıları) bu spec'te yeni bir Vitest dosyası gerekmeyebilir — mevcut testlerin regresyonsuz geçmesi yeterli. PASS (aşağıda not edildi).
- **Güvenlik/erişim**: Bu spec'in TAMAMI güvenlik-kritik — `record_failed_login()` anon-callable olacağı için özellikle dikkatli tasarlanmalı (sadece sayaç/kilit alanlarını değiştirir, hesap var/yok bilgisini asla dönmez, e-posta enumeration'a izin vermez). `get_access_review()` ve `unlock_profile()` sadece super_admin'e açık, mevcut `current_profile_role()` deseniyle. Her yeni SECURITY DEFINER fonksiyon `SET search_path = public` içerecek (proje convention'ı). PASS — ama implementasyon sırasında ekstra dikkat gerektirir (aşağıda Complexity Tracking'de not edildi, gate'i geçmesine rağmen).

Sonuç: Hiçbir prensip ihlali yok. Complexity Tracking'de sadece bir dikkat notu var (ihlal değil).

## Project Structure

### Documentation (this feature)

```text
specs/028-access-review-lockout/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── contracts/            # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    └── <timestamp>_access_review_and_lockout.sql   # NEW: profiles kolonları + 4 fonksiyon

src/
├── stores/
│   └── auth.js                      # MODIFIED: login() akışına post-auth kilit kontrolü + record/reset RPC çağrıları
└── views/
    └── AdminView.vue                 # MODIFIED: Kullanıcılar tablosuna Son Giriş/Kilit kolonları, unlock butonu, export butonu

src/i18n/locales/*.json                # MODIFIED: 7 dil, yeni kilit/rapor metinleri

tests/unit/
└── (yeni saf fonksiyon gerekmiyorsa yeni test dosyası YOK — research.md Decision 4)
```

**Structure Decision**: Tek Vue 3 + Supabase projesi. Bu spec `supabase/` altında tek bir yeni migration dosyası ekler (yeni tablo yok, sadece kolon + fonksiyon), `frontend`/`backend` ayrımı gerekmez.

## Complexity Tracking

*Yok — Constitution Check'te ihlal tespit edilmedi. Tek not: `record_failed_login()`'ın anon-callable olması, bu projede anon'a `EXECUTE` izni verilen ikinci fonksiyon (ilki spec 017'nin `ack-dispatch` Edge Function'ı, o da benzer şekilde dar kapsamlı) — bu, dikkatli tasarım gerektiren ama gerekçelendirilmiş bir güvenlik kararı, anayasa ihlali değil.*
