// One-off i18n injector for spec 019 (Scheduled Compliance Reports). Adds
// audit.reports.* (title, empty state, integrity labels) to all 7 locales.
const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales')

const STRINGS = {
  tr: {
    title: 'Geçmiş Raporlar',
    empty: 'Henüz otomatik rapor üretilmedi.',
    integrity: 'Bütünlük',
    intact: 'Sağlam',
    broken: 'Sorun bulundu',
  },
  en: {
    title: 'Past Reports',
    empty: 'No automatic reports have been generated yet.',
    integrity: 'Integrity',
    intact: 'Intact',
    broken: 'Issue found',
  },
  es: {
    title: 'Informes Anteriores',
    empty: 'Aún no se han generado informes automáticos.',
    integrity: 'Integridad',
    intact: 'Intacta',
    broken: 'Problema encontrado',
  },
  fr: {
    title: 'Rapports Précédents',
    empty: "Aucun rapport automatique n'a encore été généré.",
    integrity: 'Intégrité',
    intact: 'Intacte',
    broken: 'Problème détecté',
  },
  ru: {
    title: 'Прошлые Отчёты',
    empty: 'Автоматические отчёты ещё не создавались.',
    integrity: 'Целостность',
    intact: 'Не нарушена',
    broken: 'Обнаружена проблема',
  },
  ar: {
    title: 'التقارير السابقة',
    empty: 'لم يتم إنشاء أي تقارير تلقائية بعد.',
    integrity: 'السلامة',
    intact: 'سليمة',
    broken: 'تم العثور على مشكلة',
  },
  zh: {
    title: '历史报告',
    empty: '尚未生成自动报告。',
    integrity: '完整性',
    intact: '完好',
    broken: '发现问题',
  },
}

for (const [locale, strings] of Object.entries(STRINGS)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!data.audit) data.audit = {}
  data.audit.reports = strings
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`Updated ${locale}.json`)
}
