// One-off script: adds the `whatsappIntegration` i18n key block (spec 022)
// to all 7 locale files. Run once; safe to re-run (overwrites the same keys).
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const blocks = {
  en: {
    tabLabel: 'WhatsApp Integration', countryCodePlaceholder: 'XX',
    selectCountryHint: 'Enter a 2-letter country code to manage its WhatsApp integration.',
    configured: 'Configured (last updated: {date})', notConfigured: 'Not configured',
    accessToken: 'Access Token', phoneNumberId: 'Phone Number ID', webhookVerifyToken: 'Webhook Verify Token',
    save: 'Save', saveSuccess: 'Credentials saved.', noCountry: 'Country is required.',
    allFieldsRequired: 'All three fields are required.',
  },
  tr: {
    tabLabel: 'WhatsApp Entegrasyonu', countryCodePlaceholder: 'XX',
    selectCountryHint: 'Entegrasyonu yönetmek için 2 harfli bir ülke kodu girin.',
    configured: 'Yapılandırılmış (son güncelleme: {date})', notConfigured: 'Yapılandırılmamış',
    accessToken: 'Erişim Token\'ı', phoneNumberId: 'Telefon Numarası ID', webhookVerifyToken: 'Webhook Doğrulama Token\'ı',
    save: 'Kaydet', saveSuccess: 'Kimlik bilgileri kaydedildi.', noCountry: 'Ülke zorunludur.',
    allFieldsRequired: 'Her üç alan da zorunludur.',
  },
  es: {
    tabLabel: 'Integración de WhatsApp', countryCodePlaceholder: 'XX',
    selectCountryHint: 'Introduzca un código de país de 2 letras para gestionar su integración.',
    configured: 'Configurado (última actualización: {date})', notConfigured: 'No configurado',
    accessToken: 'Token de Acceso', phoneNumberId: 'ID de Número de Teléfono', webhookVerifyToken: 'Token de Verificación de Webhook',
    save: 'Guardar', saveSuccess: 'Credenciales guardadas.', noCountry: 'El país es obligatorio.',
    allFieldsRequired: 'Los tres campos son obligatorios.',
  },
  fr: {
    tabLabel: 'Intégration WhatsApp', countryCodePlaceholder: 'XX',
    selectCountryHint: 'Saisissez un code pays à 2 lettres pour gérer son intégration.',
    configured: 'Configuré (dernière mise à jour : {date})', notConfigured: 'Non configuré',
    accessToken: "Jeton d'Accès", phoneNumberId: 'ID de Numéro de Téléphone', webhookVerifyToken: 'Jeton de Vérification Webhook',
    save: 'Enregistrer', saveSuccess: 'Identifiants enregistrés.', noCountry: 'Le pays est requis.',
    allFieldsRequired: 'Les trois champs sont obligatoires.',
  },
  ru: {
    tabLabel: 'Интеграция WhatsApp', countryCodePlaceholder: 'XX',
    selectCountryHint: 'Введите 2-буквенный код страны для управления интеграцией.',
    configured: 'Настроено (последнее обновление: {date})', notConfigured: 'Не настроено',
    accessToken: 'Токен Доступа', phoneNumberId: 'ID Номера Телефона', webhookVerifyToken: 'Токен Проверки Webhook',
    save: 'Сохранить', saveSuccess: 'Учётные данные сохранены.', noCountry: 'Страна обязательна.',
    allFieldsRequired: 'Все три поля обязательны.',
  },
  ar: {
    tabLabel: 'تكامل واتساب', countryCodePlaceholder: 'XX',
    selectCountryHint: 'أدخل رمز دولة مكوّن من حرفين لإدارة التكامل.',
    configured: 'تم الإعداد (آخر تحديث: {date})', notConfigured: 'غير معد',
    accessToken: 'رمز الوصول', phoneNumberId: 'معرف رقم الهاتف', webhookVerifyToken: 'رمز التحقق من Webhook',
    save: 'حفظ', saveSuccess: 'تم حفظ بيانات الاعتماد.', noCountry: 'الدولة مطلوبة.',
    allFieldsRequired: 'الحقول الثلاثة جميعها مطلوبة.',
  },
  zh: {
    tabLabel: 'WhatsApp 集成', countryCodePlaceholder: 'XX',
    selectCountryHint: '输入两位国家代码以管理其集成设置。',
    configured: '已配置（最后更新：{date}）', notConfigured: '未配置',
    accessToken: '访问令牌', phoneNumberId: '电话号码 ID', webhookVerifyToken: 'Webhook 验证令牌',
    save: '保存', saveSuccess: '凭据已保存。', noCountry: '国家为必填项。',
    allFieldsRequired: '三个字段均为必填项。',
  },
};

for (const [locale, block] of Object.entries(blocks)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  json.whatsappIntegration = block;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
