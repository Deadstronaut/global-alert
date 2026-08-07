# Hava / Okyanus / Kimyasal Katmanları Sözlüğü

Rüzgar & Akıntı panelindeki (FlowControlPanel.vue) her Mode, Animate ve Overlay kısaltmasının tanımı.

## Mode (Kip)

| Kısaltma | Tanım |
|---|---|
| Air | Atmosfer / hava katmanları |
| Ocean | Okyanus katmanları |
| Chem | Atmosferik kimyasal gazlar |
| Particulates | Havadaki partikül madde ve aerosoller |
| Space | Uzay hava durumu |
| Bio | Biyosfer (henüz aktif değil) |

## Animate (Hareketli Akış)

| Kısaltma | Tanım |
|---|---|
| Wind | Rüzgar — 10m yükseklikte hava hareketi (yön + hız) |
| Currents | Okyanus akıntıları — deniz yüzeyi su hareketi |
| Waves | Dalgalar — anlık dalga yönü/yüksekliği |

## Air — Overlay

| Kısaltma | Tanım |
|---|---|
| Temp | Sıcaklık (2m, °C) |
| RH | Bağıl nem (%) |
| Dew | Çiy noktası sıcaklığı (°C) |
| WBT | Yaş termometre sıcaklığı — nem+sıcaklığın birleşik etkisi (°C) |
| 3HPA | 3 saatlik toplam yağış (mm) |
| CAPE | Konvektif kullanılabilir potansiyel enerji — fırtına potansiyeli (J/kg) |
| TPW | Toplam yağabilir su — atmosferdeki toplam nem sütunu (mm) |
| TCW | Toplam bulut suyu (kg/m²) |
| MSLP | Deniz seviyesine indirgenmiş basınç (hPa) |
| MI | Sıkıntı indeksi (Misery Index) — hissedilen sıcaklık; sıcakta Heat Index, soğukta Rüzgar Soğukluğu |
| UVI | UV indeksi |
| WPD | Rüzgar güç yoğunluğu (W/m²) |

## Ocean — Overlay

| Kısaltma | Tanım |
|---|---|
| Currents | Akıntı hızı ısı haritası |
| Waves | Dalga hızı/yüksekliği ısı haritası |
| HTSGW | Belirgin dalga yüksekliği (m) |
| SST | Deniz yüzeyi sıcaklığı (°C) |
| BAA | Mercan ağarması uyarı alanı — ısı stresi seviyesi (0-8+) |
| SSTA | Deniz yüzeyi sıcaklık anomalisi — 1991-2020 ortalamasından sapma (°C) |

## Chem — Overlay

| Kısaltma | Tanım |
|---|---|
| COsc | Karbon monoksit, yüzey seviyesi (ppb) |
| CO2sc | Karbondioksit, yüzey seviyesi (ppm) |
| SO2sm | Kükürt dioksit (ppb) |
| NO2 | Azot dioksit (ppb) |

## Particulates — Overlay

| Kısaltma | Tanım |
|---|---|
| DUex | Toz aerosol optik derinliği (550nm) |
| PM1 | İnce partikül madde, çap < 1µm (µg/m³) |
| PM2.5 | İnce partikül madde, çap < 2.5µm (µg/m³) |
| PM10 | Kaba partikül madde, çap < 10µm (µg/m³) |
| OMaot | Organik madde aerosol optik derinliği (550nm) |
| SO4ex | Sülfat aerosol optik derinliği (550nm) |

## Space — Overlay

| Kısaltma | Tanım |
|---|---|
| Aurora | Kutup ışığı (aurora) görülme olasılığı |

## Height (Yükseklik / Basınç Seviyesi)

| Değer | Tanım |
|---|---|
| Sfc | Yüzey / yakın-yüzey (2m veya 10m) |
| 1000, 850, 700, 500, 250, 70, 10 | Basınç seviyesi (hPa / mb) — sadece Temp ve RH için geçerli |

## Forecast (15 Günlük Öngörü)

Rüzgar & Akıntı panelindeki "Forecast" satırı — mevcut Animate/Overlay'den bağımsız, GFS'in
15 güne kadar uzanan tahmin verisini gösterir (spec 055/056). Bir değişken seçilince altında
çıkan kaydırıcı, o değişkenin gerçekten kaç günü varsa o kadarını gösterir (çoğu değişken 8 gün/
~15 gün, UV Index sadece 5 gün — kaynağın kendi sınırı). Seçili günün texture'ı haritada, mevcut
Overlay katmanının yerine (ikisi aynı anda gösterilmez) render edilir.

| Kısaltma | Tanım |
|---|---|
| Wind | Rüzgar hızı öngörüsü (10m, m/s) — animasyonlu değil, statik ısı haritası |
| Precip | 6 saatlik birikimli yağış öngörüsü (mm) |
| Temp | Sıcaklık öngörüsü (2m, °C) |
| RH | Bağıl nem öngörüsü (%) |
| MSLP | Deniz seviyesine indirgenmiş basınç öngörüsü (hPa) |
| CAPE | Konvektif kullanılabilir potansiyel enerji öngörüsü — fırtına potansiyeli (J/kg) |
| TPW | Toplam yağabilir su öngörüsü (mm) |
| TCW | Toplam bulut suyu öngörüsü (kg/m²) |
| Dew | Çiy noktası sıcaklığı öngörüsü (°C) |
| WBT | Yaş termometre sıcaklığı öngörüsü (°C) |
| WPD | Rüzgar güç yoğunluğu öngörüsü (W/m²) |
| MI | Sıkıntı indeksi (Misery Index) öngörüsü — hissedilen sıcaklık (°C) |
| HTSGW | Belirgin dalga yüksekliği öngörüsü (m) |
| UVI | UV indeksi öngörüsü — yalnızca ilk 5 gün için veri var (kaynağın sınırı) |

**Not**: 1 ay / 3 ay ufukları (spec 055 US2/US3, CFSv2 kaynaklı) bu haritadaki Forecast satırında
DEĞİL — bunlar Dashboard'daki ayrı bir Forecast panelinde, bölge bazlı olasılıksal
(below/near/above normal) sınıflandırma olarak gösteriliyor, sayısal/görsel katman değil.
