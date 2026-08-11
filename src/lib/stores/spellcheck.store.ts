import { writable, get, type Writable } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────────────────────────────

export type SpellLang = {
    code: string;
    name: string;
    installed: boolean;
    bundled: boolean;
};

export type Misspelling = {
    word: string;
    /** UTF-16 offset into the checked string (inclusive). */
    start: number;
    /** UTF-16 offset into the checked string (exclusive). */
    end: number;
};

// ── Persistence helpers ────────────────────────────────────────────────────

function persistedString(key: string, initial: string): Writable<string> {
    let start = initial;
    try {
        const v = localStorage.getItem(key);
        if (v !== null) start = v;
    } catch {}
    const store = writable(start);
    store.subscribe((v) => {
        try {
            localStorage.setItem(key, v);
        } catch {}
    });
    return store;
}

function persistedBool(key: string, initial: boolean): Writable<boolean> {
    let start = initial;
    try {
        const v = localStorage.getItem(key);
        if (v !== null) start = v === "1";
    } catch {}
    const store = writable(start);
    store.subscribe((v) => {
        try {
            localStorage.setItem(key, v ? "1" : "0");
        } catch {}
    });
    return store;
}

function persistedSet(key: string): Writable<Set<string>> {
    let start: string[] = [];
    try {
        const v = localStorage.getItem(key);
        if (v) start = JSON.parse(v);
    } catch {}
    const store = writable(new Set(start));
    store.subscribe((v) => {
        try {
            localStorage.setItem(key, JSON.stringify([...v]));
        } catch {}
    });
    return store;
}

// ── Stores ─────────────────────────────────────────────────────────────────

/** Master on/off switch for spell checking across all editors. */
export const spellCheckEnabled = persistedBool("spellcheck-enabled", true);

/** Active dictionary language code (e.g. "en-US"). Empty until detected. */
export const spellLanguage = persistedString("spellcheck-language", "");

/** All languages the picker can offer (bundled + downloadable). */
export const spellLanguages = writable<SpellLang[]>([]);

/** Words remembered across sessions ("Ignore all"). Stored lowercased. */
const ignoredPersistent = persistedSet("spellcheck-ignored");

/** Words ignored for this session only ("Ignore"). Not persisted. */
const ignoredSession = writable<Set<string>>(new Set());

/**
 * A monotonically increasing tick bumped whenever the ignore lists or language
 * change, so editors can re-run their spell check without re-subscribing to
 * every underlying store.
 */
export const spellRevision = writable(0);
function bumpRevision() {
    spellRevision.update((n) => n + 1);
}
spellLanguage.subscribe(bumpRevision);
spellCheckEnabled.subscribe(bumpRevision);
ignoredPersistent.subscribe(bumpRevision);
ignoredSession.subscribe(bumpRevision);

/** Force editors to re-run their spell check immediately (e.g. after a fix). */
export function forceSpellRecheck(): void {
    bumpRevision();
}

// ── Ignore list API ────────────────────────────────────────────────────────

export function isIgnored(word: string): boolean {
    const w = word.toLowerCase();
    return get(ignoredSession).has(w) || get(ignoredPersistent).has(w);
}

/** Ignore this word for the current session only. */
export function ignoreWord(word: string): void {
    ignoredSession.update((s) => {
        s.add(word.toLowerCase());
        return new Set(s);
    });
}

/** Ignore this word permanently (remembered across restarts). */
export function ignoreWordAll(word: string): void {
    ignoredPersistent.update((s) => {
        s.add(word.toLowerCase());
        return new Set(s);
    });
}

// ── Backend calls ──────────────────────────────────────────────────────────

/** Load the language list and auto-detect the language on first run. */
export async function initSpellcheck(): Promise<void> {
    try {
        const langs = await invoke<SpellLang[]>("spell_languages");
        spellLanguages.set(langs);
    } catch {
        /* backend unavailable; leave defaults */
    }
    if (!get(spellLanguage)) {
        try {
            const detected = await invoke<string>("spell_detect_language");
            spellLanguage.set(detected || "en-US");
        } catch {
            spellLanguage.set("en-US");
        }
    }
}

/**
 * Check `text` and return misspellings that aren't in an ignore list. Returns
 * an empty array when spell checking is disabled or no language is set.
 */
export async function checkText(text: string): Promise<Misspelling[]> {
    if (!get(spellCheckEnabled)) return [];
    const lang = get(spellLanguage);
    if (!lang || !text.trim()) return [];
    let results: Misspelling[];
    try {
        results = await invoke<Misspelling[]>("spell_check", { text, lang });
    } catch {
        return [];
    }
    return results.filter((m) => !isIgnored(m.word));
}

/** Correction suggestions for a single word in the active language. */
export async function suggestWord(word: string): Promise<string[]> {
    const lang = get(spellLanguage);
    if (!lang) return [];
    try {
        return await invoke<string[]>("spell_suggest", { word, lang });
    } catch {
        return [];
    }
}

/** Download a dictionary, then refresh the language list. */
export async function installLanguage(code: string): Promise<void> {
    await invoke("install_spell_language", { code });
    try {
        spellLanguages.set(await invoke<SpellLang[]>("spell_languages"));
    } catch {}
}
