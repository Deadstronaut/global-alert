# Contract: Drill Injected Events

Doğrudan Supabase JS client ile RLS-korumalı `drill_injected_events`, `shelters`/`community_reports`
ile aynı desen — ayrı bir API katmanı yok.

## Olay enjekte etme

**Operation**: `supabase.from('drill_injected_events').insert(payload)`

| Caller | Hedef `drill_session` | Sonuç |
|---|---|---|
| super_admin | herhangi bir aktif tatbikat | İzinli |
| country_admin/org_admin | kendi ülkesindeki bir tatbikat | İzinli |
| country_admin/org_admin | başka bir ülkenin tatbikatı | RLS tarafından reddedilir |
| viewer | herhangi biri | RLS tarafından reddedilir (INSERT politikası yok) |

Uygulama katmanı (Pinia store), yalnızca hedef `drill_session.status === 'active'` iken enjeksiyon
formunu gösterir (FR-001) — bu DB seviyesinde ayrıca zorlanmaz (data-model.md notu).

## Olayları okuma (harita katmanı)

**Operation**: `supabase.from('drill_injected_events').select('*').eq('drill_session_id', id)`

| Caller | Sonuç |
|---|---|
| Herhangi bir authenticated rol (viewer dahil) | Yalnızca `drill_session.status = 'active'` olan tatbikatların olayları döner — `completed` bir tatbikatın olayları hiçbir authenticated role dönmez (FR-005) |
| country_admin/org_admin/super_admin | Ayrıca kendi kapsamlarındaki olayları (tatbikat durumundan bağımsız) da görebilir — yönetim/temizlik amaçlı |

## Olay silme

**Operation**: `supabase.from('drill_injected_events').delete().eq('id', id)`

Aynı eligibility, moderasyon/enjeksiyonla (FR-009). `country_admin`/`org_admin`/`super_admin` kendi
kapsamındaki bir olayı, tatbikat durumundan bağımsız olarak silebilir.

## CAP taslağı tohumu olarak kullanma

Enjekte bir olay, `CapView.vue`'nun mevcut `startFromEvent({id, type, severity, title, lat, lng})`
fonksiyonuna normalize edilmiş haliyle geçirilir (research.md Decision 5) — bu, YENİ bir
operation/contract DEĞİLDİR, mevcut `cap_drafts.source_event_id` mekanizmasının aynen kullanılmasıdır.
Ortaya çıkan taslağın `is_exercise=true` olması, spec 013'ün mevcut trigger'ı tarafından, aktif
tatbikatın varlığına bakılarak otomatik yapılır (bu spec bu trigger'a dokunmaz).
