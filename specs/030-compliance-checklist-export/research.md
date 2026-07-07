# Research: Uyumluluk Kontrol Listesi Export'u ve Şablon Versiyonlama

## Decision 1: Kontrol listesi kriterleri ve veri kaynakları

**Decision**: 4 kriter, hepsi mevcut tablolardan salt-okunur türetilir, yeni migration yok:

| Kriter | Veri kaynağı | Durum mantığı |
|---|---|---|
| (a) Rapor zamanında üretildi mi | `compliance_reports.generated_at` vs `period_end` | `generated_at <= period_end + 2 gün` → met, değilse unmet |
| (b) Hash-zinciri bütünlüğü doğrulandı mı | `compliance_reports.summary.integrity_ok` | `true` → met, `false` → unmet |
| (c) O dönemde bekleyen (dead-letter) bir denetim yazma hatası var mı | `audit_log_dead_letter` (period_start/period_end aralığında `failed_at`) | 0 satır → met, >0 → unmet |
| (d) Tamlık kuralı (chk_audit_log_completeness) etkin mi | Sabit/bilgi amaçlı (bkz. Decision 2) | schema'da constraint var → met |

**Rationale**: Bu 4 kriter, spec.md FR-003'ün listelediği kriterlerle birebir örtüşüyor ve hepsi zaten var olan tablolardan (compliance_reports, audit_log_dead_letter) hesaplanabiliyor — yeni bir veri toplama mekanizması gerekmiyor (YAGNI).

**Alternatives considered**: `audit_log` tablosunun kendisini tarayıp dönem içindeki INSERT/UPDATE/DELETE sayılarını ayrıca bir "tamlık" kriteri olarak saymak — reddedildi, çünkü bu zaten `compliance_reports.summary.by_action`'da var ve PRD'nin checklist kriterleriyle doğrudan eşleşmiyor.

## Decision 2: Kriter (d) — "tamlık ihlali oldu mu" nasıl ölçülür?

**Problem**: `chk_audit_log_completeness` (spec 029) bir CHECK constraint'tir — eksik-bilgili bir INSERT denendiğinde veritabanı bu satırı EN BAŞTAN reddeder (transaction fail olur). Reddedilen denemelerin kendisi hiçbir yerde loglanmaz (tanım gereği, çünkü INSERT hiç tamamlanmadı). Bu yüzden "o dönemde kaç tane tamlık ihlali denendi" sorusunun cevabı retrospektif olarak sorgulanamaz.

**Decision**: Kriter (d), "o dönemde ihlal denendi mi" yerine "tamlık kuralı şu anda şemada etkin mi" olarak yeniden yorumlanır — `pg_constraint`'te `chk_audit_log_completeness`'in var olup olmadığını kontrol eden tek satırlık bir bilgi (dönem-bağımsız, sabit "met" durumu, kural mevcut olduğu sürece). Bu, önceki specler 019/026/028/029'da defalarca kullanılan "bilinen kısıtlama, açıkça belgelenmiş" desenine uygun bir pragmatik karar.

**Rationale**: Bir CHECK constraint'in kendisi zaten önleyici bir korumadır — "ihlal sayısı sıfır" garantisini transaction seviyesinde veriyor, ayrı bir sayaç tutmaya gerek yok. Kullanıcıya (checklist export'unu okuyan denetçiye) bu nüans `evidence` alanında açıkça belirtilir ("bu kriter dönemden bağımsız, kuralın DB seviyesinde etkin olduğunu doğrular").

**Alternatives considered**: `log_table_change()`'in exception-yakalama bloğuna yeni bir "completeness violation" dead-letter kategorisi eklemek — reddedildi (YAGNI + kapsam dışı, mevcut `log_table_change()`'i tekrar değiştirmek gerekirdi, bu spec'in amacı değil; ayrıca trigger zaten her zaman `table_name`'i dolduruyor, bu constraint'i asla ihlal etmiyor — ihlal sadece varsayımsal gelecekteki manuel INSERT'ler için bir koruma).

## Decision 3: Şablon versiyonlama yaklaşımı

**Decision**: `src/services/complianceChecklist.js` içinde `export const TEMPLATE_VERSION = 'v1'` sabiti. Hem yeni checklist export'una hem de mevcut `downloadComplianceReport()`/CSV-JSON export'larına bir `template_version` alanı olarak eklenir (flatRows'a bir satır/kolon olarak).

**Rationale**: Tam bir şablon-geçmişi tablosu (versiyon numarası + değişiklik tarihi + hangi export hangi sürümle üretildiğinin DB'de kalıcı izlenmesi) FR-071'in gerektirdiğinden fazlası — mevcut export'lar zaten anlık üretiliyor (DB'de saklanmıyor, sadece dosya indiriliyor), bu yüzden "hangi sürümle üretildi" bilgisinin dosyanın kendisinde görünmesi yeterli (YAGNI).

**Alternatives considered**: `compliance_reports` tablosuna bir `template_version` kolonu eklemek (migration gerektirir) — reddedildi, çünkü mevcut raporlar zaten üretildiği haliyle sabit kalıyor (schema değişikliği gerektirmeden, export ANINDA sabitten okunan bir değer yeterli).

## Decision 4: Test coverage

**Decision**: `buildComplianceChecklist(report, deadLetterRowsInPeriod)` saf fonksiyonu Vitest ile mock'suz test edilir (mevcut convention, bkz. `tests/unit/shelterMarkerStyle.test.js`, `tests/unit/hazardThresholdEvaluation.test.js`). AdminView.vue'daki UI entegrasyonu (buton tıklama, dosya indirme) için yeni bir component testi gerekmez — mevcut projede UI-seviyesi export butonları hiçbir zaman ayrı test edilmemiş (sadece altındaki saf fonksiyonlar test ediliyor).

**Rationale**: Proje convention'ıyla tutarlı — saf mantık test edilir, DOM/dosya-indirme entegrasyonu manuel/quickstart doğrulamasına bırakılır.
