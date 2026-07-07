# Contract: Community Reports

İki yazma yolu var: bildirim gönderimi bir Edge Function üzerinden (anon), moderasyon/bağlama
doğrudan Supabase JS client ile RLS-korumalı `community_reports` üzerinden (authenticated) —
`shelters` (spec 021) ve `contacts` (spec 009) ile aynı "RLS'e doğrudan erişim" deseni, sadece
INSERT ayrık.

## Bildirim gönderimi (anon, kimlik doğrulaması yok)

**Operation**: `supabase.functions.invoke('submit-community-report', { body: payload })`

**Request body**:

```json
{
  "hazardType": "earthquake",
  "description": "Bina duvarında büyük çatlak oluştu",
  "lat": 39.92,
  "lng": 32.85,
  "photo": "<base64 veya multipart, boyut/tip Edge Function içinde doğrulanır>"
}
```

| Girdi durumu | Sonuç |
|---|---|
| `hazardType`, `description`, `lat`, `lng` hepsi dolu, geçerli | `community_reports` satırı `status='pending'` ile oluşturulur, `country_code` server-side belirlenir (research.md Decision 1) |
| `hazardType` mevcut `hazard_types.code` değerlerinden biri değil | 400, "geçersiz afet tipi" |
| `description` boş/eksik | 400, "açıklama zorunlu" |
| `lat`/`lng` eksik veya aralık dışı (`-90..90`/`-180..180`) | 400, "konum zorunlu/geçersiz" |
| `photo` var ama MIME tipi `image/jpeg`/`image/png`/`image/webp` dışında | 400, "desteklenmeyen dosya tipi" — bildirim fotoğrafsız da gönderilebilir (frontend'de kullanıcıya bu seçenek sunulur), Edge Function bu isteği reddetmez, sadece geçersiz `photo` alanını reddeder |
| `photo` 5MB üstü | 400, "dosya çok büyük" |
| Herhangi bir ülke sınırına düşmeyen koordinat | Satır yine oluşur, `country_code = NULL` (yalnızca super_admin moderasyon kuyruğunda görür) |

**Yanıt (başarı)**: `{ "id": "<uuid>", "status": "pending" }` — ziyaretçiye yalnızca "bildiriminiz
incelemeye alındı" mesajı gösterilir, satırın kendisi client'a asla dönmez (zaten client bu satırı
`status='pending'` olduğu için RLS ile de okuyamaz).

## Moderasyon kuyruğunu okuma

**Operation**: `supabase.from('community_reports').select('*').eq('status', 'pending')`

| Caller | Kapsam | Sonuç |
|---|---|---|
| super_admin | tüm ülkeler | Tümü döner |
| country_admin | yalnızca kendi `country_code`'u | Yalnızca kendi ülkesindekiler döner (RLS) |
| org_admin | — | Boş sonuç döner (moderasyon kuyruğu `status='pending'` filtreler; org_admin için yalnızca `status='approved'` + kendisine atanmış satırlar için ayrı bir SELECT politikası var — bkz. "Atanmış bildirimleri okuma (org_admin)" aşağıda) |
| viewer | — | Boş sonuç döner (yalnızca `status='approved'` okuma politikası var) |

## Onayla / Reddet

**Operation**: `supabase.from('community_reports').update({ status: 'approved' }).eq('id', id)` /
`supabase.from('community_reports').update({ status: 'rejected', rejection_reason }).eq('id', id)`

| Durum | Sonuç |
|---|---|
| `country_admin`, kendi ülkesindeki `pending` bir satır, `status: 'approved'` | Guard trigger izin verir, `moderated_by`/`moderated_at` set edilir (uygulama kodu tarafından payload'a eklenir) |
| `country_admin`, kendi ülkesindeki `pending` bir satır, `status: 'rejected'`, `rejection_reason` boş | Guard trigger reddeder: `reason_required` |
| `country_admin`, başka bir ülkenin satırı | RLS zaten satırı görünmez kılar (UPDATE 0 satır etkiler) |
| Zaten `approved`/`rejected`/`archived` bir satıra tekrar `approved`/`rejected` yazılmaya çalışılırsa | Guard trigger reddeder: `invalid_community_report_transition` |
| `archived`'a geçiş | Yalnızca `approved` veya `rejected`'dan yapılabilir |

## Organizasyona atama

**Operation**: `supabase.from('community_reports').update({ assigned_org_id: orgId }).eq('id', id)`

| Caller | Hedef `assigned_org_id` | Sonuç |
|---|---|---|
| country_admin | kendi ülkesindeki bir organizasyon | İzinli — onay anında veya sonradan, bağımsız bir güncelleme olarak yapılabilir |
| country_admin | başka bir ülkenin organizasyonu | Reddedilir (uygulama/UI seviyesinde organizasyon seçici zaten yalnızca kendi ülkesini listeler; RLS zaten satırın kendisini kendi ülkesi dışına açmıyor) |
| super_admin | herhangi bir organizasyon | İzinli |
| org_admin | — | RLS zaten UPDATE izni vermiyor |

## Atanmış bildirimleri okuma (org_admin)

**Operation**: `supabase.from('community_reports').select('*').eq('status', 'approved').eq('assigned_org_id', myOrgId)`

| Caller | Sonuç |
|---|---|
| org_admin, kendi `org_id`'sine atanmış onaylı bildirimler | Döner (salt-okunur) |
| org_admin, başka bir organizasyona atanmış bildirimler | Boş sonuç (RLS filtreler) |
| org_admin, `assigned_org_id IS NULL` (hiç atanmamış) bildirimler | Boş sonuç |

`org_admin`'in bu satırlar üzerinde hiçbir UPDATE izni yoktur (onay/red/atama/incident-bağlama
dahil hiçbir yazma işlemi yapamaz — FR-016).

## Onaylı bildirimleri okuma (harita katmanı)

**Operation**: `supabase.from('community_reports').select('*').eq('status', 'approved')`

Herhangi bir `authenticated` rol (viewer dahil) tüm ülkelerden onaylı bildirimleri okuyabilir —
`shelters`'ın FR-008'iyle aynı "can güvenliği/farkındalık bilgisi ülke sınırı gözetmez" mantığı.

## Incident'a bağlama

**Operation**: `supabase.from('community_reports').update({ linked_incident_id: incidentId }).eq('id', id)`

Moderasyon yetkisiyle aynı eligibility (yalnızca `approved` durumdaki bir satır için anlamlı,
ama DB seviyesinde `pending`/`rejected` satırlar için de teknik olarak reddedilmez — uygulama
katmanı yalnızca `approved` satırlar için bu aksiyonu gösterir). Yazma, mevcut
`log_table_change()` AFTER trigger'ı sayesinde otomatik olarak `audit_log`'a düşer — ayrı bir
RPC/fonksiyon gerekmez.
