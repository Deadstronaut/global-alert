# GEWS Proje Durumu (Özet)

> Son güncelleme: 2026-07-06
> Bu doküman "şu an ne durumdayız?" sorusuna hızlı cevap vermek için yazıldı. Detaylı teknik bilgi için [TECHNICAL.md](../TECHNICAL.md), genel tanıtım için [README.md](../README.md) dosyalarına bakın.

---

## 1. Proje nedir?

**GEWS (Global Early Warning System)** — deprem, orman yangını, sel, kuraklık ve gıda güvenliği krizlerini tek bir haritada/globe'da toplayan, gerçek zamanlı afet izleme ve erken uyarı uygulaması.

- **Frontend:** Vue 3 + Vite, Pinia, Leaflet/globe.gl
- **Backend:** Supabase (PostgreSQL + Deno Edge Functions)
- **Mobil:** Capacitor (iOS/Android)

---

## 2. Daha önce belgelenmiş olanlar (var olan dokümantasyon)

| Dosya | İçerik |
|---|---|
| [README.md](../README.md) | Özellikler, tech stack, kurulum |
| [TECHNICAL.md](../TECHNICAL.md) | Mimari, veri akışı, store'lar, edge function mantığı — detaylı teknik referans |
| [docs/security_roles_protocol.md](security_roles_protocol.md) | Rol hiyerarşisi (Super Admin → Country Admin → Org Admin → Viewer), RLS planı |
| [docs/iş planı istereler.txt](iş%20planı%20istereler.txt) | Modül bazlı iş listesi ve tamamlanma yüzdeleri (ana takip tablosu) |
| [specs/001-data-ingestion-monitoring/](../specs/001-data-ingestion-monitoring/) | Spec-Kit ile yazılmış tam spec (spec/plan/tasks/data-model) — "Data Source Health" özelliği |
| [specs/002-source-scoping/](../specs/002-source-scoping/) | Spec-Kit ile yazılmış tam spec — kaynakların (data_sources) küresel/ülkeye-özel olarak ayrılması (bkz. bölüm 4b) |
| [docs/plans/2024-05-14-map-fixes.md](plans/2024-05-14-map-fixes.md) | Harita düzeltmeleri planı |

Bu belge bunların **yerine geçmiyor**, sadece hepsine tek bir yerden özet ve yönlendirme sağlıyor.

---

## 3. Genel ilerleme (modül bazlı)

Kaynak: `docs/iş planı istereler.txt` — proje genelinde takip edilen ana tablo.

| Modül | Tamamlanma | Zorluk | Durum |
|---|---|---|---|
| Data Ingestion & Monitoring | **%64** | Orta | Spec 001 (source health/state machine, admin dashboard, CRUD, payload validation) + spec 002 (kaynakların küresel/ülkeye-özel ayrımı, RLS) tamamlandı. Kalan: OGC WMS/WFS adapter |
| Integration & API Gateway | %67 | Kolay | Neredeyse bitti |
| Impact Analysis (Map Viz) | %15 | Orta-Zor | Split-view, geocoding, PostGIS exposure analizi eksik |
| Administration & Access | %19 | Kolay | Auth aktif ediliyor (bkz. bölüm 4), user CRUD UI sürüyor |
| Alert Authoring / CAP | %1 | Orta | Sadece `cap_drafts` tablosu var, form UI yok |
| Dissemination | %0 | Orta | Hiç başlanmadı (email/WhatsApp gönderim) |
| Incident Tracking | %0 | Orta | Hiç başlanmadı |
| Hazard Taxonomy Admin | %0 | Orta | Hiç başlanmadı |
| Audit & Compliance | %0 | Orta-Zor | Hiç başlanmadı |
| Forecasting / AI | %0 | Çok Zor | Hiç başlanmadı |
| Risk & Scenario Modeling | %0 | Çok Zor | Hiç başlanmadı |
| Preparedness, Drill & Response | %0 | Orta | Hiç başlanmadı |
| **TOPLAM** | **%14** (389/446 kalem tamamlanmadı ⚠️ tablo "Kalan/Toplam" formatında, %14 = tamamlanma) | | |

**Not:** Bu tablo çok geniş bir gereksinim listesine (446 madde) göre hesaplanmış olduğu için toplam %14 düşük görünüyor; asıl aktif çalışılan modüllerde (Data Ingestion, Admin/Access) ilerleme çok daha yüksek.

---

## 4. Şu anda üzerinde çalışılan / commit edilmemiş işler

