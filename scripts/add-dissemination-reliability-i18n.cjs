// One-off i18n injector for spec 031 (Dissemination Reliability & Compliance).
// Adds contacts.anonymize / contacts.anonymizeConfirm to all 7 locales,
// merging into the existing contacts object.
const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales')

const STRINGS = {
  tr: {
    anonymize: 'anonimleştir',
    anonymizeConfirm: '{name} adlı kişinin kişisel verilerini (e-posta, WhatsApp numarası) kalıcı ve geri döndürülemez şekilde kaldırmak istediğinize emin misiniz?',
  },
  en: {
    anonymize: 'anonymize',
    anonymizeConfirm: 'Are you sure you want to permanently and irreversibly remove {name}\'s personal data (email, WhatsApp number)?',
  },
  es: {
    anonymize: 'anonimizar',
    anonymizeConfirm: '¿Está seguro de que desea eliminar de forma permanente e irreversible los datos personales (correo electrónico, número de WhatsApp) de {name}?',
  },
  fr: {
    anonymize: 'anonymiser',
    anonymizeConfirm: 'Êtes-vous sûr de vouloir supprimer définitivement et irréversiblement les données personnelles (e-mail, numéro WhatsApp) de {name} ?',
  },
  ru: {
    anonymize: 'анонимизировать',
    anonymizeConfirm: 'Вы уверены, что хотите безвозвратно удалить личные данные (email, номер WhatsApp) контакта {name}?',
  },
  ar: {
    anonymize: 'إخفاء الهوية',
    anonymizeConfirm: 'هل أنت متأكد من أنك تريد إزالة البيانات الشخصية (البريد الإلكتروني، رقم واتساب) الخاصة بـ {name} بشكل دائم ولا رجعة فيه؟',
  },
  zh: {
    anonymize: '匿名化',
    anonymizeConfirm: '您确定要永久且不可逆地删除 {name} 的个人数据(电子邮件、WhatsApp 号码)吗?',
  },
}

for (const [locale, strings] of Object.entries(STRINGS)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!data.contacts) data.contacts = {}
  Object.assign(data.contacts, strings)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`Updated ${locale}.json`)
}
