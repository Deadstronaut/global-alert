import {createI18n} from 'vue-i18n';
import tr from './locales/tr.json';
import en from './locales/en.json';
import ar from './locales/ar.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';

const i18n = createI18n({
    legacy: false,
    locale: 'tr',
    fallbackLocale: 'en',
    messages: {
        tr,
        en,
        ar,
        es,
        fr,
        ru,
        zh
    }
});

export default i18n;
