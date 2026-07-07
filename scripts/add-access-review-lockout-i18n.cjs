// One-off script: adds `admin.accessReview.*` and `login.accountLocked` i18n
// keys (spec 028 — access review report + account lockout) to all 7 locale
// files. Safe to re-run.
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const ACCESS_REVIEW = {
  tr: { exportCsv: 'CSV Dışa Aktar', exportJson: 'JSON Dışa Aktar', lastLogin: 'Son Giriş', lockStatus: 'Kilit Durumu', locked: 'Kilitli', unlockAction: 'Kilidi aç' },
  en: { exportCsv: 'Export CSV', exportJson: 'Export JSON', lastLogin: 'Last Login', lockStatus: 'Lock Status', locked: 'Locked', unlockAction: 'Unlock' },
  es: { exportCsv: 'Exportar CSV', exportJson: 'Exportar JSON', lastLogin: 'Último Acceso', lockStatus: 'Estado de Bloqueo', locked: 'Bloqueado', unlockAction: 'Desbloquear' },
  fr: { exportCsv: 'Exporter CSV', exportJson: 'Exporter JSON', lastLogin: 'Dernière Connexion', lockStatus: 'État du Verrouillage', locked: 'Verrouillé', unlockAction: 'Déverrouiller' },
  ru: { exportCsv: 'Экспорт CSV', exportJson: 'Экспорт JSON', lastLogin: 'Последний вход', lockStatus: 'Статус блокировки', locked: 'Заблокировано', unlockAction: 'Разблокировать' },
  ar: { exportCsv: 'تصدير CSV', exportJson: 'تصدير JSON', lastLogin: 'آخر تسجيل دخول', lockStatus: 'حالة القفل', locked: 'مقفل', unlockAction: 'إلغاء القفل' },
  zh: { exportCsv: '导出CSV', exportJson: '导出JSON', lastLogin: '最后登录', lockStatus: '锁定状态', locked: '已锁定', unlockAction: '解锁' },
};

const LOGIN = {
  tr: { accountLocked: 'Hesabınız çok sayıda başarısız giriş denemesi nedeniyle geçici olarak kilitlendi. {until} sonrasında tekrar deneyin veya bir yöneticiden kilidin açılmasını isteyin.' },
  en: { accountLocked: 'Your account has been temporarily locked due to too many failed login attempts. Try again after {until}, or ask an administrator to unlock it.' },
  es: { accountLocked: 'Su cuenta ha sido bloqueada temporalmente debido a demasiados intentos fallidos de inicio de sesión. Vuelva a intentarlo después de las {until}, o pida a un administrador que la desbloquee.' },
  fr: { accountLocked: 'Votre compte a été temporairement verrouillé en raison de trop nombreuses tentatives de connexion échouées. Réessayez après {until}, ou demandez à un administrateur de le déverrouiller.' },
  ru: { accountLocked: 'Ваша учётная запись временно заблокирована из-за слишком большого количества неудачных попыток входа. Повторите попытку после {until} или попросите администратора разблокировать её.' },
  ar: { accountLocked: 'تم قفل حسابك مؤقتًا بسبب كثرة محاولات تسجيل الدخول الفاشلة. حاول مرة أخرى بعد {until}، أو اطلب من المسؤول إلغاء القفل.' },
  zh: { accountLocked: '由于登录失败次数过多，您的账户已被暂时锁定。请在 {until} 之后重试，或请管理员为您解锁。' },
};

for (const locale of Object.keys(ACCESS_REVIEW)) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!json.admin) throw new Error(`${locale}: missing admin key`);
  json.admin.accessReview = ACCESS_REVIEW[locale];
  json.login = { ...(json.login || {}), ...LOGIN[locale] };
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('updated', locale);
}
