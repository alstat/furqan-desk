import { writable, derived } from 'svelte/store';
import { en } from './locales/en';

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

/**
 * Only English ships in the app shell. The other 33 dictionaries are ~2.5 MB of
 * string data between them and a session uses exactly one, so each is its own
 * dynamically-imported chunk, fetched for the active locale alone.
 *
 * That weighs more here than in an ordinary single-page app: every secondary
 * window — the postcard editor, the manuscript viewer, the terminal, the tafsir
 * and translation panes — boots this same bundle in its own webview, and each
 * one used to parse all 34 dictionaries to read from one.
 */
const LOADERS: Record<
    Exclude<Locale, 'en'>,
    () => Promise<Record<string, string>>
> = {
    ar: () => import('./locales/ar').then((m) => m.ar),
    bn: () => import('./locales/bn').then((m) => m.bn),
    fa: () => import('./locales/fa').then((m) => m.fa),
    hi: () => import('./locales/hi').then((m) => m.hi),
    id: () => import('./locales/id').then((m) => m.id),
    ms: () => import('./locales/ms').then((m) => m.ms),
    pt: () => import('./locales/pt').then((m) => m.pt),
    tl: () => import('./locales/tl').then((m) => m.tl),
    tr: () => import('./locales/tr').then((m) => m.tr),
    ur: () => import('./locales/ur').then((m) => m.ur),
    zh: () => import('./locales/zh').then((m) => m.zh),
    ja: () => import('./locales/ja').then((m) => m.ja),
    ko: () => import('./locales/ko').then((m) => m.ko),
    de: () => import('./locales/de').then((m) => m.de),
    fr: () => import('./locales/fr').then((m) => m.fr),
    es: () => import('./locales/es').then((m) => m.es),
    ru: () => import('./locales/ru').then((m) => m.ru),
    vi: () => import('./locales/vi').then((m) => m.vi),
    th: () => import('./locales/th').then((m) => m.th),
    my: () => import('./locales/my').then((m) => m.my),
    ceb: () => import('./locales/ceb').then((m) => m.ceb),
    kk: () => import('./locales/kk').then((m) => m.kk),
    uz: () => import('./locales/uz').then((m) => m.uz),
    tk: () => import('./locales/tk').then((m) => m.tk),
    ky: () => import('./locales/ky').then((m) => m.ky),
    tg: () => import('./locales/tg').then((m) => m.tg),
    sq: () => import('./locales/sq').then((m) => m.sq),
    bs: () => import('./locales/bs').then((m) => m.bs),
    sr: () => import('./locales/sr').then((m) => m.sr),
    ku: () => import('./locales/ku').then((m) => m.ku),
    ta: () => import('./locales/ta').then((m) => m.ta),
    sw: () => import('./locales/sw').then((m) => m.sw),
    pa: () => import('./locales/pa').then((m) => m.pa),
};

/** Dictionaries resolved so far. English is always present as the fallback. */
const dictionaries: Partial<Record<Locale, Record<string, string>>> = { en };

/** Bumped when a dictionary lands, so `t` re-derives with the new strings. */
const _dictionariesLoaded = writable(0);

/**
 * Resolve a locale's dictionary, if it is not already in hand. Safe to call
 * repeatedly; a failed import leaves the locale falling back to English rather
 * than rejecting. Awaited by the root layout's load so the first paint is
 * already translated.
 */
export async function ensureLocale(target: Locale): Promise<void> {
    if (dictionaries[target]) return;
    const load = LOADERS[target as Exclude<Locale, 'en'>];
    if (!load) return;
    try {
        dictionaries[target] = await load();
        _dictionariesLoaded.update((n) => n + 1);
    } catch {
        /* Keep English rather than failing the app over a missing chunk. */
    }
}

function loadLocale(): Locale {
    try {
        const v = localStorage.getItem('app-locale');
        if (v && v in LOCALE_NAMES) return v as Locale;
    } catch {}
    return 'en';
}

const _locale = writable<Locale>(loadLocale());

export const locale = {
    subscribe: _locale.subscribe,
    set(v: Locale) {
        try { localStorage.setItem('app-locale', v); } catch {}
        if (dictionaries[v]) {
            _locale.set(v);
            return;
        }
        // Switch only once the strings are in hand — `finally`, so a failed
        // import still moves the locale (rendering English) instead of
        // silently ignoring the choice.
        void ensureLocale(v).finally(() => _locale.set(v));
    },
};

export const t = derived([_locale, _dictionariesLoaded], ([$locale]) => {
    const dict = dictionaries[$locale as Locale] ?? en;
    return (key: string, vars?: Record<string, string | number>): string => {
        let str = dict[key] ?? en[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, String(v));
        return str;
    };
});
