// One-off script: adds the hazardTaxonomy.overrideFor / hazardTaxonomy.overrides
// i18n keys (spec 020, country-scoped threshold overrides) to all 7 locale
// files, merging into the existing hazardTaxonomy block. Safe to re-run.
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const blocks = {
  en: {
    overrideFor: 'Country override ({country})',
    overrides: {
      sectionTitle: 'Country Overrides', selectCountry: 'Select country', countryCodePlaceholder: 'XX',
      selectCountryHint: 'Enter a 2-letter country code to manage its overrides.',
      hasOverride: 'Override', yes: 'Yes', no: 'No', add: 'add', edit: 'edit', remove: 'remove',
    },
  },
  tr: {
    overrideFor: 'Ülke override\'ı ({country})',
    overrides: {
      sectionTitle: 'Ülke Override\'ları', selectCountry: 'Ülke seçin', countryCodePlaceholder: 'XX',
      selectCountryHint: 'Override\'larını yönetmek için 2 harfli bir ülke kodu girin.',
      hasOverride: 'Override', yes: 'Var', no: 'Yok', add: 'ekle', edit: 'düzenle', remove: 'sil',
    },
  },
  es: {
    overrideFor: 'Anulación de país ({country})',
    overrides: {
      sectionTitle: 'Anulaciones por País', selectCountry: 'Seleccionar país', countryCodePlaceholder: 'XX',
      selectCountryHint: 'Introduzca un código de país de 2 letras para gestionar sus anulaciones.',
      hasOverride: 'Anulación', yes: 'Sí', no: 'No', add: 'añadir', edit: 'editar', remove: 'eliminar',
    },
  },
  fr: {
    overrideFor: 'Dérogation pays ({country})',
    overrides: {
      sectionTitle: 'Dérogations par Pays', selectCountry: 'Sélectionner un pays', countryCodePlaceholder: 'XX',
      selectCountryHint: 'Saisissez un code pays à 2 lettres pour gérer ses dérogations.',
      hasOverride: 'Dérogation', yes: 'Oui', no: 'Non', add: 'ajouter', edit: 'modifier', remove: 'supprimer',
    },
  },
  ru: {
    overrideFor: 'Переопределение страны ({country})',
    overrides: {
      sectionTitle: 'Переопределения по Странам', selectCountry: 'Выберите страну', countryCodePlaceholder: 'XX',
      selectCountryHint: 'Введите 2-буквенный код страны для управления переопределениями.',
      hasOverride: 'Переопределение', yes: 'Да', no: 'Нет', add: 'добавить', edit: 'редактировать', remove: 'удалить',
    },
  },
  ar: {
    overrideFor: 'تجاوز الدولة ({country})',
    overrides: {
      sectionTitle: 'تجاوزات الدول', selectCountry: 'اختر دولة', countryCodePlaceholder: 'XX',
      selectCountryHint: 'أدخل رمز دولة مكوّن من حرفين لإدارة تجاوزاتها.',
      hasOverride: 'تجاوز', yes: 'نعم', no: 'لا', add: 'إضافة', edit: 'تعديل', remove: 'حذف',
    },
  },
  zh: {
    overrideFor: '国家覆盖 ({country})',
    overrides: {
      sectionTitle: '国家覆盖设置', selectCountry: '选择国家', countryCodePlaceholder: 'XX',
      selectCountryHint: '输入两位国家代码以管理其覆盖设置。',
      hasOverride: '覆盖', yes: '是', no: '否', add: '添加', edit: '编辑', remove: '删除',
    },
  },
};

for (const [locale, block] of Object.entries(blocks)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  json.hazardTaxonomy = { ...json.hazardTaxonomy, ...block };
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
