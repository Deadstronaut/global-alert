# Research: Dissemination Güvenilirliği ve Uyum

## Decision 1: Unsubscribe (US2) — yeni kolon GEREKMİYOR

**Decision**: `contacts` tablosunda zaten `email_opt_in BOOLEAN NOT NULL DEFAULT true` / `whatsapp_opt_in BOOLEAN NOT NULL DEFAULT true` kolonları var (`20260707120000_contacts.sql:25-26`) VE `dispatchMatching.ts`'nin `matchesContact()` fonksiyonu bunları ZATEN kanal bazlı kontrol ediyor (satır 51-54: `channel === 'email' → contact.email_opt_in && contact.email != null`). Yani unsubscribe akışı, yeni bir `email_opted_out` kolonu icat etmek yerine, mevcut `email_opt_in`'i `false` yapan anon-callable bir endpoint'ten ibarettir.

**Rationale**: Bu, plan.md'nin ilk taslağında varsayılan yeni bir kolonun (`email_opted_out`) aslında gereksiz olduğunu gösteriyor — proje zaten bu ihtiyacı FR-005'in gerektirdiği "sadece e-posta kanalını etkiler, WhatsApp'ı etkilemez" davranışıyla BİREBİR uyumlu şekilde önceden inşa etmiş (muhtemelen ileride bir opt-out akışı düşünülerek). YAGNI ilkesiyle tutarlı: mevcut alanı kullanmak, yeni bir tane eklemekten daha basit.

**Alternatives considered**: Yeni bir `email_opted_out` kolonu eklemek — reddedildi, gereksiz duplikasyon olurdu ve `matchesContact()`'ın iki farklı alana bakması gerekirdi.

## Decision 2: Dil-lokalizasyonlu e-posta içeriği (US1)

**Decision**: `buildEmailBody()`'ye bir `preferredLanguage: string` parametresi eklenir. Yeni bir saf fonksiyon `resolveLocalizedContent(draft, preferredLanguage)` (`supabase/functions/shared/emailLocalization.ts`), `draft.translations?.[preferredLanguage]` varsa ondan `{title, description}` döner, yoksa `{title: draft.title, description: draft.description}`'a düşer. `buildEmailBody()` ve tüm çağıranları (`sendReceipt()`, `sendReceiptRetry()`, yeni auto-retry yolu) bu fonksiyonu kullanır.

**Rationale**: `cap_drafts.translations` zaten `{"tr": {"title":..., "description":...}}` şeklinde JSONB — tam ihtiyaç duyulan şekilde. Saf fonksiyon olarak ayrılması, mevcut `dispatchMatching.ts`/`dispatchStateMachine.ts` convention'ıyla tutarlı (Deno tarafında ayrı dosya + `.test.ts`).

**Alternatives considered**: Lokalizasyonu client-side (CapView.vue'da export anında) yapmak — reddedildi, çünkü dispatch e-posta içeriği server-side (`dispatch-alert` Edge Function) üretiliyor, alıcı bazlı (her contact farklı dil) olduğu için client-side hiç uygulanabilir değil.

## Decision 3: Otomatik/backoff'lu retry (US3) — mekanizma ve zamanlama

**Decision**: `dispatch-alert`'e servis-rolü-only yeni bir üçüncü mod eklenir: `{ auto_retry: true }` (sadece `SUPABASE_SERVICE_ROLE_KEY` ile çağrılabilir, Mode A'nın authentication deseniyle aynı). Bu mod, `status='failed' AND retry_count < 4` olan tüm `dispatch_receipts` satırlarını tarar, her biri için yeni bir saf fonksiyon `shouldAutoRetryNow(receipt, now)` (`supabase/functions/shared/dispatchBackoff.ts`) ile backoff kontrolü yapar: gerekli bekleme = `15 * 2^retry_count` dakika (retry_count=0→15dk, 1→30dk, 2→60dk, 3→120dk), `now - last_attempted_at >= gerekli bekleme` ise satır yeniden denenir (queued'a alınır, `retry_count+1`, `last_attempted_at=now`, sonra gönderim denenir). pg_cron her 15 dakikada bir bu modu tetikler (`trigger_compliance_report_generation()` deseninin bir kopyası).

**Rationale**: pg_cron'un kendisi zaten 15 dakikalık bir granülariteye sahip — backoff aralıklarını bu granülaritenin katları olarak tanımlamak (15/30/60/120 dk), her cron tetiklemesinde gereksiz "henüz sırası gelmedi" kontrolleri dışında ekstra bir zamanlayıcıya ihtiyaç duymaz (YAGNI). 4 azami deneme (toplam ~3.75 saat içinde tükeniyor) makul bir varsayılan — PRD spesifik bir sayı vermiyor, bu bir informed-default.

**Alternatives considered**: Her dakika çalışan bir cron + saniye hassasiyetinde backoff — reddedildi, dissemination zaten ilk denemede saniyeler içinde gerçekleşiyor, ikincil bir otomatik retry'ın gerçek zamanlı olması gerekmiyor (spec.md Assumptions'ta zaten belirtildi).

## Decision 4: Manuel retry'ın otomatik sayacı sıfırlaması (FR-008)

**Decision**: `handleRetry()`'deki mevcut `retry_count: r.retry_count + 1` → `retry_count: 0` olarak değiştirilir (manuel retry, otomatik deneme sayacını sıfırlar — FR-008). `last_attempted_at` de `NOW()` olarak set edilir.

**Rationale**: FR-008'in doğrudan gereksinimi — bir operatör manuel olarak müdahale ettiğinde, sistem bu kaydı "temiz bir sayfa" olarak görmeli, otomatik retry'ın azami deneme sınırına daha önce ne kadar yaklaştığından etkilenmemeli.

