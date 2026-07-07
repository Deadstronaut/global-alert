# Data Model: Vatandaş Kaynaklı Afet Bildirimi

## `community_reports` (yeni tablo)

| Kolon | Tip | Kısıt / Varsayılan | Açıklama |
|---|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` | |
| `hazard_type` | TEXT | NOT NULL, FK → `hazard_types(code)` | Moderatör tarafından atanır (FR-014) — gönderim anında ziyaretçinin seçtiği ilk değer, moderatör onay sırasında değiştirebilir |
| `description` | TEXT | NOT NULL, `btrim(description) <> ''` | Serbest metin |
| `lat` | DOUBLE PRECISION | NOT NULL, `-90..90` | |
| `lng` | DOUBLE PRECISION | NOT NULL, `-180..180` | |
| `country_code` | VARCHAR(2) | NULL edilebilir | `submit-community-report` Edge Function'ı tarafından server-side `resolveCountryCode(lat,lng)` ile atanır (research.md Decision 1); hiçbir ülke eşleşmezse NULL kalır (Edge Cases: yalnızca super_admin görür) |
| `photo_path` | TEXT | NULL edilebilir | `community-report-photos` bucket'ı içindeki dosya yolu (UUID tabanlı dosya adı); public URL frontend'de bu yoldan türetilir |
| `status` | TEXT | NOT NULL, DEFAULT `'pending'`, CHECK IN (`pending`,`approved`,`rejected`,`archived`) | |
| `rejection_reason` | TEXT | NULL edilebilir, `status='rejected'` iken NOT NULL/boş-olmayan (trigger ile zorunlu) | `cap_drafts.rejection_reason` ile aynı isimlendirme |
| `assigned_org_id` | UUID | NULL edilebilir, FK → `organizations(id) ON DELETE SET NULL` | FR-015 — country_admin/super_admin tarafından onay anında/sonrasında elle atanır; `org_admin`'e salt-okunur görünürlük sağlar (research.md Decision 5) |
| `linked_incident_id` | UUID | NULL edilebilir, FK → `incidents(id) ON DELETE SET NULL` | FR-011/FR-012, tek bağlantı |
| `moderated_by` | UUID | NULL edilebilir, FK → `profiles(id) ON DELETE SET NULL` | Onay/red işlemini yapan kullanıcı |
| `moderated_at` | TIMESTAMPTZ | NULL edilebilir | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()`, `set_updated_at()` trigger | Mevcut proje-genel trigger fonksiyonu yeniden kullanılır |

**İndeksler**: `country_code`, `status` (moderasyon kuyruğu filtrelemesi için), `linked_incident_id`, `assigned_org_id`.

### Durum Makinesi (guard trigger, research.md Decision 4)

```
pending ──approve──> approved ──archive──> archived
   │                                          ^
   └──reject (rejection_reason zorunlu)──> rejected ──archive──┘
```

Yasak geçişler: `approved→pending`, `approved→rejected`, `rejected→approved`, `rejected→pending`,
herhangi bir durumdan kendisine (`OLD.status = NEW.status`).

### RLS Politikaları

| Politika | Rol | Kapsam | İşlem |
|---|---|---|---|
| `super_admin_community_reports_all` | super_admin | tümü | ALL |
| `country_admin_community_reports_moderate` | country_admin | kendi `country_code`'u | SELECT, UPDATE (yalnızca izinli durum geçişleri, guard trigger uygular; `assigned_org_id` ataması da bu politika altında) |
| `authenticated_read_approved_community_reports` | authenticated (her rol, viewer dahil) | `status='approved'` satırlar, tüm ülkeler | SELECT |
| `org_admin_read_assigned_community_reports` | org_admin | `status='approved' AND assigned_org_id = (kendi profile.org_id)` | SELECT (yalnızca — hiçbir UPDATE politikası yok) |

INSERT için hiçbir client-erişilebilir RLS politikası yoktur — tek yazma yolu, service-role
kullanan `submit-community-report` Edge Function'ıdır (research.md Decision 2). `org_admin` için
onay/red veya herhangi bir UPDATE politikası yoktur (research.md Decision 5) — yalnızca kendisine
atanmış ve zaten onaylanmış satırları okuyabilir; `viewer` yukarıdaki genel-okuma politikasıyla
tüm onaylı satırları (atanmış olsun olmasın) görür.

