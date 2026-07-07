// One-off script: adds `shelters.map.*` i18n keys (spec 027 — shelter map
// display: layer toggle label + popup field labels) to all 7 locale files.
// Safe to re-run.
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const SHELTER_MAP = {
  tr: { toggleLabel: 'Sığınakları Göster/Gizle', occupancy: 'Doluluk', status: 'Durum', linkedIncident: 'İlgili bir olaya bağlı' },
  en: { toggleLabel: 'Show/Hide Shelters', occupancy: 'Occupancy', status: 'Status', linkedIncident: 'Linked to an incident' },
  es: { toggleLabel: 'Mostrar/Ocultar Refugios', occupancy: 'Ocupación', status: 'Estado', linkedIncident: 'Vinculado a un incidente' },
  fr: { toggleLabel: 'Afficher/Masquer les Abris', occupancy: 'Occupation', status: 'Statut', linkedIncident: 'Lié à un incident' },
  ru: { toggleLabel: 'Показать/Скрыть Убежища', occupancy: 'Заполненность', status: 'Статус', linkedIncident: 'Связано с инцидентом' },
  ar: { toggleLabel: 'إظهار/إخفاء الملاجئ', occupancy: 'الإشغال', status: 'الحالة', linkedIncident: 'مرتبط بحادثة' },
  zh: { toggleLabel: '显示/隐藏避难所', occupancy: '占用情况', status: '状态', linkedIncident: '已关联事件' },
};

for (const locale of Object.keys(SHELTER_MAP)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!json.shelters) throw new Error(`${locale}: missing shelters key`);
  json.shelters.map = SHELTER_MAP[locale];
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
