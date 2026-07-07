# Research: Tatbikat Raporlama ve Geri Bildirim Döngüsü

## Decision 1: Tekil tatbikat export'u — yeni mekanizma GEREKMİYOR

**Decision**: `AdminView.vue`'ya `downloadDrillSummary(drill, format)` eklenir — `drill.summary`'yi (duration_min, alerts_issued, response_time_seconds, ack_rate) flat satırlara çevirip mevcut `rowsToCsv`/`rowsToJson`/`triggerDownload` ile indirir. `downloadComplianceReport()`/`downloadIncidentReport()`'un birebir aynı deseni.

**Rationale**: Proje bu deseni 3 kez kullanmış (audit export spec 007, compliance report spec 019, incident report spec 026, access review spec 028, compliance checklist spec 030) — 4. tekrar, yeni bir soyutlama gerektirmez (üç benzer satırdan az kod, YAGNI).

**Alternatives considered**: Genel bir `exportSummaryReport(summary, filenamePrefix)` yardımcı fonksiyonu çıkarmak — reddedildi, mevcut 3 örnek de birbirinden hafifçe farklı alan isimleri kullanıyor (Constitution Principle VIII'in "üç benzer satır, erken soyutlamadan iyidir" ilkesiyle tutarlı, proje CLAUDE.md/genel talimatların da vurguladığı bir ilke).

## Decision 2: Yıllık tatbikat raporu — `incident_reports`'un birebir yapısal ikizi

**Decision**: Yeni `drill_reports` tablosu (`id, period_start, period_end, summary JSONB, generated_at`, UNIQUE(period_start, period_end)) — `20260708020000_incident_timeline_reports.sql`'deki `incident_reports`'un birebir kopyası. Yeni `generate-drill-report` Edge Function, `generate-incident-report/index.ts`'in yapısal ikizi: `mostRecentElapsedYear()` aynı, `drill_sessions`'tan `status='completed'` olan ve `ended_at` o yıl aralığında olan kayıtları çekip yeni bir saf fonksiyon `computeDrillReportSummary()` ile toplulaştırır (`total_drills`, `avg_response_time_seconds`, `avg_ack_rate`, `by_scenario_type`). `pg_cron` yıllık, `generate-incident-report-yearly`'den 5 dakika sonra (`10 0 1 1 *`) — aynı günde birden fazla yıllık job'ın Vault/pg_net'e aynı anda yüklenmesini biraz seyreltmek için (kozmetik, işlevsel bir gereklilik değil).

**Rationale**: Proje bu deseni (compliance_reports → incident_reports) zaten bir kez tekrarlamış, ikinci tekrar mimari risk taşımaz — "kanıtlanmış desen" olarak kabul edilir (spec 026'nın kendi research.md'si de aynı gerekçeyi kullanmıştı).

**Alternatives considered**: Tatbikat ve incident raporlarını TEK bir genel "yıllık operasyonel rapor" tablosunda birleştirmek — reddedildi, ikisi farklı domain'ler (tatbikat vs. gerçek olay), farklı okuyucu kitleleri (drill raporları eğitim/hazırlık odaklı, incident raporları gerçek performans odaklı); birleştirmek gereksiz bir soyutlama olurdu.

## Decision 3: Ortalama metriklerin "veri yok" durumları nasıl toplulaştırılır

**Decision**: `computeDrillReportSummary(drills)` saf fonksiyonu, `response_time_seconds`/`ack_rate` alanı `null` olan tatbikatları ortalama hesaplamasından HARİÇ TUTAR (ortalamaya dahil etmez, sıfır olarak saymaz) — eğer hiçbir tatbikatta veri yoksa ortalama `null` döner ("veri yok").

**Rationale**: `computeResponseTimeSeconds`/`computeAckRate` (spec 017) zaten "veri yoksa null döndür, asla 0 gösterme" ilkesini kuruyor — toplulaştırma bu ilkeyi ihlal etmemeli, aksi halde "hiç tepki verilmedi" (gerçek 0) ile "hiç ölçüm yapılamadı" (null) birbirine karışır.

**Alternatives considered**: Veri olmayan tatbikatları 0 olarak sayıp ortalamayı düşürmek — reddedildi, spec 017'nin kendi kurduğu ilkeyle doğrudan çelişirdi.

## Decision 4: Ders-çıkarımı notu ve eşik-kalibrasyon bağlantısı — veri modeli

**Decision**: `drill_sessions`'a 2 yeni nullable kolon: `lessons_learned TEXT`, `related_hazard_type TEXT REFERENCES hazard_types(code) ON DELETE SET NULL`. UI'da (AdminView.vue'nun mevcut `drill-card` şablonu), tamamlanmış bir tatbikat kartına bir metin alanı + afet tipi dropdown'u (mevcut `hazardTypesStore`'dan) eklenir; bir afet tipi seçilirse, aynı sayfa içinde `tab.value = 'hazardTaxonomy'` yaparak (route değişikliği değil, aynı component içinde sekme geçişi) Hazard Taxonomy panel'ine yönlendiren bir bağlantı gösterilir.

**Rationale**: Ayrı bir "eşik değişikliği önerisi" tablosu/iş akışı kurmak, PRD'nin "feed calibration recommendations" ifadesinin gerektirdiğinden fazlası olurdu — asıl eşik değişikliği zaten mevcut, çalışan bir admin panelinden (spec 010/020) yapılıyor; bu spec sadece "buraya bak" bağlantısı ekliyor (YAGNI).

**Alternatives considered**: Otomatik bir "önerilen yeni eşik değeri" hesaplayan bir algoritma — reddedildi, PRD bunu hiç talep etmiyor (araştırma bunu doğruladı) ve büyük bir belirsizlik/karmaşıklık riski taşırdı; insan-onaylı bağlantı yeterli ve güvenli.

## Decision 5: Test coverage

**Decision**: `computeDrillReportSummary()` Deno tarafında (`supabase/functions/shared/drillReportSummary.ts` + `.test.ts`), `incidentReportSummary.test.ts` convention'ıyla aynı şekilde test edilir. Frontend tarafında yeni bir saf fonksiyon yok (export flatten mantığı `downloadComplianceReport()` gibi doğrudan component içinde, ayrı test gerektirmeyen bir desen — proje convention'ı).

**Rationale**: `computeDrillReportSummary` Edge Function (Deno) tarafında yaşıyor, mevcut `computeSeverityAndHazardBreakdown`/`computeAverageTimeToCloseHours`/`computeFalseAlarmRate` (incidentReportSummary.ts) ile aynı katmanda.
