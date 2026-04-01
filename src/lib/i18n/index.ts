import { writable, derived } from 'svelte/store';
import { en } from './locales/en';
import { ar } from './locales/ar';
import { fa } from './locales/fa';
import { ur } from './locales/ur';
import { zh } from './locales/zh';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { de } from './locales/de';
import { fr } from './locales/fr';
import { es } from './locales/es';
import { ru } from './locales/ru';

export type Locale = 'en' | 'ar' | 'fa' | 'ur' | 'zh' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru';

export const LOCALE_NAMES: Record<Locale, string> = {
    en: 'English',
    ar: 'العربية',
    fa: 'فارسی',
    ur: 'اردو',
    zh: '中文 (简体)',
    ja: '日本語',
    ko: '한국어',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    ru: 'Русский',
};

const locales: Record<Locale, Record<string, string>> = { en, ar, fa, ur, zh, ja, ko, de, fr, es, ru };

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
