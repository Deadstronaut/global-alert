// One-off script: adds the contacts/dispatch/portal i18n key blocks (spec 009)
// to all 7 locale files. Run once; safe to re-run (overwrites the same keys).
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const blocks = {
  en: {
    contacts: {
      tabLabel: 'Contact Directory', addButton: '+ Add Contact', editTitle: 'Edit Contact', createTitle: 'Add Contact',
      fullName: 'Full Name', email: 'Email', whatsapp: 'WhatsApp Number', language: 'Language', hazardFilter: 'Hazard Type Filter',
      allHazards: '— all —', country: 'Country', region: 'Region Code', emailOptIn: 'Allow email dispatch', whatsappOptIn: 'Allow WhatsApp dispatch',
      save: 'Save', cancel: 'Cancel', edit: 'edit', deactivate: 'deactivate', reactivate: 'reactivate', active: 'Active', inactive: 'Inactive',
      empty: 'No contacts yet.', duplicateError: 'A contact with this email already exists in this country.',
      atLeastOneChannel: 'At least one channel (email or WhatsApp) is required.', invalidWhatsapp: 'WhatsApp number must be in E.164 format (e.g. +15551234567).',
      noCountry: 'No country selected.', importTitle: 'Bulk Import (CSV)', importFile: 'File * (CSV, JSON or Excel — SQL not supported)',
      importing: 'Importing...', importButton: '📥 Import', channels: 'Channels',
    },
    dispatch: {
      panelTitle: 'Dispatch Monitor', alertColumn: 'Alert', countryColumn: 'Country', statusColumn: 'Status', matchedColumn: 'Matched Contacts',
      summaryColumn: 'Delivery Summary', retryButton: 'Retry', retrying: 'retrying...', empty: 'No dispatch jobs yet.',
      statusQueued: 'queued', statusRunning: 'running', statusCompleted: 'completed', statusFailed: 'failed',
    },
    portal: { title: '🌍 GEWS — Active Alerts', subtitle: 'Public Alert Portal', empty: 'There are no active alerts right now.', issuedLabel: 'Issued', expiresLabel: 'Expires' },
  },
  tr: {
    contacts: {
      tabLabel: 'İletişim Rehberi', addButton: '+ Kişi Ekle', editTitle: 'Kişiyi Düzenle', createTitle: 'Yeni Kişi Ekle',
      fullName: 'Ad Soyad', email: 'E-posta', whatsapp: 'WhatsApp Numarası', language: 'Dil', hazardFilter: 'Afet Tipi Filtresi',
      allHazards: '— tümü —', country: 'Ülke', region: 'Bölge Kodu', emailOptIn: 'E-posta gönderimine izin ver', whatsappOptIn: 'WhatsApp gönderimine izin ver',
      save: 'Kaydet', cancel: 'İptal', edit: 'düzenle', deactivate: 'deaktive et', reactivate: 'aktive et', active: 'Aktif', inactive: 'Pasif',
      empty: 'Henüz kişi eklenmedi.', duplicateError: 'Bu e-posta ile bu ülkede zaten bir kişi kayıtlı.',
      atLeastOneChannel: 'En az bir kanal (e-posta veya WhatsApp) gereklidir.', invalidWhatsapp: 'WhatsApp numarası E.164 formatında olmalı (örn. +905551234567).',
      noCountry: 'Ülke seçilmedi.', importTitle: 'Toplu İçe Aktarma (CSV)', importFile: 'Dosya * (CSV, JSON veya Excel — SQL desteklenmiyor)',
      importing: 'İçe aktarılıyor...', importButton: '📥 İçe Aktar', channels: 'Kanallar',
    },
    dispatch: {
      panelTitle: 'Dispatch İzleme', alertColumn: 'Alert', countryColumn: 'Ülke', statusColumn: 'Durum', matchedColumn: 'Eşleşen Kişi',
      summaryColumn: 'Gönderim Özeti', retryButton: 'Yeniden Dene', retrying: 'yeniden deneniyor...', empty: 'Henüz dispatch kaydı yok.',
      statusQueued: 'sırada', statusRunning: 'çalışıyor', statusCompleted: 'tamamlandı', statusFailed: 'başarısız',
    },
    portal: { title: '🌍 GEWS — Aktif Uyarılar', subtitle: 'Public Alert Portal', empty: 'Şu anda aktif bir uyarı yok.', issuedLabel: 'Yayın', expiresLabel: 'Geçerlilik' },
  },
  es: {
    contacts: {
      tabLabel: 'Directorio de Contactos', addButton: '+ Añadir Contacto', editTitle: 'Editar Contacto', createTitle: 'Añadir Contacto',
      fullName: 'Nombre Completo', email: 'Correo Electrónico', whatsapp: 'Número de WhatsApp', language: 'Idioma', hazardFilter: 'Filtro de Tipo de Peligro',
      allHazards: '— todos —', country: 'País', region: 'Código de Región', emailOptIn: 'Permitir envío por correo', whatsappOptIn: 'Permitir envío por WhatsApp',
      save: 'Guardar', cancel: 'Cancelar', edit: 'editar', deactivate: 'desactivar', reactivate: 'reactivar', active: 'Activo', inactive: 'Inactivo',
      empty: 'Aún no hay contactos.', duplicateError: 'Ya existe un contacto con este correo en este país.',
      atLeastOneChannel: 'Se requiere al menos un canal (correo o WhatsApp).', invalidWhatsapp: 'El número de WhatsApp debe tener formato E.164 (ej. +15551234567).',
      noCountry: 'No se seleccionó país.', importTitle: 'Importación Masiva (CSV)', importFile: 'Archivo * (CSV, JSON o Excel — SQL no soportado)',
      importing: 'Importando...', importButton: '📥 Importar', channels: 'Canales',
    },
    dispatch: {
      panelTitle: 'Monitor de Envíos', alertColumn: 'Alerta', countryColumn: 'País', statusColumn: 'Estado', matchedColumn: 'Contactos Coincidentes',
      summaryColumn: 'Resumen de Entrega', retryButton: 'Reintentar', retrying: 'reintentando...', empty: 'Aún no hay envíos.',
      statusQueued: 'en cola', statusRunning: 'en curso', statusCompleted: 'completado', statusFailed: 'fallido',
    },
    portal: { title: '🌍 GEWS — Alertas Activas', subtitle: 'Portal Público de Alertas', empty: 'No hay alertas activas en este momento.', issuedLabel: 'Emitido', expiresLabel: 'Expira' },
  },
  fr: {
    contacts: {
      tabLabel: 'Répertoire des Contacts', addButton: '+ Ajouter un Contact', editTitle: 'Modifier le Contact', createTitle: 'Ajouter un Contact',
      fullName: 'Nom Complet', email: 'E-mail', whatsapp: 'Numéro WhatsApp', language: 'Langue', hazardFilter: 'Filtre de Type de Danger',
      allHazards: '— tous —', country: 'Pays', region: 'Code Région', emailOptIn: "Autoriser l'envoi par e-mail", whatsappOptIn: "Autoriser l'envoi par WhatsApp",
      save: 'Enregistrer', cancel: 'Annuler', edit: 'modifier', deactivate: 'désactiver', reactivate: 'réactiver', active: 'Actif', inactive: 'Inactif',
      empty: 'Aucun contact pour le moment.', duplicateError: 'Un contact avec cet e-mail existe déjà dans ce pays.',
      atLeastOneChannel: 'Au moins un canal (e-mail ou WhatsApp) est requis.', invalidWhatsapp: 'Le numéro WhatsApp doit être au format E.164 (ex. +15551234567).',
      noCountry: 'Aucun pays sélectionné.', importTitle: 'Importation en Masse (CSV)', importFile: 'Fichier * (CSV, JSON ou Excel — SQL non pris en charge)',
      importing: 'Importation...', importButton: '📥 Importer', channels: 'Canaux',
    },
    dispatch: {
      panelTitle: 'Suivi des Envois', alertColumn: 'Alerte', countryColumn: 'Pays', statusColumn: 'Statut', matchedColumn: 'Contacts Correspondants',
      summaryColumn: 'Résumé de Livraison', retryButton: 'Réessayer', retrying: 'nouvelle tentative...', empty: "Aucun envoi pour le moment.",
      statusQueued: 'en attente', statusRunning: 'en cours', statusCompleted: 'terminé', statusFailed: 'échoué',
    },
    portal: { title: '🌍 GEWS — Alertes Actives', subtitle: "Portail Public d'Alertes", empty: "Il n'y a aucune alerte active pour le moment.", issuedLabel: 'Émise', expiresLabel: 'Expire' },
  },
  ru: {
    contacts: {
      tabLabel: 'Справочник Контактов', addButton: '+ Добавить Контакт', editTitle: 'Редактировать Контакт', createTitle: 'Добавить Контакт',
      fullName: 'Полное Имя', email: 'Эл. почта', whatsapp: 'Номер WhatsApp', language: 'Язык', hazardFilter: 'Фильтр по Типу Угрозы',
      allHazards: '— все —', country: 'Страна', region: 'Код Региона', emailOptIn: 'Разрешить рассылку по эл. почте', whatsappOptIn: 'Разрешить рассылку через WhatsApp',
      save: 'Сохранить', cancel: 'Отмена', edit: 'редактировать', deactivate: 'деактивировать', reactivate: 'активировать', active: 'Активен', inactive: 'Неактивен',
      empty: 'Контактов пока нет.', duplicateError: 'Контакт с этой эл. почтой уже существует в этой стране.',
      atLeastOneChannel: 'Требуется хотя бы один канал (эл. почта или WhatsApp).', invalidWhatsapp: 'Номер WhatsApp должен быть в формате E.164 (напр. +15551234567).',
      noCountry: 'Страна не выбрана.', importTitle: 'Массовый Импорт (CSV)', importFile: 'Файл * (CSV, JSON или Excel — SQL не поддерживается)',
      importing: 'Импорт...', importButton: '📥 Импортировать', channels: 'Каналы',
    },
    dispatch: {
      panelTitle: 'Мониторинг Рассылки', alertColumn: 'Оповещение', countryColumn: 'Страна', statusColumn: 'Статус', matchedColumn: 'Совпавшие Контакты',
      summaryColumn: 'Сводка Доставки', retryButton: 'Повторить', retrying: 'повтор...', empty: 'Рассылок пока нет.',
      statusQueued: 'в очереди', statusRunning: 'выполняется', statusCompleted: 'завершено', statusFailed: 'ошибка',
    },
    portal: { title: '🌍 GEWS — Активные Оповещения', subtitle: 'Публичный Портал Оповещений', empty: 'Сейчас нет активных оповещений.', issuedLabel: 'Выпущено', expiresLabel: 'Истекает' },
  },
  ar: {
    contacts: {
      tabLabel: 'دليل جهات الاتصال', addButton: '+ إضافة جهة اتصال', editTitle: 'تعديل جهة الاتصال', createTitle: 'إضافة جهة اتصال',
      fullName: 'الاسم الكامل', email: 'البريد الإلكتروني', whatsapp: 'رقم واتساب', language: 'اللغة', hazardFilter: 'تصفية نوع الخطر',
      allHazards: '— الكل —', country: 'الدولة', region: 'رمز المنطقة', emailOptIn: 'السماح بالإرسال عبر البريد الإلكتروني', whatsappOptIn: 'السماح بالإرسال عبر واتساب',
      save: 'حفظ', cancel: 'إلغاء', edit: 'تعديل', deactivate: 'إلغاء التفعيل', reactivate: 'إعادة التفعيل', active: 'نشط', inactive: 'غير نشط',
      empty: 'لا توجد جهات اتصال بعد.', duplicateError: 'توجد جهة اتصال بهذا البريد الإلكتروني بالفعل في هذه الدولة.',
      atLeastOneChannel: 'يلزم قناة واحدة على الأقل (بريد إلكتروني أو واتساب).', invalidWhatsapp: 'يجب أن يكون رقم واتساب بصيغة E.164 (مثال: +15551234567).',
      noCountry: 'لم يتم اختيار دولة.', importTitle: 'استيراد جماعي (CSV)', importFile: 'ملف * (CSV أو JSON أو Excel — SQL غير مدعوم)',
      importing: 'جارٍ الاستيراد...', importButton: '📥 استيراد', channels: 'القنوات',
    },
    dispatch: {
      panelTitle: 'مراقبة الإرسال', alertColumn: 'التنبيه', countryColumn: 'الدولة', statusColumn: 'الحالة', matchedColumn: 'جهات الاتصال المطابقة',
      summaryColumn: 'ملخص التسليم', retryButton: 'إعادة المحاولة', retrying: 'جارٍ إعادة المحاولة...', empty: 'لا توجد عمليات إرسال بعد.',
      statusQueued: 'في الانتظار', statusRunning: 'قيد التنفيذ', statusCompleted: 'مكتمل', statusFailed: 'فشل',
    },
    portal: { title: '🌍 GEWS — التنبيهات النشطة', subtitle: 'بوابة التنبيهات العامة', empty: 'لا توجد تنبيهات نشطة حاليًا.', issuedLabel: 'تاريخ الإصدار', expiresLabel: 'تاريخ الانتهاء' },
  },
  zh: {
    contacts: {
      tabLabel: '联系人目录', addButton: '+ 添加联系人', editTitle: '编辑联系人', createTitle: '添加联系人',
      fullName: '姓名', email: '电子邮件', whatsapp: 'WhatsApp 号码', language: '语言', hazardFilter: '灾害类型筛选',
      allHazards: '— 全部 —', country: '国家', region: '地区代码', emailOptIn: '允许通过电子邮件发送', whatsappOptIn: '允许通过 WhatsApp 发送',
      save: '保存', cancel: '取消', edit: '编辑', deactivate: '停用', reactivate: '启用', active: '已启用', inactive: '已停用',
      empty: '尚无联系人。', duplicateError: '该国家/地区已存在使用此电子邮件的联系人。',
      atLeastOneChannel: '至少需要一个渠道（电子邮件或 WhatsApp）。', invalidWhatsapp: 'WhatsApp 号码必须为 E.164 格式（例如 +15551234567）。',
      noCountry: '未选择国家。', importTitle: '批量导入（CSV）', importFile: '文件 *（CSV、JSON 或 Excel — 不支持 SQL）',
      importing: '正在导入...', importButton: '📥 导入', channels: '渠道',
    },
    dispatch: {
      panelTitle: '发送监控', alertColumn: '警报', countryColumn: '国家', statusColumn: '状态', matchedColumn: '匹配联系人',
      summaryColumn: '发送摘要', retryButton: '重试', retrying: '重试中...', empty: '尚无发送记录。',
      statusQueued: '排队中', statusRunning: '进行中', statusCompleted: '已完成', statusFailed: '失败',
    },
    portal: { title: '🌍 GEWS — 当前警报', subtitle: '公共警报门户', empty: '目前没有活动警报。', issuedLabel: '发布时间', expiresLabel: '到期时间' },
  },
};

for (const [locale, block] of Object.entries(blocks)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  json.contacts = block.contacts;
  json.dispatch = block.dispatch;
  json.portal = block.portal;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
