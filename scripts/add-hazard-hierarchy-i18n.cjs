// One-off script: adds `hazardTaxonomy.hierarchy` i18n keys (spec 024:
// parent-relationship UI + hazard encyclopedia page) to all 7 locale files.
// Safe to re-run (overwrites the same keys).
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const TRANSLATIONS = {
  tr: {
    parentColumn: 'Üst Tip', parentLabel: 'Üst Hazard Tipi', noParent: '(yok)',
    cycleError: 'Bu atama bir döngü oluşturur — geçersiz üst tip seçimi.',
    encyclopediaTitle: 'Afet Ansiklopedisi',
    partOf: '{name} türünün bir parçası', includes: 'İçerir: {names}',
    thresholdsTitle: 'Şiddet Eşikleri',
  },
  en: {
    parentColumn: 'Parent', parentLabel: 'Parent Hazard Type', noParent: '(none)',
    cycleError: 'This assignment would create a cycle — invalid parent selection.',
    encyclopediaTitle: 'Hazard Encyclopedia',
    partOf: 'Part of: {name}', includes: 'Includes: {names}',
    thresholdsTitle: 'Severity Thresholds',
  },
  es: {
    parentColumn: 'Padre', parentLabel: 'Tipo de Peligro Padre', noParent: '(ninguno)',
    cycleError: 'Esta asignación crearía un ciclo — selección de padre no válida.',
    encyclopediaTitle: 'Enciclopedia de Peligros',
    partOf: 'Parte de: {name}', includes: 'Incluye: {names}',
    thresholdsTitle: 'Umbrales de Severidad',
  },
  fr: {
    parentColumn: 'Parent', parentLabel: 'Type de danger parent', noParent: '(aucun)',
    cycleError: 'Cette affectation créerait un cycle — sélection de parent invalide.',
    encyclopediaTitle: 'Encyclopédie des dangers',
    partOf: 'Fait partie de : {name}', includes: 'Comprend : {names}',
    thresholdsTitle: 'Seuils de gravité',
  },
  ru: {
    parentColumn: 'Родитель', parentLabel: 'Родительский тип опасности', noParent: '(нет)',
    cycleError: 'Это назначение создаст цикл — недопустимый выбор родителя.',
    encyclopediaTitle: 'Энциклопедия опасностей',
    partOf: 'Часть: {name}', includes: 'Включает: {names}',
    thresholdsTitle: 'Пороги серьёзности',
  },
  ar: {
    parentColumn: 'الأصل', parentLabel: 'نوع الخطر الأصل', noParent: '(لا يوجد)',
    cycleError: 'سيؤدي هذا التعيين إلى إنشاء حلقة — اختيار أصل غير صالح.',
    encyclopediaTitle: 'موسوعة الأخطار',
    partOf: 'جزء من: {name}', includes: 'يشمل: {names}',
    thresholdsTitle: 'عتبات الشدة',
  },
  zh: {
    parentColumn: '父级', parentLabel: '父级灾害类型', noParent: '(无)',
    cycleError: '此分配将造成循环——父级选择无效。',
    encyclopediaTitle: '灾害百科',
    partOf: '属于：{name}', includes: '包含：{names}',
    thresholdsTitle: '严重程度阈值',
  },
};

for (const [locale, block] of Object.entries(TRANSLATIONS)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!json.hazardTaxonomy) throw new Error(`${locale}: missing hazardTaxonomy key`);
  json.hazardTaxonomy.hierarchy = block;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