> Not: `authenticated_read_approved_community_reports` (herkese açık, tüm onaylı satırlar) ile
> `org_admin_read_assigned_community_reports` (yalnızca kendisine atananlar) arasında görünüşte bir
> çakışma var gibi görünebilir — aslında çakışmaz, çünkü `org_admin` zaten `authenticated`
> politikasından da (rol ayrımı yapmıyor) tüm onaylı bildirimleri görebilir; ikinci politika ona
> yalnızca EK bir "bana atanan bildirimler" filtrelenmiş görünümü (admin panelindeki kendi
> sekmesi) sunmak için var, erişimi daraltmıyor. `org_admin`'in asıl kısıtlaması "moderasyon
> kuyruğuna (pending/rejected) hiç erişememesi" — bu iki politika da yalnızca `status='approved'`
> için tanımlı.

### Audit

Mevcut `log_table_change()` trigger fonksiyonu (audit_log hash-zinciri, spec 007) bu tabloya da
`AFTER INSERT OR UPDATE OR DELETE` olarak bağlanır — moderasyon işlemleri ve incident bağlama
otomatik olarak audit_log'a düşer (FR-011, SC-005), ayrı bir audit kodu yazmaya gerek yok.

## Yeni Supabase Storage Bucket: `community-report-photos`

- Yazma: yalnızca service-role (Edge Function).
- Okuma: public (research.md Decision 3).
- Dosya adı: `${crypto.randomUUID()}.${ext}` — tahmin edilemez, tam yol yalnızca ilgili
  `community_reports.photo_path` satırında saklanır.
- Kabul edilen MIME tipleri: `image/jpeg`, `image/png`, `image/webp`.
- Boyut sınırı: 5 MB (FR-013 — makul bir sınır; tam sayı spec'te bağlayıcı değil, plan seviyesinde
  belirlenen bir varsayılan).

## Yeni Deno Modülü: `supabase/functions/shared/geoCountry.ts`

`src/utils/geoCountry.js` / `server/src/processors/geoCountry.js` ile aynı bbox-tabanlı
`resolveCountryCode(lat, lng): string | null` mantığının üçüncü, Deno-uyumlu portu
(research.md Decision 1). `src/configs/countries.json` verisiyle aynı veri seti, Edge Function
bundle'ına dahil edilir (JSON import).

## Frontend Store/Bileşen Değişiklikleri (özet — tasks.md'de detaylandırılacak)

- **Yeni**: `src/stores/communityReports.js` (Pinia) — `fetchApproved()`, `fetchModerationQueue()`,
  `approve(id)`, `reject(id, reason)`, `linkToIncident(id, incidentId)`, `submitReport(payload)`
  (Edge Function'ı çağırır, doğrudan `.insert()` DEĞİL).
  Diğer store'lardan farklı olarak `submitReport()` `supabase.functions.invoke('submit-community-report', ...)`
  kullanır — `fetch(EDGE_FUNCTIONS...)` deseni (disasterService.js) yerine mevcut `supabase-js`
  client'ının `functions.invoke` yardımcı fonksiyonu tercih edilir (proje içinde her iki desen de
  var; burada anon çağrısı basit bir POST olduğu için invoke yeterli).
- **Yeni**: `src/components/CommunityReportForm.vue` — herkese açık gönderim formu (muhtemelen
  `/portal` sayfasına veya ayrı `/report` rotasına eklenir — plan.md Project Structure'da netleşir).
- **Yeni**: `src/components/admin/CommunityReportsPanel.vue` — AdminView'a yeni sekme, moderasyon
  kuyruğu.
- **Değişiklik**: `MapView.vue` — yeni `updateCommunityReportMarkers()`/kümeleme katmanı (research.md
  Decision 6), `uiStore.showCommunityReports` toggle.
- **Değişiklik**: `IncidentsView.vue` veya incident detay bileşeni — bağlı bildirim(ler)in listelenmesi.
