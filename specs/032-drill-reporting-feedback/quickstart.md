# Quickstart: Tatbikat Raporlama ve Geri Bildirim Döngüsü

## Ön koşullar

- Migration uygulanmış olmalı (`npx supabase db push --linked`)
- `generate-drill-report` Edge Function deploy edilmiş olmalı
- En az bir tamamlanmış (`status='completed'`) tatbikat kaydı

## Senaryo 1: Tekil tatbikat export'u

1. AdminView.vue → Tatbikat sekmesinde tamamlanmış bir tatbikat kartında "Özeti Dışa Aktar" butonuna tıkla, indirilen dosyanın süre/uyarı sayısı/tepki süresi/onay oranını içerdiğini doğrula.
2. Tepki süresi/onay oranı "veri yok" olan bir tatbikat için aynı export'un bu durumu açıkça yansıttığını doğrula.

## Senaryo 2: Yıllık tatbikat raporu

1. `deno test supabase/functions/shared/drillReportSummary.test.ts` — `computeDrillReportSummary()` testlerini çalıştır.
2. `generate-drill-report`'u service-role key ile manuel çağır (`curl`), `drill_reports`'a bir kayıt eklendiğini doğrula.
3. Aynı çağrıyı tekrar yap — ikinci bir kayıt oluşmadığını doğrula (idempotent).
4. AdminView.vue'da yeni "Yıllık Tatbikat Raporları" alt bölümünden bu raporu dışa aktar.

## Senaryo 3: Ders-çıkarımı notu

1. Tamamlanmış bir tatbikat kartında bir ders-çıkarımı notu gir, isteğe bağlı bir afet tipi seç, kaydet.
2. Notun tatbikat kartında göründüğünü, "Eşik Düzenleyiciye Git" bağlantısının Hazard Taxonomy sekmesine geçtiğini doğrula.
3. Afet tipi seçilmeden not girilmesinin de kabul edildiğini doğrula.
4. `audit_log`'da bu güncellemenin (`table_name='drill_sessions'`) otomatik loglandığını doğrula (salt-okunur sorgu).

## Senaryo 4: Regresyon kontrolü

1. `npm run test` (tüm suite) — mevcut testlerin bozulmadığını doğrula.
2. `npm run build` — temiz build.
3. Mevcut tatbikat başlat/bitir akışının (spec 013/017) hiç değişmediğini doğrula.
