# Quickstart: Denetim Günlüğü Dayanıklılığı

Ön koşul: migration uygulanmış (`npx supabase db push --linked`).

## Senaryo 1: Normal denetim yazımı regresyonsuz çalışır (US1, Acceptance 1)

1. `profiles` tablosunda bir satırı güncelle (örn. bir kullanıcının rolünü değiştir).
2. Beklenen: hem güncelleme başarılı olur hem de `audit_log`'da yeni bir satır görünür (mevcut davranış).

## Senaryo 2: Yazma hatası asıl işlemi engellemez (US1, FR-001, SC-001)

1. (Test ortamında) `audit_log`'a geçici bir kısıt ihlali oluşturacak bir durum simüle et — örn. transactional test içinde CHECK constraint'i kasıtlı olarak ihlal eden bir sahte trigger senaryosu.
2. Denetlenen bir tabloda bir değişiklik yap.
3. Beklenen: değişiklik başarıyla tamamlanır (asıl işlem hiç engellenmez).

## Senaryo 3: Başarısız kayıt bekleme alanında görünür (US1, FR-002, SC-002)

1. Senaryo 2'nin ardından `audit_log_dead_letter` tablosunu kontrol et.
2. Beklenen: başarısız olan kaydın bilgisi (action/table_name/record_id/error_message) orada görünür.

## Senaryo 4: Super Admin bekleyen kayıtları tekrar dener (US1, FR-003, FR-004, SC-003)

1. Super_admin hesabıyla giriş yap, Denetim sekmesindeki "Bekleyen Denetim Kayıtları" alt bölümünü aç.
2. "Tekrar Dene" butonuna tıkla.
3. Beklenen: sonuç (X başarılı, Y başarısız) gösterilir; başarılı olanlar listeden kaybolur.

## Senaryo 5: Eksik bilgili kaynağa-bağlı kayıt reddedilir (US2, FR-005, SC-004)

1. (Transactional test) `INSERT INTO audit_log (action, table_name, record_id) VALUES ('INSERT', NULL, NULL)` dene.
2. Beklenen: CHECK constraint ihlali nedeniyle reddedilir.

## Senaryo 6: Kaynağa-bağımsız olay etkilenmeden çalışır (US2, FR-006, SC-004)

1. (Transactional test) `INSERT INTO audit_log (action, table_name, record_id) VALUES ('LOGIN', NULL, NULL)` dene.
2. Beklenen: kabul edilir (regresyon yok, mevcut compliance report varsayımıyla tutarlı).

## Build/Test doğrulaması

```sh
npm run test
npm run build
```

Beklenen: mevcut testler regresyonsuz geçer, temiz build (bu spec'te yeni bir Vitest dosyası yok, mantık SQL'de).
