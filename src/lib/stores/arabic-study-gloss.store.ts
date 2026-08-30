import { derived, get, writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { browser } from '$app/environment';
import { wordByWordLang } from '$lib/stores/translation.store';
import { translateGlosses } from '$lib/stores/ai-wordbyword.store';
import {
    EVERYDAY_WORD_GLOSSES,
    type EverydayGlossLang,
} from '$lib/data/everyday-word-glosses';

// Which language the Arabic Study wizard shows word-by-word meanings in. The
// control lives in the wizard's header so one choice covers every lesson, and
// the bundled languages are kept in step with the reader's own word-by-word
// setting — they come from the same `word_by_word` table.

/** The gloss languages the bundled table carries, in the reader's own order. */
export const GLOSS_LANGUAGES = [
    ['english', 'language.english'],
    ['bengali', 'language.bengali'],
    ['french', 'language.french'],
    ['hindi', 'language.hindi'],
    ['indonesian', 'language.indonesian'],
    ['persian', 'language.persian'],
    ['tamil', 'language.tamil'],
    ['turkish', 'language.turkish'],
    ['urdu', 'language.urdu'],
] as const;

/** Not a table — the learner names a language and the AI translates into it. */
export const OTHER_GLOSS = 'other';

const CUSTOM_KEY = 'arabicStudyGlossCustom';
const LANG_KEY = 'arabicStudyGlossLang';

function initialLanguage(): string {
    if (!browser) return 'english';
    const stored = localStorage.getItem(LANG_KEY);
    if (stored) return stored;
    // First open: follow whatever the reader is already set to.
    return get(wordByWordLang) || 'english';
}

export const glossLanguage = writable<string>(initialLanguage());
glossLanguage.subscribe((value) => {
    if (!browser) return;
    localStorage.setItem(LANG_KEY, value);
    // "other" has no table behind it, so it never travels to the reader.
    if (value !== OTHER_GLOSS) wordByWordLang.set(value);
});

/**
 * Which model class translates the glosses when the learner names their own
 * language. Seeded from the AI Tools default in Settings, then remembered for
 * this wizard on its own — the same arrangement the grammar lesson uses.
 */
const MODEL_KEY = 'arabicStudyGlossModel';

function initialGlossModel(): 'standard' | 'advanced' {
    if (!browser) return 'standard';
    try {
        const stored = localStorage.getItem(MODEL_KEY);
        if (stored === 'advanced' || stored === 'standard') return stored;
        const fallback = localStorage.getItem('ai-text-default-model');
        if (fallback === 'advanced' || fallback === 'standard') return fallback;
    } catch {
        /* ignore */
    }
    return 'standard';
}

export const glossModel = writable<'standard' | 'advanced'>(initialGlossModel());
glossModel.subscribe((value) => {
    if (browser) localStorage.setItem(MODEL_KEY, value);
});

/** The free-text language name typed for `OTHER_GLOSS`. */
export const customGlossLanguage = writable<string>(
    browser ? (localStorage.getItem(CUSTOM_KEY) ?? '') : '',
);
customGlossLanguage.subscribe((value) => {
    if (browser) localStorage.setItem(CUSTOM_KEY, value);
});

/** What the backend sampler is asked for — "other" is sampled in English and
 *  translated afterwards. */
export const backendGlossLanguage = derived(glossLanguage, ($lang) =>
    $lang === OTHER_GLOSS ? 'english' : $lang,
);

/**
 * Bumped by the header's Translate button. Lessons showing word-by-word
 * meanings watch this and re-translate what they currently display, so the
 * one button in the header reaches every lesson without the header needing to
 * know what any of them are showing.
 */
export const glossTranslateEpoch = writable(0);

export function requestGlossTranslation(): void {
    glossTranslateEpoch.update((n) => n + 1);
}

// ── Meanings shown by the lessons ────────────────────────────────────────────
//
// The curriculum's example words carry hand-written English meanings. Each
// lesson registers what it is showing and renders through `glossText`; this
// module resolves those meanings into the chosen language and publishes them as
// an override map. Three sources, in order: the everyday-word table for
// examples written for the curriculum, the bundled `word_by_word` corpus for
// anything that occurs in the muṣḥaf, and — only for a language the learner
// names themselves — the AI.

/** Word as the curriculum spells it -> its English meaning. */
const registry = new Map<string, string>();

/** Resolved meanings for the current language, keyed the same way. */
export const glossOverrides = writable<Map<string, string>>(new Map());
export const glossTranslating = writable(false);
export const glossFailed = writable(false);

/** Language key -> what has been resolved for it, so switching back is free. */
const resolved = new Map<string, Map<string, string>>();

function languageKey(): string {
    const language = get(glossLanguage);
    return language === OTHER_GLOSS
        ? `${OTHER_GLOSS}:${get(customGlossLanguage).trim().toLowerCase()}`
        : language;
}

/** What a lesson should print for one example word. */
export function glossText(
    word: string,
    fallback: string,
    overrides: Map<string, string>,
): string {
    return overrides.get(word) ?? fallback;
}

/**
 * Tell the store which words a lesson is showing. Cheap to call on every
 * render: only words it has not seen before trigger any work.
 */
export function registerGlosses(entries: { word: string; meaning: string }[]): void {
    let added = false;
    for (const entry of entries) {
        if (!entry.word || registry.has(entry.word)) continue;
        registry.set(entry.word, entry.meaning);
        added = true;
    }
    if (added) void resolveGlosses();
}

let resolveToken = 0;

/**
 * Fill in whatever the current language is still missing. English needs
 * nothing — the curriculum is written in it — and a learner-named language
 * waits for the header's Translate button rather than spending AI credit on
 * every lesson that scrolls past.
 */
async function resolveGlosses(): Promise<void> {
    const token = ++resolveToken;
    const language = get(glossLanguage);

    if (language === 'english') {
        glossOverrides.set(new Map());
        return;
    }

    const key = languageKey();
    const known = resolved.get(key) ?? new Map<string, string>();
    resolved.set(key, known);

    if (language === OTHER_GLOSS) {
        glossOverrides.set(new Map(known));
        return;
    }

    // Everyday examples are not in the muṣḥaf; they carry their own table.
    const everydayLang = language as EverydayGlossLang;
    let filled = false;
    for (const word of registry.keys()) {
        if (known.has(word)) continue;
        const gloss = EVERYDAY_WORD_GLOSSES[word]?.[everydayLang];
        if (gloss) {
            known.set(word, gloss);
            filled = true;
        }
    }
    if (filled) glossOverrides.set(new Map(known));

    const missing = [...registry.keys()].filter((word) => !known.has(word));
    if (missing.length === 0) return;
    try {
        const found = await invoke<Record<string, string>>('get_word_glosses', {
            words: missing,
            lang: language,
        });
        if (token !== resolveToken) return;
        for (const [word, gloss] of Object.entries(found)) known.set(word, gloss);
        glossOverrides.set(new Map(known));
    } catch {
        // Outside Tauri, or the corpus has nothing for these words — the lesson
        // keeps its own English text, which is always a correct meaning.
    }
}

/** Put everything currently on show into the learner's named language. */
async function translateRegistry(): Promise<void> {
    const language = get(customGlossLanguage).trim();
    if (get(glossLanguage) !== OTHER_GLOSS || !language) return;

    const token = ++resolveToken;
    const entries = [...registry.entries()];
    if (entries.length === 0) return;

    glossFailed.set(false);
    glossTranslating.set(true);
    try {
        const translated = await translateGlosses({
            words: entries.map(([word]) => word),
            glosses: entries.map(([, meaning]) => meaning),
            language,
        });
        if (token !== resolveToken) return;
        const map = new Map<string, string>();
        entries.forEach(([word], index) => {
            if (translated[index]) map.set(word, translated[index]);
        });
        resolved.set(languageKey(), map);
        glossOverrides.set(map);
    } catch {
        glossFailed.set(true);
    } finally {
        glossTranslating.set(false);
    }
}

if (browser) {
    let firstLanguage = true;
    glossLanguage.subscribe(() => {
        if (firstLanguage) {
            firstLanguage = false;
            return;
        }
        glossFailed.set(false);
        void resolveGlosses();
    });

    let firstEpoch = true;
    glossTranslateEpoch.subscribe(() => {
        if (firstEpoch) {
            firstEpoch = false;
            return;
        }
        void translateRegistry();
    });
}