**Alternatives considered**: Manuel ve otomatik retry için ayrı sayaçlar tutmak — reddedildi, gereksiz karmaşıklık (YAGNI), tek bir `retry_count` + "manuel her zaman sıfırlar" kuralı yeterli.

## Decision 5: Admin bildirimi (US4) — alıcı seçimi ve tekrar-önleme

**Decision**: `dispatch_jobs`'a `admin_notified_at TIMESTAMPTZ` kolonu eklenir. Auto-retry modu, tüm otomatik denemeler tükenip (bir job'ın TÜM receipts'i `retry_count >= 4` VE `status='failed'` durumundaysa) `admin_notified_at IS NULL` olan job'ları bulur; `profiles` tablosundan (zaten `email` kolonu var, `20260603120000_profiles.sql`) `role IN ('super_admin')` VEYA (`role IN ('country_admin','org_admin')` VE `country_code`/`org_id` job'ın CAP taslağıyla eşleşen) kullanıcıların e-postalarına, mevcut `emailProviders` adapter'ı ile bir bildirim gönderir, sonra `admin_notified_at=NOW()` set eder.

**Rationale**: `profiles.email` zaten var (auth.users'tan `handle_new_user()` ile senkronize) — `get_access_review()`'daki (spec 028) `auth.users` join deseni gerekmez, daha basit bir sorgu yeterli. `admin_notified_at` kontrolü FR-010'un "tekrar bildirim yok" gereksinimini garantiler (idempotent, tek seferlik damga).

**Alternatives considered**: Her failed job için her retry döngüsünde bildirim göndermek — reddedildi, FR-010'u ihlal eder (spam).

## Decision 6: GDPR anonimizasyonu (US5) — veri modeli

**Decision**: Yeni bir DB fonksiyonu GEREKMİYOR — `contacts.js`'e düz bir `anonymizeContact(id)` fonksiyonu eklenir, mevcut `updateContact()`'ı çağırıp `{ email: null, whatsapp_number: null, full_name: '[anonymized]', is_active: false }` set eder. Mevcut RLS (`super_admin_contacts_all` FOR ALL) zaten bu güncellemeyi Super Admin'e izin veriyor; mevcut `chk_contact_has_channel` CHECK constraint'i (`email IS NOT NULL OR whatsapp_number IS NOT NULL`) ihlal edilir mi kontrol edilmeli — **evet ihlal eder**, bu yüzden constraint'e bir istisna gerekiyor (bkz. Decision 7).

**Rationale**: Basit bir update, yeni bir SECURITY DEFINER fonksiyona gerek yok (mevcut RLS zaten yeterli yetkilendirme sağlıyor, spec 018'in `profile_capability_grants` deseni bu kadar hassas bir aksiyon için gerekli değil çünkü zaten sadece super_admin'e açık).

**Alternatives considered**: E-postayı hash'leyerek saklamak (ör. SHA-256) — reddedildi, spec.md'nin "geri döndürülemez şekilde kaldırma" gereksinimi bir hash'in de teorik olarak rainbow-table saldırısına açık olabileceği düşünülerek NULL'a çevirmek tercih edildi (daha güvenli, daha basit).

## Decision 7: `chk_contact_has_channel` constraint'i ile anonimizasyon çakışması

**Decision**: Anonimleştirilmiş bir contact'ın hem `email` hem `whatsapp_number`'ı NULL olacağı için mevcut `chk_contact_has_channel CHECK (email IS NOT NULL OR whatsapp_number IS NOT NULL)` ihlal edilir. Migration'da bu constraint'e bir `is_active = false` istisnası eklenir: `CHECK (is_active = false OR email IS NOT NULL OR whatsapp_number IS NOT NULL)`.

**Rationale**: Constraint'in orijinal amacı (FR-001, spec 009) "aktif bir contact'ın en az bir ulaşılabilir kanalı olmalı" — anonimleştirilmiş (zaten `is_active=false` olan) bir contact için bu artık geçerli bir kısıtlama değil. Bu, mevcut constraint'in DAHA GEVŞETİLMESİ değil, orijinal niyetine daha sadık hale getirilmesi (aktif olmayan bir contact zaten hiçbir dispatch'te kullanılmıyor).

**Alternatives considered**: Constraint'i hiç değiştirmemek, anonimleştirmeyi email'i `'anon-<uuid>@deleted.invalid'` gibi sahte bir değere çevirerek yapmak — reddedildi, spec.md'nin "geri döndürülemez şekilde kaldırma" (FR-011) niyetine tam uymuyor (sahte de olsa PII-şekilli bir alan kalıyor); NULL + gevşetilmiş constraint daha temiz.

## Decision 8: Test coverage yaklaşımı

**Decision**: Yeni saf fonksiyonlar (`resolveLocalizedContent`, `shouldAutoRetryNow`) Deno tarafında (`supabase/functions/shared/*.ts` + `*.test.ts`), mevcut `dispatchMatching.test.ts`/`dispatchStateMachine.test.ts` convention'ıyla aynı şekilde test edilir (`deno test`, Vitest suite'inin bir parçası DEĞİL — bu ayrım projede zaten var, `package.json`'ın `test` scripti sadece `tests/unit/**/*.test.js`'i kapsıyor).

**Rationale**: Bu iki fonksiyon Edge Function tarafında (Deno runtime) yaşıyor, frontend'de değil — proje convention'ı zaten bu ayrımı (Deno-side pure functions → `.test.ts`, frontend pure functions → `tests/unit/*.test.js`) koruyor.
