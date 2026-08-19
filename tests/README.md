# Test Documentation

Bu klasorde mevcut test kodlari ve kod degistirmeden hazirlanan test isterleri birlikte tutulur.

Mevcut otomasyon:

- `tests/unit`: Vitest unit testleri
- `tests/e2e/*.spec.js`: Playwright E2E/smoke testleri

Hazirlanan test isterleri:

- `tests/e2e/TEST_REQUIREMENTS.md`: E2E otomasyonuna cevrilecek test senaryolari
- `tests/manual/MANUAL_TEST_REQUIREMENTS.md`: Manuel kabul, gap ve release kontrol matrisi

Komutlar:

- `npm test`: unit testleri calistirir
- `npm run test:e2e`: Playwright testlerini calistirir
- `npm run test:e2e:ui`: Playwright UI modunu acar

Playwright testleri uygulama componentlerinin icine yazilmaz; ayri `.spec.js` dosyalarinda durur.
