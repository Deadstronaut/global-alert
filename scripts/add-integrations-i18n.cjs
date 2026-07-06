// One-off script: replaces the `whatsappIntegration` i18n key block (spec
// 022) with a generalized `integrations` key block (spec 025 — registry-driven
// integration credential management) in all 7 locale files. Safe to re-run.
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const TRANSLATIONS = {
  tr: {
    tabLabel: 'Entegrasyonlar', countryCodePlaceholder: 'XX',
    selectCountryHint: 'Entegrasyonları yönetmek için 2 harfli bir ülke kodu girin.',
    typeLabel: 'Entegrasyon Türü', selectType: 'Bir tür seçin',
    configured: 'Yapılandırılmış (son güncelleme: {date})', notConfigured: 'Yapılandırılmamış',
    configuredFields: 'Yapılandırılmış alanlar: {fields}',
    addCustomField: '+ Özel alan ekle', customFieldName: 'Alan adı', customFieldValue: 'Değer',
    save: 'Kaydet', saveSuccess: 'Kimlik bilgileri kaydedildi.',
    noCountry: 'Ülke zorunludur.', noType: 'Entegrasyon türü zorunludur.',
    allFieldsRequired: 'Tüm alanlar zorunludur.',
    customFieldIncomplete: 'Özel alanın hem adı hem değeri dolu olmalıdır.',
  },
  en: {
    tabLabel: 'Integrations', countryCodePlaceholder: 'XX',
    selectCountryHint: 'Enter a 2-letter country code to manage its integrations.',
    typeLabel: 'Integration Type', selectType: 'Select a type',
    configured: 'Configured (last updated: {date})', notConfigured: 'Not configured',
    configuredFields: 'Configured fields: {fields}',
    addCustomField: '+ Add custom field', customFieldName: 'Field name', customFieldValue: 'Value',
    save: 'Save', saveSuccess: 'Credentials saved.',
    noCountry: 'Country is required.', noType: 'Integration type is required.',
    allFieldsRequired: 'All fields are required.',
    customFieldIncomplete: 'A custom field must have both a name and a value.',
  },
  es: {
    tabLabel: 'Integraciones', countryCodePlaceholder: 'XX',
    selectCountryHint: 'Introduzca un código de país de 2 letras para gestionar sus integraciones.',
    typeLabel: 'Tipo de Integración', selectType: 'Seleccione un tipo',
    configured: 'Configurado (última actualización: {date})', notConfigured: 'No configurado',
    configuredFields: 'Campos configurados: {fields}',
    addCustomField: '+ Añadir campo personalizado', customFieldName: 'Nombre del campo', customFieldValue: 'Valor',
    save: 'Guardar', saveSuccess: 'Credenciales guardadas.',
    noCountry: 'El país es obligatorio.', noType: 'El tipo de integración es obligatorio.',
    allFieldsRequired: 'Todos los campos son obligatorios.',
    customFieldIncomplete: 'Un campo personalizado debe tener nombre y valor.',
  },
  fr: {
    tabLabel: 'Intégrations', countryCodePlaceholder: 'XX',
    selectCountryHint: 'Saisissez un code pays à 2 lettres pour gérer ses intégrations.',
    typeLabel: "Type d'Intégration", selectType: 'Sélectionnez un type',
    configured: 'Configuré (dernière mise à jour : {date})', notConfigured: 'Non configuré',
    configuredFields: 'Champs configurés : {fields}',
    addCustomField: '+ Ajouter un champ personnalisé', customFieldName: 'Nom du champ', customFieldValue: 'Valeur',
    save: 'Enregistrer', saveSuccess: 'Identifiants enregistrés.',
    noCountry: 'Le pays est requis.', noType: "Le type d'intégration est requis.",
    allFieldsRequired: 'Tous les champs sont obligatoires.',
    customFieldIncomplete: 'Un champ personnalisé doit avoir un nom et une valeur.',
  },
  ru: {
    tabLabel: 'Интеграции', countryCodePlaceholder: 'XX',
    selectCountryHint: 'Введите 2-буквенный код страны для управления интеграциями.',
    typeLabel: 'Тип интеграции', selectType: 'Выберите тип',
    configured: 'Настроено (последнее обновление: {date})', notConfigured: 'Не настроено',
    configuredFields: 'Настроенные поля: {fields}',
    addCustomField: '+ Добавить пользовательское поле', customFieldName: 'Имя поля', customFieldValue: 'Значение',
    save: 'Сохранить', saveSuccess: 'Учётные данные сохранены.',
    noCountry: 'Страна обязательна.', noType: 'Тип интеграции обязателен.',
    allFieldsRequired: 'Все поля обязательны.',
    customFieldIncomplete: 'У пользовательского поля должны быть заполнены и имя, и значение.',
  },
  ar: {
    tabLabel: 'التكاملات', countryCodePlaceholder: 'XX',
    selectCountryHint: 'أدخل رمز دولة مكوّن من حرفين لإدارة تكاملاتها.',
    typeLabel: 'نوع التكامل', selectType: 'اختر نوعًا',
    configured: 'تم الإعداد (آخر تحديث: {date})', notConfigured: 'غير معد',
    configuredFields: 'الحقول المُعدة: {fields}',
    addCustomField: '+ إضافة حقل مخصص', customFieldName: 'اسم الحقل', customFieldValue: 'القيمة',
    save: 'حفظ', saveSuccess: 'تم حفظ بيانات الاعتماد.',
    noCountry: 'الدولة مطلوبة.', noType: 'نوع التكامل مطلوب.',
    allFieldsRequired: 'جميع الحقول مطلوبة.',
    customFieldIncomplete: 'يجب أن يحتوي الحقل المخصص على اسم وقيمة معًا.',
  },
  zh: {
    tabLabel: '集成', countryCodePlaceholder: 'XX',
    selectCountryHint: '输入两位国家代码以管理其集成设置。',
    typeLabel: '集成类型', selectType: '选择类型',
    configured: '已配置（最后更新：{date}）', notConfigured: '未配置',
    configuredFields: '已配置字段：{fields}',
    addCustomField: '+ 添加自定义字段', customFieldName: '字段名称', customFieldValue: '值',
    save: '保存', saveSuccess: '凭据已保存。',
    noCountry: '国家为必填项。', noType: '集成类型为必填项。',
    allFieldsRequired: '所有字段均为必填项。',
    customFieldIncomplete: '自定义字段必须同时填写名称和值。',
  },
};

for (const [locale, block] of Object.entries(TRANSLATIONS)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  delete json.whatsappIntegration;
  json.integrations = block;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
