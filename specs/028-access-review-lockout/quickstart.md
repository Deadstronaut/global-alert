# Quickstart: Erişim İnceleme Raporu ve Hesap Kilitleme

Ön koşul: migration uygulanmış (`npx supabase db push --linked`), en az 2 test kullanıcı hesabı (biri super_admin, biri değil).

## Senaryo 1: Erişim İnceleme Raporu görüntüleme (US1, FR-001, FR-002)

1. Super_admin hesabıyla giriş yap, AdminView → Kullanıcılar tabına git.
2. Beklenen: her kullanıcı için e-posta, rol, ülke/org, yetkiler, son giriş, aktif/askıya-alınmış durumu görünür.
3. Super_admin olmayan bir hesapla giriş yap: bu görünüme erişilemez (route/tab guard veya RPC exception).

## Senaryo 2: Dışa aktarma (US1, FR-003)

1. Kullanıcılar tabındaki "Dışa Aktar" butonuna tıkla.
2. Beklenen: CSV veya JSON dosyası iner, tüm kullanıcı satırlarını içerir.

## Senaryo 3: Başarısız giriş denemeleri hesabı kilitler (US2, FR-004, FR-005)

1. Bir test hesabına 5 kez yanlış şifre gir.
2. Beklenen: 5. denemeden sonra (veya hemen sonraki denemede) hesap kilitlenir.
3. Doğru şifreyle tekrar dene: giriş reddedilir, "hesabınız geçici olarak kilitli" mesajı görünür.

## Senaryo 4: Kilit süresi dolunca otomatik açılma (US2, FR-006, FR-008)

1. 15 dakika bekle (veya test için DB'de `locked_until`'i geçmişe çek).
2. Doğru şifreyle giriş dene: başarılı olur, sayaç sıfırlanır.

## Senaryo 5: Manuel kilit açma (US2, FR-007)

1. Kilitli bir hesap varken, başka bir super_admin hesabıyla giriş yap.
2. Kullanıcılar tabında kilitli satırdaki "Kilidi Aç" butonuna tıkla.
3. Beklenen: hesap süre dolmadan hemen kullanılabilir hale gelir.

## Senaryo 6: Hesap var/yok bilgisi ifşa edilmiyor (Edge Case)

1. Var olmayan bir e-posta ile birden fazla kez yanlış giriş dene.
2. Beklenen: hata mesajı, gerçek bir hesaba yanlış şifre girmekle aynı (ayırt edilemez), sistemde hata/exception oluşmaz.

## Build/Test doğrulaması

```sh
npm run test
npm run build
```

Beklenen: mevcut testler regresyonsuz geçer, temiz build.
