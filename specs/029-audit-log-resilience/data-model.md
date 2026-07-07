# Data Model: Denetim Günlüğü Dayanıklılığı

## Değişen Entity: `audit_log`

Kaynak: `supabase/migrations/20260605120000_audit_log.sql` (spec 007). Şema/kolonlar DEĞİŞMEZ, sadece yeni bir CHECK constraint eklenir:

```sql
ALTER TABLE audit_log
  ADD CONSTRAINT chk_audit_log_completeness
  CHECK (action NOT IN ('INSERT','UPDATE','DELETE') OR table_name IS NOT NULL);
```

**Düzeltme notu (canlı uygulama sırasında bulundu)**: İlk tasarım `table_name AND record_id` ikisini de zorunlu kılıyordu — canlıya uygulanırken mevcut satırlarla çakışıp reddedildi. Sebep: `log_table_change()` `record_id`'yi `to_jsonb(NEW)->>'id'` ile çıkarıyor (bkz. `20260706190000_fix_log_table_change_missing_id.sql`), bu da birincil anahtarı `id` olmayan tablolar için (örn. `hazard_types` PK=`code`, `country_boundaries` PK=`country_code`, `integration_types` PK=`code`) `NULL` döner — bu MEVCUT, kabul edilmiş bir davranıştır, bozuk veri değil. Salt-okunur bir sorguyla doğrulandı: `table_name` INSERT/UPDATE/DELETE olaylarında HİÇBİR ZAMAN null değil, sadece `record_id` bazı tablolarda null olabiliyor. Düzeltilmiş constraint sadece `table_name`'i zorunlu kılıyor.

## Yeni Entity: `audit_log_dead_letter`

| Alan | Tip | Açıklama |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `action` | TEXT | Yazılmaya çalışılan orijinal aksiyon (`INSERT`/`UPDATE`/`DELETE`) |
| `table_name` | TEXT | Etkilenen tablo |
| `record_id` | TEXT | Etkilenen kayıt id'si |
| `old_data` | JSONB | Varsa eski değer |
| `new_data` | JSONB | Varsa yeni değer |
| `error_message` | TEXT | Yakalanan istisnanın mesajı (`SQLERRM`) |
| `failed_at` | TIMESTAMPTZ | `DEFAULT NOW()` |

RLS: `super_admin_read_audit_dead_letter` (SELECT, `audit_log`'un `super_admin_read_audit` policy'siyle birebir aynı mantık) — hiçbir role INSERT/UPDATE/DELETE policy'si yok (sadece SECURITY DEFINER fonksiyonlar üzerinden yazılır/silinir).

## Değişen Fonksiyon: `log_table_change()`

Her `IF TG_OP = '...'` dalı kendi `BEGIN...EXCEPTION WHEN OTHERS THEN` bloğuna alınır:

```sql
IF TG_OP = 'INSERT' THEN
  BEGIN
    INSERT INTO audit_log (action, table_name, record_id, new_data)
    VALUES ('INSERT', TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO audit_log_dead_letter (action, table_name, record_id, new_data, error_message)
    VALUES ('INSERT', TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW), SQLERRM);
  END;
  RETURN NEW;
-- UPDATE/DELETE dalları aynı desende
```

`RETURN NEW`/`RETURN OLD` her koşulda (başarı veya dead-letter'a düşme) çalışır — asıl trigger'ı tetikleyen işlem hiçbir zaman engellenmez (FR-001).

## Yeni Fonksiyon: `flush_audit_dead_letter() RETURNS TABLE(succeeded INT, failed INT)`

- **Çağıran**: `authenticated`, sadece `current_profile_role() = 'super_admin'`
- **Davranış**: `audit_log_dead_letter`'daki her satırı sırayla `audit_log`'a yazmayı dener (aynı CHECK constraint'e tabi); başarılı olanları dead-letter'dan siler; kaç tanesinin başarılı/başarısız olduğunu döner.

## Frontend Değişikliği: `src/views/AdminView.vue`

Denetim sekmesine (mevcut "Geçmiş Raporlar" alt bölümünün yanına) yeni bir "Bekleyen Denetim Kayıtları" alt bölümü:
- `audit_log_dead_letter`'dan satır sayısını gösteren bir sayaç (0 ise bölüm gizlenebilir veya "yok" gösterebilir)
- "Tekrar Dene" butonu → `flush_audit_dead_letter()` RPC'sini çağırır, sonucu (X başarılı, Y başarısız) kullanıcıya gösterir, listeyi yeniler
