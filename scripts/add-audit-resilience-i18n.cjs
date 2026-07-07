// One-off script: adds `audit.deadLetter.*` i18n keys (spec 029 — audit log
// write-failure resilience) to all 7 locale files. Safe to re-run.
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const DEAD_LETTER = {
  tr: { title: 'Bekleyen Denetim Kayıtları', empty: 'Bekleyen kayıt yok.', count: '{count} kayıt yeniden denemeyi bekliyor.', retry: 'Tekrar Dene', result: '{succeeded} başarılı, {failed} başarısız.' },
  en: { title: 'Pending Audit Entries', empty: 'No pending entries.', count: '{count} entries awaiting retry.', retry: 'Retry', result: '{succeeded} succeeded, {failed} failed.' },
  es: { title: 'Entradas de Auditoría Pendientes', empty: 'No hay entradas pendientes.', count: '{count} entradas esperando reintento.', retry: 'Reintentar', result: '{succeeded} exitosas, {failed} fallidas.' },
  fr: { title: "Entrées d'Audit en Attente", empty: 'Aucune entrée en attente.', count: '{count} entrées en attente de nouvelle tentative.', retry: 'Réessayer', result: '{succeeded} réussies, {failed} échouées.' },
  ru: { title: 'Ожидающие записи аудита', empty: 'Нет ожидающих записей.', count: '{count} записей ожидают повтора.', retry: 'Повторить', result: 'Успешно: {succeeded}, неудачно: {failed}.' },
  ar: { title: 'سجلات التدقيق المعلقة', empty: 'لا توجد سجلات معلقة.', count: '{count} سجلات في انتظار إعادة المحاولة.', retry: 'إعادة المحاولة', result: 'نجح {succeeded}، فشل {failed}.' },
  zh: { title: '待处理审计记录', empty: '没有待处理的记录。', count: '{count} 条记录等待重试。', retry: '重试', result: '成功 {succeeded} 条，失败 {failed} 条。' },
};

for (const locale of Object.keys(DEAD_LETTER)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!json.audit) throw new Error(`${locale}: missing audit key`);
  json.audit.deadLetter = DEAD_LETTER[locale];
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
