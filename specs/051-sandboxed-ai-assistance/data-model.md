# Data Model: Sandboxed AI Assistance

## `ai_capability_config` (yeni tablo)

Ülke başına, dört yetenekten her birinin açık/kapalı durumu ve (varsa) o ülkeye özel sağlayıcı
override'ı.

| Kolon | Tip | Kısıt / Varsayılan | Açıklama |
|---|---|---|---|
| `country_code` | VARCHAR(2) | PK (bileşik: `country_code`, `capability`) | |
| `capability` | TEXT | PK (bileşik), CHECK IN (`translate`,`summarize`,`classify_photo`,`anomaly_flag`) | |
| `enabled` | BOOLEAN | NOT NULL, DEFAULT `false` | Varsayılan kapalı — açık davet (opt-in), sessiz opt-out değil |
| `provider_config` | JSONB | NOT NULL, DEFAULT `'{}'::jsonb` | Bu ülkeye özel sağlayıcı override'ı (ör. farklı model); boşsa global env değişkenleri kullanılır |
| `updated_by` | UUID | NULL edilebilir, FK → `profiles(id) ON DELETE SET NULL` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()`, `set_updated_at()` trigger | |

**RLS**:

| Politika | Rol | Kapsam | İşlem |
|---|---|---|---|
| `super_admin_ai_config_all` | super_admin | tümü | ALL |
| `country_admin_ai_config_own` | country_admin | kendi `country_code`'u | SELECT, UPDATE, INSERT |
| `authenticated_read_ai_config` | authenticated (her rol) | tüm ülkeler, sadece `enabled`/`capability`/`country_code` | SELECT — UI'ın "AI ile öner" butonunu gösterip göstermeyeceğine karar vermesi için |

`org_admin`/`viewer` bu tabloyu değiştiremez (data_sources ve community_reports ile aynı desen).

## `ai_suggestions` (yeni tablo)

Dört yeteneğin tamamı için ortak, jenerik öneri/karar kaydı.

| Kolon | Tip | Kısıt / Varsayılan | Açıklama |
|---|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` | |
| `capability` | TEXT | NOT NULL, CHECK IN (`translate`,`summarize`,`classify_photo`,`anomaly_flag`) | |
| `country_code` | VARCHAR(2) | NOT NULL | `ai_capability_config` ile eşleşir, RLS kapsamlama için |
| `source_table` | TEXT | NOT NULL | Örn. `cap_drafts`, `sop_documents`, `incidents`, `community_reports`, hazard tablosu adı (`earthquake`,`flood`,...) |
| `source_id` | UUID | NOT NULL | Kaynak satırın id'si (FK yok — kaynak tablo değişken, entegrite uygulama katmanında sağlanır) |
| `target_locale` | TEXT | NULL edilebilir | Yalnızca `translate` için (ör. `en`, `ar`) |
| `input_excerpt` | JSONB | NOT NULL | AI'ya gönderilen girdinin denetlenebilir bir kopyası (FR-010 uyarınca kişisel veri hariç) |
| `ai_output` | JSONB | NULL edilebilir | AI'nin ham çıktısı (metin, kategori önerisi, veya anomali istatistikleri); sağlayıcı hatasında NULL |
| `status` | TEXT | NOT NULL, DEFAULT `'pending'`, CHECK IN (`pending`,`approved`,`approved_edited`,`rejected`,`ignored`,`failed`) | |
| `final_output` | JSONB | NULL edilebilir | Yalnızca `approved`/`approved_edited` durumunda dolu — insan onaylı nihai içerik |
| `requested_by` | UUID | NOT NULL, FK → `profiles(id) ON DELETE SET NULL` | `classify_photo` için sistem tarafından tetiklenen çağrılarda gönderimi yapan (anonim) kullanıcı yerine `NULL`'a izin verilir — bkz. not |
| `resolved_by` | UUID | NULL edilebilir, FK → `profiles(id) ON DELETE SET NULL` | Onay/red/override yapan kullanıcı |
| `resolved_at` | TIMESTAMPTZ | NULL edilebilir | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` | |

> Not (`requested_by` NULL istisnası): `classify_photo` gönderim-anı otomatik tetiklendiğinde
> (research.md Karar 3) çağıran, kimlik doğrulaması yapmamış bir ziyaretçi olabilir
> (`submit-community-report` zaten anon-callable). Bu tek durumda `requested_by` NULL bırakılır;
> tüm diğer üç yetenek her zaman kimliği doğrulanmış bir kullanıcı tarafından tetiklenir ve bu
> alan NOT NULL zorunluluğuna eşdeğer davranır (uygulama katmanında zorunlu kılınır).

**İndeksler**: `(country_code, capability, status)` (moderasyon/inceleme kuyruğu filtrelemesi),
`(source_table, source_id)` (bir kayda ait tüm önerileri bulma).

### Durum Makinesi

```
pending ──approve (aynen)────────> approved
   │
   ├──approve (düzenlenerek)─────> approved_edited
   │
   ├──reject──────────────────────> rejected
   │
   ├──ignore/timeout───────────────> ignored
   │
   └──sağlayıcı hatası/timeout─────> failed   (kullanıcıya hiç gösterilmez, sessizce loglanır — FR-008)
```

`approved`/`approved_edited`/`rejected`/`ignored`/`failed` durumlarından hiçbir geçiş yoktur
(terminal). Guard trigger, mevcut `cap_drafts`/`community_reports` durum-makinesi desenini
(20260605120100_cap_drafts.sql, community_reports migration) izler.

### Audit

Mevcut `log_table_change()` trigger fonksiyonu her iki yeni tabloya da (`ai_capability_config`,
`ai_suggestions`) `AFTER INSERT OR UPDATE` olarak bağlanır (research.md Karar 5) — FR-005/SC-002
için ek kod gerekmez.

### `capability` → kaynak eşlemesi

| `capability` | `source_table` örneği | Tetikleme | Kim onaylar |
|---|---|---|---|
| `translate` | `cap_drafts`, `sop_documents` | Kullanıcı tetiklemeli | Alert/SOP üzerinde düzenleme yetkisi olan kullanıcı |
| `summarize` | `sop_documents`, `incidents` | Kullanıcı tetiklemeli | İlgili belge/olay üzerinde düzenleme yetkisi olan kullanıcı |
| `classify_photo` | `community_reports` | Gönderim-anı otomatik (arka plan) | Moderatör (country_admin/super_admin) |
| `anomaly_flag` | hazard tabloları (`earthquake`,`flood`,`wildfire`,...) | Ingestion sonrası otomatik | Herhangi bir operatör (yalnızca "gördüm/kapat", onay/red kavramı yok — `status` doğrudan `ignored`'a geçer) |

`anomaly_flag` için `final_output` her zaman NULL kalır (üretilen bir içerik yok, yalnızca bir
bayrak) ve `ai_output` şu şekli alır: `{ "metric": "magnitude", "value": 7.8, "baseline_mean": 4.2,
"baseline_stddev": 0.9, "z_score": 4.0 }`.
