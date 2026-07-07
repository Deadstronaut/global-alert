# Data Model: Uyumluluk Kontrol Listesi Export'u ve Şablon Versiyonlama

Bu spec hiçbir veritabanı şemasını değiştirmez — sadece mevcut tablolardan salt-okunur türetilen bir frontend görünümü ekler.

## Kullanılan mevcut entity'ler (değişmez)

- `compliance_reports` (spec 019): `id, period_start, period_end, summary JSONB { by_action, by_table, integrity_ok, broken_seq }, generated_at`
- `audit_log_dead_letter` (spec 029): `id, action, table_name, record_id, old_data, new_data, error_message, failed_at`

## Yeni (kalıcı olmayan, sadece runtime) yapı: `ComplianceChecklist`

`buildComplianceChecklist(report, deadLetterRowsInPeriod)` fonksiyonunun döndürdüğü değer — hiçbir tabloya yazılmaz, sadece export anında hesaplanır:

```js
{
  templateVersion: 'v1',
  periodStart: report.period_start,
  periodEnd: report.period_end,
  items: [
    { criterion: 'report_generated_on_time', status: 'met' | 'unmet', evidence: { generated_at, period_end } },
    { criterion: 'hash_chain_integrity', status: 'met' | 'unmet', evidence: { integrity_ok, broken_seq } },
    { criterion: 'no_pending_dead_letter', status: 'met' | 'unmet', evidence: { dead_letter_count_in_period } },
    { criterion: 'completeness_constraint_enforced', status: 'met', evidence: { note: 'chk_audit_log_completeness DB seviyesinde etkin, dönemden bağımsız' } },
  ]
}
```

- `status`: `'met' | 'unmet'` — spec.md'nin `'unknown'` (belirlenemedi) durumu bu 4 kriter için pratikte hiç oluşmaz (hepsi mevcut alanlardan doğrudan hesaplanabilir), ama fonksiyon `report.summary` eksik/null gelirse (ör. bozuk veri) ilgili maddeyi `'unknown'` olarak işaretleyip hata fırlatmaz (savunmacı, ama gerçek dünyada asla tetiklenmeyen bir dal).

## Frontend Değişikliği: `src/views/AdminView.vue`

"Geçmiş Raporlar" alt bölümündeki her rapor satırına (mevcut CSV/JSON butonlarının yanına) yeni bir "Kontrol Listesi" export butonu eklenir — `buildComplianceChecklist()` çağrılıp sonucu mevcut `rowsToCsv`/`rowsToJson`/`triggerDownload` ile indirilir (checklist `items` dizisi flat satırlara çevrilerek).

Mevcut `downloadComplianceReport()`'un ürettiği flatRows'a da `template_version: TEMPLATE_VERSION` alanı eklenir (her satıra, mevcut satır şekli bozulmadan).
