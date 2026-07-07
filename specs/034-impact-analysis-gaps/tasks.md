---
description: "Task list for Impact Analysis Gaps (spec 034)"
---

# Tasks: Impact Analysis Gaps

**Input**: Design documents from `/specs/034-impact-analysis-gaps/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: DB fonksiyonlarının davranışı (breakdown/completeness/snapshot arşivleme) canlıda transactional test ile doğrulanır — proje convention'ı (spec 008/028/029/030). ImpactPanel.vue'daki post-processing için saf bir JS yardımcı fonksiyonu çıkarılabiliyorsa Vitest ile test edilir.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/`, `tests/unit/` at repository root.

---

## Phase 1: Setup

*(none — no new dependencies/project scaffolding needed)*

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T001 Create `supabase/migrations/<timestamp>_impact_analysis_gaps.sql`: `ALTER TABLE exposure_features ADD COLUMN IF NOT EXISTS asset_category TEXT;`, `ADD COLUMN IF NOT EXISTS sector TEXT;`, `ADD COLUMN IF NOT EXISTS admin_boundary_code TEXT;` (data-model.md) — bu migration dosyası sonraki tüm task'larda genişletilecek (aynı dosya, sıralı ekler)

**Checkpoint**: Şema hazır — tüm user story'ler bu kolonlara bağımlı, önce tamamlanmalı.

---

## Phase 3: User Story 1 - Kritik altyapıyı öne çıkarma (Priority: P1) 🎯 MVP

**Goal**: Yönetici, Impact panelinde kritik altyapı varlıklarını ayrı bir listede görebilir.

**Independent Test**: quickstart.md Senaryo 1 — kritik altyapı etiketli/etiketsiz varlıklar karışık bir dataset'te, panelin kritik altyapıyı doğru ayırdığı doğrulanır.

### Implementation for User Story 1

- [X] T002 [US1] Aynı migration dosyasında: `exposure_features.asset_category` için mevcut `ExposureDatasetManager.vue`'nun veri yükleme akışına (CSV/GeoJSON import) `asset_category` alanının okunması ekle — import sırasında kaynak dosyada bu alan yoksa NULL bırakılır (FR-003)
- [X] T003 [US1] In `src/components/impact/ImpactPanel.vue`: analiz sonucu görüntülendiğinde, seçili dataset'in yarıçap içindeki `asset_category LIKE 'critical_infrastructure_%'` olan varlıklarını ayrı bir sorgu ile çekip "Kritik Altyapı" başlıklı bir liste/filtre bölümünde göster; hiç kritik altyapı yoksa "kritik altyapı verisi yok" mesajı göster

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 2 - CAP onayında (yayınında) impact snapshot arşivleme (Priority: P1) 🎯 MVP

**Goal**: Bir CAP taslağı yayına alındığında, o anki impact sonucu kalıcı olarak arşivlenir.

**Independent Test**: quickstart.md Senaryo 2 — CAP yayına alınır, `impact_snapshots` satırı oluşur, sonradan kaynak senaryo değişse de snapshot değişmez; impact verisi olmayan durumda da onay akışı bloklanmaz.

### Implementation for User Story 2

- [X] T004 [US2] Aynı migration dosyasında: `impact_snapshots` tablosu (`id, cap_draft_id, impact_scenario_id, data_available, snapshot_data, country_code, org_id, created_at` — data-model.md) — FK'ler `ON DELETE CASCADE`/`ON DELETE SET NULL` olarak belirtildiği gibi; RLS: `exposure_datasets`/`impact_scenarios`'ın mevcut SELECT policy desenini (super_admin VEYA country_code/org_id eşleşmesi) mirror et, hiçbir role INSERT/UPDATE/DELETE policy'si yok
- [X] T005 [US2] Aynı migration dosyasında: `archive_impact_snapshot()` `SECURITY DEFINER` trigger fonksiyonu — `cap_drafts.country_code`/`org_id`'sine göre en güncel (`created_at DESC LIMIT 1`) `impact_scenarios` kaydını arar; bulunursa `impact_scenario_id`/`snapshot_data=result_snapshot`/`data_available=true` ile, bulunamazsa `impact_scenario_id=NULL`/`snapshot_data=NULL`/`data_available=false` ile `impact_snapshots`'a INSERT yapar (research.md Decision 1/2)
- [X] T006 [US2] Aynı migration dosyasında: `DROP TRIGGER IF EXISTS trg_archive_impact_snapshot ON cap_drafts;` + `CREATE TRIGGER trg_archive_impact_snapshot AFTER UPDATE OF status ON cap_drafts FOR EACH ROW WHEN (NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION archive_impact_snapshot();` — `notify_dispatch_on_broadcast` trigger'ından bağımsız, ayrı bir trigger olarak (research.md Decision 1)
- [X] T007 [US2] In `src/components/admin/DispatchPanel.vue`: `dispatch_jobs` tablosunun `v-for="job in jobs"` satırlarına (mevcut `cap_drafts` başlığı/receipt özetinin gösterildiği bölüm, ~satır 88-112) `job.cap_draft_id` ile eşleşen `impact_snapshots` kaydını sorgulayıp bir detay hücresi/genişletilebilir satır olarak gösterir (`snapshot_data` varsa özet metrik, `data_available=false` ise "impact verisi mevcut değildi" mesajı)

**Checkpoint**: User Story 2 fully functional and independently testable.

---

## Phase 5: User Story 3 - Sektörel / idari sınır seviyesi agregasyon (Priority: P2)

**Goal**: Impact sonuçları sektöre veya idari sınır seviyesine göre gruplanmış olarak görüntülenebilir.

