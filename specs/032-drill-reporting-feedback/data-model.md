# Data Model: Tatbikat Raporlama ve Geri Bildirim Döngüsü

## Değişen Entity: `drill_sessions`

Kaynak: `supabase/migrations/20260605120200_drill_mode.sql`. Yeni kolonlar:

```sql
ALTER TABLE drill_sessions ADD COLUMN IF NOT EXISTS lessons_learned TEXT;
ALTER TABLE drill_sessions ADD COLUMN IF NOT EXISTS related_hazard_type TEXT REFERENCES hazard_types(code) ON DELETE SET NULL;
```

- `lessons_learned`: serbest metin, nullable, uzunluk sınırı yok.
- `related_hazard_type`: isteğe bağlı, `hazard_types.code`'a FK, silinirse `NULL`'a düşer (ilişkilendirilen afet tipi kaldırılsa bile not kaybolmaz).
- Mevcut `summary` JSONB, RLS, state machine, audit trigger hiç değişmez.

## Yeni Entity: `drill_reports`

`incident_reports`'un (spec 026) birebir yapısal ikizi:

| Alan | Tip | Açıklama |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `period_start` | TIMESTAMPTZ | Yılın başı |
| `period_end` | TIMESTAMPTZ | Yılın sonu (bir sonraki yılın başı) |
| `summary` | JSONB | `{ total_drills, avg_response_time_seconds, avg_ack_rate, by_scenario_type }` |
| `generated_at` | TIMESTAMPTZ | `DEFAULT NOW()` |

`CHECK (period_end > period_start)`, `UNIQUE(period_start, period_end)`. RLS: `super_admin_read_drill_reports` (SELECT only, `incident_reports` ile birebir aynı desen) — INSERT/UPDATE/DELETE policy yok, sadece `generate-drill-report` Edge Function (service-role) yazar.

## Yeni saf fonksiyon (Deno, `supabase/functions/shared/drillReportSummary.ts`)

```ts
interface DrillForSummary {
  scenario_type: string | null
  summary: { response_time_seconds?: number | null; ack_rate?: { sent: number; acknowledged: number } | null } | null
}

function computeDrillReportSummary(drills: DrillForSummary[]): {
  total_drills: number
  avg_response_time_seconds: number | null
  avg_ack_rate: number | null   // acknowledged/sent oranı, 0-1 arası
  by_scenario_type: Record<string, number>
}
```

- `avg_response_time_seconds`: `summary.response_time_seconds != null` olan tatbikatların ortalaması; hiçbiri yoksa `null`.
- `avg_ack_rate`: `summary.ack_rate != null && summary.ack_rate.sent > 0` olan tatbikatların `acknowledged/sent` oranlarının ortalaması; hiçbiri yoksa `null`.
- `by_scenario_type`: `scenario_type` başına tatbikat sayısı (null/boş `scenario_type` "unknown" anahtarı altında toplanır).

## Frontend Değişikliği: `src/views/AdminView.vue`

- `downloadDrillSummary(drill, format)`: `drill.summary`'yi flat satırlara çevirip mevcut `rowsToCsv`/`rowsToJson`/`triggerDownload` ile indirir (research.md Decision 1) — sadece `status === 'completed'` olan tatbikatlar için gösterilir.
- Yeni "Yıllık Tatbikat Raporları" alt bölümü (mevcut "Yıllık Olay Raporları" alt bölümünün yanına) — `drill_reports`'u listeler, aynı export mekanizmasını kullanır.
- Mevcut `drill-card` şablonuna (tamamlanmış tatbikatlar için): bir `lessons_learned` textarea + `related_hazard_type` dropdown (mevcut `hazardTypesStore`'dan), kaydet butonu `updateContact`... hayır, `supabase.from('drill_sessions').update(...)` ile aynı store'suz doğrudan-client deseni (mevcut `drills`/`endDrill` gibi). Bir afet tipi seçiliyse, "Eşik Düzenleyiciye Git" bağlantısı `tab.value = 'hazardTaxonomy'` yapar (aynı sayfa içi sekme geçişi, route değişikliği yok).
