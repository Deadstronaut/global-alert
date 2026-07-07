// One-off i18n injector for spec 033 (SOP Repository Versioning, Category &
// Search). Adds incidentTracking.sop* keys to all 7 locales, merging into
// the existing incidentTracking object.
const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales')

const STRINGS = {
  tr: {
    sopCategory: 'Kategori',
    sopSearchPlaceholder: 'Başlığa göre ara...',
    sopAllCategories: '— tüm kategoriler —',
    sopVersionHistory: 'geçmiş sürümler',
    sopVersionHistoryTitle: '"{title}" — Geçmiş Sürümler',
    sopNoVersionHistory: 'Henüz geçmiş sürüm yok.',
  },
  en: {
    sopCategory: 'Category',
    sopSearchPlaceholder: 'Search by title...',
    sopAllCategories: '— all categories —',
    sopVersionHistory: 'version history',
    sopVersionHistoryTitle: '"{title}" — Version History',
    sopNoVersionHistory: 'No previous versions yet.',
  },
  es: {
    sopCategory: 'Categoría',
    sopSearchPlaceholder: 'Buscar por título...',
    sopAllCategories: '— todas las categorías —',
    sopVersionHistory: 'historial de versiones',
    sopVersionHistoryTitle: '"{title}" — Historial de Versiones',
    sopNoVersionHistory: 'Aún no hay versiones anteriores.',
  },
  fr: {
    sopCategory: 'Catégorie',
    sopSearchPlaceholder: 'Rechercher par titre...',
    sopAllCategories: '— toutes les catégories —',
    sopVersionHistory: "historique des versions",
    sopVersionHistoryTitle: '"{title}" — Historique des Versions',
    sopNoVersionHistory: "Aucune version précédente pour l'instant.",
  },
  ru: {
    sopCategory: 'Категория',
    sopSearchPlaceholder: 'Поиск по названию...',
    sopAllCategories: '— все категории —',
    sopVersionHistory: 'история версий',
    sopVersionHistoryTitle: '"{title}" — История Версий',
    sopNoVersionHistory: 'Предыдущих версий пока нет.',
  },
  ar: {
    sopCategory: 'الفئة',
    sopSearchPlaceholder: 'البحث حسب العنوان...',
    sopAllCategories: '— جميع الفئات —',
    sopVersionHistory: 'سجل الإصدارات',
    sopVersionHistoryTitle: '"{title}" — سجل الإصدارات',
    sopNoVersionHistory: 'لا توجد إصدارات سابقة بعد.',
  },
  zh: {
    sopCategory: '分类',
    sopSearchPlaceholder: '按标题搜索...',
    sopAllCategories: '— 所有分类 —',
    sopVersionHistory: '版本历史',
    sopVersionHistoryTitle: '"{title}" — 版本历史',
    sopNoVersionHistory: '尚无历史版本。',
  },
}

for (const [locale, strings] of Object.entries(STRINGS)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!data.incidentTracking) data.incidentTracking = {}
  Object.assign(data.incidentTracking, strings)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`Updated ${locale}.json`)
}
