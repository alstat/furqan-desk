import { writable, derived } from 'svelte/store';
import { en } from './locales/en';
import { ar } from './locales/ar';
import { bn } from './locales/bn';
import { fa } from './locales/fa';
import { hi } from './locales/hi';
import { id } from './locales/id';
import { ms } from './locales/ms';
import { pt } from './locales/pt';
import { tl } from './locales/tl';
import { tr } from './locales/tr';
import { ur } from './locales/ur';
import { zh } from './locales/zh';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { de } from './locales/de';
import { fr } from './locales/fr';
import { es } from './locales/es';
import { ru } from './locales/ru';
import { vi } from './locales/vi';
import { th } from './locales/th';
import { my } from './locales/my';
import { ceb } from './locales/ceb';
import { kk } from './locales/kk';
import { uz } from './locales/uz';
import { tk } from './locales/tk';
import { ky } from './locales/ky';
import { tg } from './locales/tg';
import { sq } from './locales/sq';
import { bs } from './locales/bs';
import { sr } from './locales/sr';
import { ku } from './locales/ku';
import { ta } from './locales/ta';
import { sw } from './locales/sw';
import { pa } from './locales/pa';

export type Locale = 'en' | 'ar' | 'bn' | 'fa' | 'hi' | 'id' | 'ms' | 'pt' | 'tl' | 'tr' | 'ur' | 'zh' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru' | 'vi' | 'th' | 'my' | 'ceb' | 'kk' | 'uz' | 'tk' | 'ky' | 'tg' | 'sq' | 'bs' | 'sr' | 'ku' | 'ta' | 'sw' | 'pa';

export const LOCALE_NAMES: Record<Locale, string> = {
    en: 'English',
    ar: 'العربية',
    bn: 'বাংলা',
    fa: 'فارسی',
    hi: 'हिन्दी',
    id: 'Bahasa Indonesia',
    ms: 'Bahasa Melayu',
    pt: 'Português',
    tl: 'Filipino',
    tr: 'Türkçe',
    ur: 'اردو',
    zh: '中文 (简体)',
    ja: '日本語',
    ko: '한국어',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    ru: 'Русский',
    vi: 'Tiếng Việt',
    th: 'ภาษาไทย',
    my: 'မြန်မာဘာသာ',
    ceb: 'Bisaya',
    kk: 'Қазақша',
    uz: "O'zbek",
    tk: 'Türkmen',
    ky: 'Кыргызча',
    tg: 'Тоҷикӣ',
    sq: 'Shqip',
    bs: 'Bosanski',
    sr: 'Српски',
    ku: 'کوردی',
    ta: 'தமிழ்',
    sw: 'Kiswahili',
    pa: 'ਪੰਜਾਬੀ',
};

const locales: Record<Locale, Record<string, string>> = { en, ar, bn, fa, hi, id, ms, pt, tl, tr, ur, zh, ja, ko, de, fr, es, ru, vi, th, my, ceb, kk, uz, tk, ky, tg, sq, bs, sr, ku, ta, sw, pa };

function loadLocale(): Locale {
    try {
        const v = localStorage.getItem('app-locale');
        if (v && v in locales) return v as Locale;
    } catch {}
    return 'en';
}

const _locale = writable<Locale>(loadLocale());

export const locale = {
    subscribe: _locale.subscribe,
    set(v: Locale) {
        try { localStorage.setItem('app-locale', v); } catch {}
        _locale.set(v);
    },
};

export const t = derived(_locale, ($locale) => {
    const dict = locales[$locale];
    return (key: string, vars?: Record<string, string | number>): string => {
        let str = dict[key] ?? en[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, String(v));
        return str;
    };
});