Repo'da **çok sayıda commit'lenmemiş değişiklik** var. Başlıcaları:

### a) Kimlik doğrulama & rol bazlı erişim (RBAC) — aktif geliştirme
- `src/stores/auth.js`, `src/views/LoginView.vue`, `src/router/index.js`, `src/views/AdminView.vue` büyük ölçüde değişmiş (AdminView tek başına +1009/-satır).
- Bu, `docs/security_roles_protocol.md`'de tanımlanan Super Admin/Country Admin/Org Admin/Viewer hiyerarşisinin gerçek uygulamaya geçirilmesi ile ilgili.
- Yeni migration'lar bunu destekliyor: `country_code`, `region_code`, org-scoped RLS, profiles RLS recursion fix'leri (`20260703_*`, `20260704_*` migration dosyaları).

### b) Data Ingestion & Monitoring (spec 001) — tamamlandı, DB'ye de uygulanmış (doğrulandı 2026-07-05)
- `specs/001-data-ingestion-monitoring/tasks.md`'e göre **tüm görevler tamamlandı**; `tasks.md` dosyasındaki T032 notu "kullanıcı onayı bekleniyor, henüz push edilmedi" diyordu ama bu **artık güncel değil**.
- Canlı Supabase projesine yapılan salt-okunur REST kontrolüyle doğrulandı: `data_sources`, `source_state_transitions`, `rejected_payloads`, `country_boundaries` tabloları ve `profiles.country_code/region_code/org_id` kolonları **gerçekten mevcut**. Yani ilgili migration'lar (`20260703_data_sources.sql` dahil `20260703_*`–`20260705_*` arası tüm dosyalar) canlıya uygulanmış durumda.
- `data_sources` tablosu şu an **boş** — şema var ama henüz gerçek veri/health kaydı birikmemiş (fetch-* fonksiyonları çalışıp `recordFetchOutcome()` tetiklenince dolacak).
- Kod tarafı hazır: `supabase/functions/shared/{sourceHealth,validatePayload}.ts` + testleri, 5 `fetch-*` edge function'a entegre edilmiş, `src/stores/sources.js`, `SourceHealthCard.vue`, `SourceFormModal.vue`, AdminView'de "Sources" sekmesi.
- **Önemli tutarsızlık:** `npx supabase migration list` bu migration'ları remote'ta **görmüyor** — local dosya tarihleri (20260703, 20260704, 20260705...) ile remote'ta kayıtlı migration ID'leri (20260221102710, 20260410020512, ...) hiç örtüşmüyor. Şema fiilen uygulanmış olmasına rağmen CLI'ın migration-tracking tablosu bunu bilmiyor — muhtemelen bu değişiklikler `supabase db push` yerine dashboard/SQL editor üzerinden elle uygulanmış. Detay için bkz. bölüm 5.