**Independent Test**: quickstart.md Senaryo 3 — farklı sektör/sınır etiketli varlıklar için alt toplamların doğru gruplandığı ve genel toplamla tutarlı olduğu doğrulanır.

### Implementation for User Story 3

- [X] T008 [P] [US3] Aynı migration dosyasında: `compute_sector_breakdown(dataset_id UUID, center_lat float8, center_lng float8, radius_km float8) RETURNS TABLE(group_key TEXT, total_value float8, feature_count int) LANGUAGE sql STABLE` — `compute_zonal_stats` ile aynı `ST_DWithin` filtresi + `GROUP BY COALESCE(sector, 'unclassified')` (data-model.md)
- [X] T009 [P] [US3] Aynı migration dosyasında: `compute_boundary_breakdown(dataset_id UUID, center_lat float8, center_lng float8, radius_km float8) RETURNS TABLE(group_key TEXT, total_value float8, feature_count int) LANGUAGE sql STABLE` — aynı imza, `GROUP BY COALESCE(admin_boundary_code, 'unclassified')` (data-model.md)
- [X] T010 [US3] In `src/components/impact/ImpactPanel.vue`: "Sektöre Göre Kırılım" / "İdari Sınıra Göre Kırılım" görünümü ekle — kullanıcı bir kırılım tipi seçer, ilgili RPC (`compute_sector_breakdown`/`compute_boundary_breakdown`) çağrılır, sonuç gruplanmış alt toplamlar olarak listelenir (unclassified grubu dahil, FR-009)

**Checkpoint**: User Story 3 fully functional and independently testable.

---

## Phase 6: User Story 4 - Veri tamlığı / güven metriği (Priority: P3)

**Goal**: Her impact hesaplama sonucuna, kullanılan verinin tamlığını gösteren bir skor eşlik eder.

**Independent Test**: quickstart.md Senaryo 4 — kısmi etiketlenmiş bir dataset için skorun beklenen yüzdeyle eşleştiği, tam etiketlenmiş dataset'te %100, boş yarıçapta "veri yok" olduğu doğrulanır.

### Implementation for User Story 4

- [X] T011 [US4] Aynı migration dosyasında: `compute_data_completeness(dataset_id UUID, center_lat float8, center_lng float8, radius_km float8) RETURNS TABLE(total_features int, tagged_features int, completeness_ratio float8) LANGUAGE sql STABLE` — `total_features = 0` ise `completeness_ratio = NULL` (research.md Decision 3, 0'a bölme hatası önlenir)
- [X] T012 [US4] In `src/components/impact/ImpactPanel.vue`: analiz sonucu görüntülendiğinde `compute_data_completeness` RPC'si çağrılır, `completeness_ratio` yüzde olarak gösterilir; `NULL` ise "veri yok" mesajı gösterilir (yanıltıcı %0/%100 gösterilmez, FR-011)

**Checkpoint**: User Story 4 fully functional and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T013 [P] Add i18n coverage for new UI text (kritik altyapı listesi başlığı/boş durum, impact snapshot görünümü metinleri, sektör/sınır kırılımı etiketleri, veri tamlığı skoru etiketi/"veri yok" metni) across all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T014 Run `npm run test` and confirm all existing frontend tests pass with no regressions
- [X] T015 Run `npm run build` and confirm a clean build
- [X] T016 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Impact Analysis modülünün MHEWS-FR-0078/FR-0171/FR-0020/FR-0337/FR-0345/FR-0260 gereksinimleri artık kapandı — tamamlanma yüzdesini ve anlatıyı güncelle

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: Tüm user story'lerin ön koşulu — önce tamamlanmalı
- **User Story 1 (Phase 3)**: Foundational'a bağımlı, diğer story'lerden bağımsız
- **User Story 2 (Phase 4)**: Foundational'a bağımlı, diğer story'lerden bağımsız
- **User Story 3 (Phase 5)**: Foundational'a bağımlı, diğer story'lerden bağımsız
- **User Story 4 (Phase 6)**: Foundational'a bağımlı, diğer story'lerden bağımsız
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Parallel Opportunities

- T008/T009 (US3, farklı fonksiyonlar aynı dosyada ama bağımsız) paralel yazılabilir
- User Story 1/2/3/4 birbirinden bağımsız olduğu için, aynı migration dosyasına sıralı ekler yapıldıktan sonra frontend task'ları (T003/T007/T010/T012) paralel geliştirilebilir
- T013 (i18n) T014/T015 ile paralel çalışabilir

---

## Implementation Strategy

### MVP First

1. Complete Phase 2: Foundational (şema kolonları)
2. Complete Phase 3: User Story 1 (kritik altyapı) — MHEWS-FR-0078/FR-0171'i kapatır
3. Complete Phase 4: User Story 2 (onay anı snapshot) — MHEWS-FR-0020'yi kapatır
4. **STOP and VALIDATE**: quickstart.md Senaryo 1-2

### Incremental Delivery

5. Complete Phase 5: User Story 3 (sektörel/sınır agregasyonu) — MHEWS-FR-0337/FR-0345'i kapatır
6. Complete Phase 6: User Story 4 (veri tamlığı) — MHEWS-FR-0260'ı kapatır
7. **STOP and VALIDATE**: quickstart.md Senaryo 3-4
8. Complete Phase 7: Polish (i18n/test/build/docs)

---

## Notes

- Tek migration dosyası (`<timestamp>_impact_analysis_gaps.sql`), T001/T004/T005/T006/T008/T009/T011'de sırayla genişletilir
- Mevcut `compute_zonal_stats()` fonksiyonu hiç değiştirilmez (research.md Decision 5)
- `exposure_datasets`/`impact_scenarios`'ın mevcut RLS'i, CAP onay state machine'i (spec 009) hiç değişmez (additive)
- Commit only when explicitly requested by the user
