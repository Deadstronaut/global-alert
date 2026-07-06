// One-off i18n injector for spec 015 (Region-Scoped Dissemination Targeting).
// Adds cap.form.regionCode / cap.form.regionCodePlaceholder right after
// cap.form.areaPlaceholder in all 7 locales.
const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales')

const STRINGS = {
  tr: { label: 'Bölge (opsiyonel)', placeholder: 'İstanbul, Kadıköy...' },
  en: { label: 'Region (optional)', placeholder: 'Istanbul, Kadikoy...' },
  es: { label: 'Región (opcional)', placeholder: 'Estambul, Kadıköy...' },
  fr: { label: 'Région (optionnel)', placeholder: 'Istanbul, Kadıköy...' },
  ru: { label: 'Регион (необязательно)', placeholder: 'Стамбул, Кадыкёй...' },
  ar: { label: 'المنطقة (اختياري)', placeholder: 'إسطنبول، قاضي كوي...' },
  zh: { label: '地区（可选）', placeholder: '伊斯坦布尔，卡德柯伊...' },
}

for (const [locale, strings] of Object.entries(STRINGS)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!data.cap || !data.cap.form) {
    console.error(`Missing cap.form in ${locale}.json`)
    continue
  }
  data.cap.form.regionCode = strings.label
  data.cap.form.regionCodePlaceholder = strings.placeholder
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`Updated ${locale}.json`)
}
