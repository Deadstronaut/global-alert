# Quickstart: Uyumluluk Kontrol Listesi Export'u ve Şablon Versiyonlama

Bu spec migration İÇERMEZ — sadece frontend değişikliği. Doğrulama tamamen yerel test + manuel UI kontrolü ile yapılır.

## Ön koşullar

- `npm install` yapılmış olmalı
- En az bir `compliance_reports` kaydının var olması (spec 019'dan zaten var olmalı — yoksa Senaryo 1 "boş durum" olarak test edilir)

## Senaryo 1: Rapor yokken kontrol listesi export'u

1. Test/geliştirme ortamında `compliance_reports` boşsa, Denetim sekmesi → Geçmiş Raporlar alt bölümünün "henüz rapor yok" mesajını gösterdiğini doğrula (mevcut davranış, regresyon yok).

## Senaryo 2: Normal kontrol listesi export'u

1. `npm run test -- complianceChecklist` çalıştır — `buildComplianceChecklist()` testlerinin geçtiğini doğrula:
   - `integrity_ok: true`, dead-letter yok → 4 kriterin de `met` olduğunu doğrula
   - `integrity_ok: false` → hash-zinciri kriterinin `unmet` olduğunu doğrula
   - dead-letter dönemde 1+ satır → ilgili kriterin `unmet` olduğunu doğrula
   - `generated_at` period_end'den çok sonra → zamanında üretim kriterinin `unmet` olduğunu doğrula
2. `npm run dev` başlat, Super Admin olarak giriş yap, Denetim sekmesi → Geçmiş Raporlar → bir rapor satırında "Kontrol Listesi" butonuna tıkla, indirilen dosyanın 4 maddeyi + `template_version: v1` alanını içerdiğini doğrula.

## Senaryo 3: Mevcut export'lara şablon sürümü eklenmesi

1. Mevcut CSV/JSON export butonlarından birini (Geçmiş Raporlar) tıkla, çıktının `template_version: v1` satırını/alanını içerdiğini doğrula (regresyon yok — mevcut alanlar hâlâ aynı).

## Senaryo 4: Regresyon kontrolü

1. `npm run test` (tüm suite) — mevcut testlerin hiçbirinin bozulmadığını doğrula.
2. `npm run build` — temiz build.
