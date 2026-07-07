# Data Model: Tatbikat İçin Simüle Tehlike Enjeksiyonu

## `drill_injected_events` (yeni tablo)

| Kolon | Tip | Kısıt / Varsayılan | Açıklama |
|---|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` | |
| `drill_session_id` | UUID | NOT NULL, FK → `drill_sessions(id) ON DELETE CASCADE` | Hangi tatbikata ait olduğu — tatbikat silinirse (nadir, genelde `completed` kalır) olay da silinir |
| `country_code` | VARCHAR(2) | NOT NULL | Ebeveyn `drill_session`'dan insert anında kopyalanır (RLS'te doğrudan kolon karşılaştırması için — shelters/community_reports ile tutarlı desen) |
| `hazard_type` | TEXT | NOT NULL, FK → `hazard_types(code)` | |
| `description` | TEXT | NOT NULL | |
| `lat` | DOUBLE PRECISION | NOT NULL, `-90..90` | |
| `lng` | DOUBLE PRECISION | NOT NULL, `-180..180` | |
| `severity` | TEXT | NOT NULL, CHECK IN (`critical`,`high`,`moderate`,`low`,`minimal`) | Mevcut `IncidentsView.vue`'daki `SEVERITIES` sabit listesiyle aynı değer kümesi |
| `created_by` | UUID | NULL edilebilir, FK → `auth.users(id) ON DELETE SET NULL` | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` | |

**İndeksler**: `drill_session_id` (harita sorgusu ve CASCADE için), `country_code`.

### RLS Politikaları (research.md Decision 4 — `drill_sessions` ile aynı EXISTS stili)

```sql
-- super_admin: tam erişim
CREATE POLICY "super_admin_drill_events_all" ON drill_injected_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- country_admin/org_admin: yalnızca kendi ülkelerindeki olaylar (INSERT/SELECT/DELETE)
CREATE POLICY "country_admin_drill_events_own" ON drill_injected_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin','org_admin')
        AND p.country_code = drill_injected_events.country_code
    )
  );

-- Herhangi bir authenticated rol (viewer dahil): SADECE aktif bir tatbikata bağlı olayları okuyabilir
CREATE POLICY "authenticated_read_active_drill_events" ON drill_injected_events
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM drill_sessions ds
      WHERE ds.id = drill_injected_events.drill_session_id
        AND ds.status = 'active'
    )
  );
```

FR-001/FR-009/FR-010'a göre: yazma (INSERT/DELETE) yalnızca `country_admin`/`org_admin` (kendi
ülkesi) ve `super_admin`'dedir — bu iki politika zaten `FOR ALL` olduğu için INSERT/DELETE'i de
kapsar; ayrıca uygulama katmanında (Pinia store) INSERT/DELETE yalnızca ilgili `drill_session.
status = 'active'` iken sunulur (FR-001), ama bu DB seviyesinde ayrıca zorlanmaz — çünkü
`completed` bir tatbikata ait geçmiş kayıtların (denetim amaçlı) hâlâ var olması gerekiyor (FR-005)
ve country_admin/super_admin'in kendi geçmiş kayıtlarını (örn. yanlışlıkla eklenmiş bir tanesini)
temizleme ihtiyacı olabilir; bu yüzden DB seviyesinde durum bazlı bir INSERT/DELETE kısıtı
YOKTUR (research.md'de bilinçli bir basitleştirme, YAGNI).

### Audit

Mevcut `log_table_change()` trigger fonksiyonu `AFTER INSERT OR UPDATE OR DELETE` olarak bağlanır
— enjeksiyon/silme otomatik olarak `audit_log`'a düşer, ayrı bir mekanizma gerekmez.

## Frontend Değişiklikleri (özet — tasks.md'de detaylandırılacak)

- **Yeni**: `src/stores/drillInjectedEvents.js` — `fetchForActiveDrill(drillSessionId)`,
  `injectEvent(payload)`, `removeEvent(id)`.
- **Değişiklik**: `src/views/AdminView.vue` — mevcut tatbikat sekmesine (`drills` listesi zaten
  var), `active` durumdaki bir tatbikatın kartına küçük bir "Olay Enjekte Et" alt-formu eklenir.
- **Değişiklik**: `src/components/MapView.vue` — `updateDrillEventMarkers()`/
  `clearDrillEventMarkers()` (research.md Decision 2), her zaman görünür "TATBİKAT" rozetli popup.
- **Değişiklik**: `src/views/CapView.vue` — `detectedEvents` computed'ı, aktif tatbikat varsa
  `drillInjectedEventsStore`'dan gelen olayları da (normalize edilmiş `{id,type,severity,title,
  lat,lng}` şeklinde, `type` ↔ `hazard_type`, `title` ↔ `description` eşlemesiyle) içerecek şekilde
  genişletilir (research.md Decision 5) — `startFromEvent()`'ın kendisi değişmez.
