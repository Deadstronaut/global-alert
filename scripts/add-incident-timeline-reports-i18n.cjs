// One-off script: adds `incidentTracking.timeline.*` and `audit.incidentReports.*`
// i18n keys (spec 026 — incident timeline playback + yearly incident reports)
// to all 7 locale files. Safe to re-run.
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const TIMELINE = {
  tr: { button: 'Zaman Çizelgesi', created: 'Oluşturuldu', statusChange: 'durum: {from} → {to}', updated: 'Güncellendi', loading: 'Yükleniyor...' },
  en: { button: 'Timeline', created: 'Created', statusChange: 'status: {from} → {to}', updated: 'Updated', loading: 'Loading...' },
  es: { button: 'Cronología', created: 'Creado', statusChange: 'estado: {from} → {to}', updated: 'Actualizado', loading: 'Cargando...' },
  fr: { button: 'Chronologie', created: 'Créé', statusChange: 'statut : {from} → {to}', updated: 'Mis à jour', loading: 'Chargement...' },
  ru: { button: 'Хронология', created: 'Создано', statusChange: 'статус: {from} → {to}', updated: 'Обновлено', loading: 'Загрузка...' },
  ar: { button: 'الجدول الزمني', created: 'تم الإنشاء', statusChange: 'الحالة: {from} ← {to}', updated: 'تم التحديث', loading: 'جارٍ التحميل...' },
  zh: { button: '时间线', created: '已创建', statusChange: '状态：{from} → {to}', updated: '已更新', loading: '加载中...' },
};

const INCIDENT_REPORTS = {
  tr: { title: 'Yıllık Olay Raporları', empty: 'Henüz otomatik olay raporu üretilmedi.', total: 'Toplam Olay', falseAlarmRate: 'Yanlış Alarm Oranı' },
  en: { title: 'Annual Incident Reports', empty: 'No automatic incident reports have been generated yet.', total: 'Total Incidents', falseAlarmRate: 'False Alarm Rate' },
  es: { title: 'Informes Anuales de Incidentes', empty: 'Aún no se han generado informes automáticos de incidentes.', total: 'Total de Incidentes', falseAlarmRate: 'Tasa de Falsas Alarmas' },
  fr: { title: "Rapports Annuels d'Incidents", empty: "Aucun rapport automatique d'incidents n'a encore été généré.", total: "Total d'Incidents", falseAlarmRate: 'Taux de Fausses Alertes' },
  ru: { title: 'Годовые отчёты об инцидентах', empty: 'Автоматические отчёты об инцидентах ещё не созданы.', total: 'Всего инцидентов', falseAlarmRate: 'Доля ложных тревог' },
  ar: { title: 'التقارير السنوية للحوادث', empty: 'لم يتم إنشاء أي تقارير تلقائية للحوادث بعد.', total: 'إجمالي الحوادث', falseAlarmRate: 'معدل الإنذارات الكاذبة' },
  zh: { title: '年度事件报告', empty: '尚未生成自动事件报告。', total: '事件总数', falseAlarmRate: '误报率' },
};

for (const locale of Object.keys(TIMELINE)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!json.incidentTracking) throw new Error(`${locale}: missing incidentTracking key`);
  if (!json.audit) throw new Error(`${locale}: missing audit key`);
  json.incidentTracking.timeline = TIMELINE[locale];
  json.audit.incidentReports = INCIDENT_REPORTS[locale];
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
