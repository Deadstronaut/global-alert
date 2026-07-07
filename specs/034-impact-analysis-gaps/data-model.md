# Data Model: Impact Analysis Gaps

## Extended Entity: `exposure_features` (additive columns)

Mevcut tablo (spec 008, `supabase/migrations/20260706170000_impact_analysis.sql:54-60`): `id`, `dataset_id`, `geom`, `metric_value`, `properties`.

Yeni kolonlar:

| Kolon | Tip | Null? | Açıklama |
|---|---|---|---|
| `asset_category` | TEXT | NULL olabilir | Kritik altyapı alt kategorisi (ör. `critical_infrastructure_health`, `critical_infrastructure_education`, `critical_infrastructure_emergency`, `residential`); NULL → UI'da "unclassified" olarak ele alınır (FR-003). |
| `sector` | TEXT | NULL olabilir | Serbest metin sektör etiketi (ör. `health`, `education`, `housing`); NULL → "unclassified" grubuna dahil (FR-009). |
| `admin_boundary_code` | TEXT | NULL olabilir | İdari sınır kodu (ör. ilçe/mahalle kodu); NULL → "unclassified" grubuna dahil (FR-009). |

Türetilmiş görünüm/yardımcı: `is_critical_infrastructure` — `asset_category LIKE 'critical_infrastructure_%'` şeklinde sorgu zamanında hesaplanır (ayrı bir kolon gerekmez).

## New Entity: `impact_snapshots`

| Kolon | Tip | Açıklama |
|---|---|---|
| `id` | UUID PK, `gen_random_uuid()` | — |
| `cap_draft_id` | UUID, FK → `cap_drafts(id) ON DELETE CASCADE` | Onaylanan/yayınlanan CAP taslağı. |
| `impact_scenario_id` | UUID, FK → `impact_scenarios(id) ON DELETE SET NULL`, NULL olabilir | Eşleştirilen en güncel senaryo (yoksa NULL). |
| `data_available` | BOOLEAN NOT NULL | `impact_scenario_id IS NOT NULL` ise `true`; hiç eşleşen senaryo yoksa `false` (FR-005). |
| `snapshot_data` | JSONB, NULL olabilir | Eşleşen senaryonun o anki `result_snapshot` içeriğinin donmuş kopyası (FR-004/FR-006). |
| `country_code` | VARCHAR(2), NULL olabilir | RLS filtrelemesi için, `impact_scenarios`/`exposure_datasets` deseniyle tutarlı. |
| `org_id` | UUID, FK → `organizations(id)`, NULL olabilir | RLS filtrelemesi için. |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | Arşivlenme anı. |

**Değişmezlik kuralı**: Bu tabloya sadece `archive_impact_snapshot()` trigger fonksiyonu INSERT yapar; hiçbir role UPDATE/DELETE RLS policy'si tanımlanmaz (FR-006 — snapshot sonradan değişmez).

**RLS**: `exposure_datasets`/`impact_scenarios`'ın mevcut SELECT policy desenini (`country_code`/`org_id` eşleşmesi veya `super_admin`) mirror eder.

## State Transitions

`cap_drafts.status` → `'broadcast'` geçişi (mevcut spec 009 state machine'i, değişmez) → `archive_impact_snapshot()` trigger'ı tetiklenir → `impact_scenarios`'ta `country_code`/`org_id` eşleşen en güncel kayıt aranır → `impact_snapshots`'a bir satır INSERT edilir (eşleşme yoksa `data_available=false`, `snapshot_data=NULL`, `impact_scenario_id=NULL`).

## New Functions (additive, `compute_zonal_stats` değişmeden kalır)

### `compute_sector_breakdown(dataset_id UUID, center_lat float8, center_lng float8, radius_km float8)`

`RETURNS TABLE(group_key TEXT, total_value float8, feature_count int)` — `exposure_features`'ı `compute_zonal_stats` ile aynı `ST_DWithin` filtresiyle süzer, `COALESCE(sector, 'unclassified')` alanına göre `GROUP BY` yapar.

### `compute_boundary_breakdown(dataset_id UUID, center_lat float8, center_lng float8, radius_km float8)`

Aynı imza, `COALESCE(admin_boundary_code, 'unclassified')` alanına göre `GROUP BY` yapar.

### `compute_data_completeness(dataset_id UUID, center_lat float8, center_lng float8, radius_km float8)`

`RETURNS TABLE(total_features int, tagged_features int, completeness_ratio float8)` — yarıçap içindeki toplam varlık sayısı ile `sector IS NOT NULL OR asset_category IS NOT NULL` olan varlık sayısını döner; `total_features = 0` ise `completeness_ratio = NULL` (UI'da "veri yok" olarak gösterilir, FR-011 — 0'a bölme hatası önlenir).
