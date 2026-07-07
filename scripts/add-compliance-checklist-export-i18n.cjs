// One-off i18n injector for spec 030 (Compliance Checklist Export). Adds
// audit.reports.checklistExport to all 7 locales, merging into the existing
// audit.reports object (does not overwrite title/empty/integrity/etc.).
const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales')

const STRINGS = {
  tr: 'Kontrol Listesi',
  en: 'Checklist',
  es: 'Lista de Verificación',
  fr: 'Liste de Contrôle',
  ru: 'Контрольный Список',
  ar: 'قائمة التحقق',
  zh: '检查清单',
}

for (const [locale, checklistExport] of Object.entries(STRINGS)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!data.audit) data.audit = {}
  if (!data.audit.reports) data.audit.reports = {}
  data.audit.reports.checklistExport = checklistExport
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`Updated ${locale}.json`)
}