### b2) Data Source Country Scoping (spec 002) — tamamlandı ve canlıya uygulandı (2026-07-06)
- Sorun: proje Türkiye'ye özel kaynaklarla (Kandilli, AFAD) başladı; yeni bir ülkeye (örn. Madagaskar) verildiğinde o ülkenin admin'i bu Türkiye'ye özel kaynakları görmemeli.
- Çözüm: `data_sources` tablosuna nullable `country_code` eklendi (`NULL` = küresel, herkes görür/yönetir; bir ülke kodu = sadece o ülkenin admin'leri görür/yönetir). RLS ile hem okuma hem yazma kısıtlandı; Sources sekmesi artık "Küresel Kaynaklar" / "Yerel Kaynaklar" olarak gruplu, yerel kaynak yoksa ayraç hiç görünmüyor.
- Migration (`20260706_data_sources_country_scope.sql`) canlıya **Supabase Dashboard SQL Editor üzerinden elle** uygulandı (CLI'ın `db push`'u, aşağıdaki 5. bölümde açıklanan migration-geçmişi karmaşası yüzünden kullanılamadı). Canlıda `data_sources.country_code` kolonunun var olduğu REST ile doğrulandı.
- `npm run test` (5/5), `eslint`, `npm run build` — hepsi temiz.

### c) Coğrafi/idari sınır (boundary) desteği — yeni
- `src/data/boundaries/` (Türkiye il sınırları JSON + index), `src/utils/pointInPolygon.js`, `src/utils/geoCountry.js`, `server/src/processors/geoCountry.js`
- Amaç: olayları ülke/il koduna göre etiketleyip RLS ile ülke-bazlı filtreleme yapmak (`country_code` kolonu, `20260704_country_scoped_disaster_reads.sql`, `20260705_country_boundaries.sql`).

### d) Manuel veri girişi / dosya import
- `src/components/admin/{BoundaryUploadForm,FileImportForm,ManualEntryForm}.vue`, `src/utils/{csv,fileParsers}.js`, `src/utils/severity.js` — admin panelinden manuel olay girişi ve dosyadan (Excel/CSV) toplu import için yeni bileşenler.

### e) Spec-Kit entegrasyonu
- `.specify/` klasörü ve `.claude/skills/speckit-*` — bu proje artık GitHub Spec-Kit iş akışıyla (spec → plan → tasks → implement) yönetiliyor. Yeni özellikler `specs/NNN-feature-name/` altında spec'lenip buradan geliştiriliyor (bkz. spec 001 örneği).

### f) Diğer küçük/dağınık dosyalar
- Kök dizinde `check_auth.sql`, `simulate_auth_insert.sql`, `global-alert.rar`, `update_excel.cjs` gibi geçici/tek seferlik betikler var — bunlar commit edilmemiş ve muhtemelen geçici test/debug amaçlı.

---

## 5. Şu an "riskli" veya dikkat gerektiren noktalar

1. **102 değişmiş/yeni dosya commit edilmemiş durumda.** Çok büyük bir çalışma alanı birikmiş — bir noktada mantıklı commit'lere bölünüp gönderilmesi gerekecek.
2. ~~CLI migration geçmişi hâlâ kısmen kopuk~~ **ÇÖZÜLDÜ (2026-07-06).** Kök sebep tamamen düzeltildi: aynı tarihi paylaşan (dosya adı sadece `YYYYMMDD` içerdiği için) 18 migration dosyası `git mv` ile tam zaman damgalı (`YYYYMMDDHHMMSS`) benzersiz isimlere yeniden adlandırıldı — bu arada gerçek bağımlılık sırası da düzeltildi (`organizations.sql` `profiles` tablosunu `ALTER` ettiği için `profiles.sql`'den sonra gelmeli; `backfill_country_code.sql` var olan bir kolonu güncellediği için `country_code.sql`'den sonra gelmeli — alfabetik sırada bunlar tersti). Ayrıca 7 dosyadaki (6'sı önceden, +`20260605_audit_log.sql` sonradan fark edildi) korumasız `CREATE POLICY` ifadelerine `DROP POLICY IF EXISTS` eklendi. Eski çakışan versiyon kayıtları `migration repair --status reverted`, yeni 20 versiyonun hepsi `--status applied` ile senkronize edildi (tek tek, toplu komut ara sıra bağlantı hatası veriyordu). **Doğrulandı:** `supabase migration list` artık tüm dosyalarda local=remote eşleşmesi gösteriyor, `supabase db push` **"Remote database is up to date."** diyor — `--include-all` gerekmiyor. Canlı şema (`data_sources`, `organizations`, `profiles`, `cap_drafts`, `incidents`, `drill_sessions`) REST ile tekrar doğrulandı, hiçbir şey bozulmadı.
3. **RBAC değişiklikleri (auth.js, router, AdminView) büyük ve aktif** — bu üçü birbirine bağımlı olduğu için yarım bırakılırsa login/admin akışı bozulabilir. Bu değişiklikler commit'lenmeden migration geçmişiyle uğraşmak riski artırır (ikisi karışabilir).
4. **i18n eksik:** Admin panelinin hiçbir yerinde çeviri anahtarı yok (Türkçe hardcoded) — bu bilinen ve kabul edilmiş bir eksik (spec 001 notlarında da belirtilmiş).

---

## 6. Önerilen sıradaki adımlar

1. RBAC (auth/router/AdminView) değişikliklerini test edip commit'leyin — şu an en riskli, yarım kalmış iş bu.
2. Büyük commit yığınını mantıklı gruplara bölün (örn: "RBAC", "boundary/country desteği", "manuel veri girişi", "spec-kit setup", "source scoping", "migration dosya adı düzeltmeleri").
4. Kök dizindeki geçici SQL/script dosyalarını (`check_auth.sql`, `simulate_auth_insert.sql`, `update_excel.cjs`) temizleyin veya `scripts/`/`docs/` altına taşıyın.
5. `specs/001-data-ingestion-monitoring/tasks.md` içindeki T032 notunu güncelleyin — orada hâlâ "kullanıcı onayı bekleniyor" yazıyor ama migration'lar zaten canlıda (spec 002'nin tasks.md'sindeki T016 zaten güncellendi, 001'inki henüz değil).
