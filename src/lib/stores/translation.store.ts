import { get, writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface TranslatorInfo {
    id: number;
    lang: string;
    name: string;
}

export interface AyahTranslation {
    ayah: number;
    text: string;
    footnotes: string | null;
}

export const activeTranslatorId = writable<number | null>(
    browser ? JSON.parse(localStorage.getItem('translatorId') ?? 'null') : null
);
activeTranslatorId.subscribe(v => {
    if (browser) localStorage.setItem('translatorId', JSON.stringify(v));
});

export const availableTranslators = writable<TranslatorInfo[]>([]);

/**
 * Fill `availableTranslators` if this window has not already. SurahWidget loads
 * the list for the main window; secondary windows (the postcard editor) boot a
 * fresh store and would otherwise show an empty translation picker.
 */
export async function ensureTranslators(): Promise<TranslatorInfo[]> {
    const current = get(availableTranslators);
    if (current.length) return current;
    const { invoke } = await import('@tauri-apps/api/core');
    const list = await invoke<TranslatorInfo[]>('get_translators');
    availableTranslators.set(list);
    return list;
}
export const surahTranslation = writable<AyahTranslation[] | null>(null);
export const basmallahTranslation = writable<AyahTranslation | null>(null);

export const transliterationEnabled = writable<boolean>(
    browser ? localStorage.getItem('transliterationEnabled') === 'true' : false
);
transliterationEnabled.subscribe(v => {
    if (browser) localStorage.setItem('transliterationEnabled', String(v));
});

export const surahTransliteration = writable<Map<number, string> | null>(null);

export const wordByWordEnabled = writable<boolean>(
    browser ? localStorage.getItem('wordByWordEnabled') === 'true' : false
);
wordByWordEnabled.subscribe(v => {
    if (browser) localStorage.setItem('wordByWordEnabled', String(v));
});

export const wordByWordLang = writable<string>(
    browser ? (localStorage.getItem('wordByWordLang') ?? 'english') : 'english'
);
wordByWordLang.subscribe(v => {
    if (browser) localStorage.setItem('wordByWordLang', v);
});

export const surahWordByWord = writable<Map<string, string> | null>(null);

// Multi-surah maps: surah number → per-ayah data (populated in multi-surah / AL mode)
export const multiSurahTranslationMap = writable<Map<number, Map<number, AyahTranslation>> | null>(null);
export const multiSurahTransliterationMap = writable<Map<number, Map<number, string>> | null>(null);
export const multiSurahWordByWordMap = writable<Map<number, Map<string, string>> | null>(null);
// Map: surah number → Map<ayah number, tafsir text>
export const multiSurahTafsirMap = writable<Map<number, Map<number, string>> | null>(null);

export interface TafsirAuthorInfo {
    id: number;
    lang: string;
    name: string;
}

export interface AyahTafsir {
    ayah: number;
    text: string;
}

export const tafsirEnabled = writable<boolean>(
    browser ? localStorage.getItem('tafsirEnabled') === 'true' : false
);
tafsirEnabled.subscribe(v => {
    if (browser) localStorage.setItem('tafsirEnabled', String(v));
});

export const activeTafsirId = writable<number | null>(
    browser ? JSON.parse(localStorage.getItem('tafsirId') ?? 'null') : null
);
activeTafsirId.subscribe(v => {
    if (browser) localStorage.setItem('tafsirId', JSON.stringify(v));
});

export const availableTafsirAuthors = writable<TafsirAuthorInfo[]>([]);

/**
 * Fill `availableTafsirAuthors` if this window has not already. SurahWidget
 * loads the list for the main window; secondary windows (the tafsir reader)
 * boot a fresh store and would otherwise show no author name.
 */
export async function ensureTafsirAuthors(): Promise<TafsirAuthorInfo[]> {
    const current = get(availableTafsirAuthors);
    if (current.length) return current;
    const { invoke } = await import('@tauri-apps/api/core');
    const list = await invoke<TafsirAuthorInfo[]>('get_tafsir_authors');
    availableTafsirAuthors.set(list);
    return list;
}
export const surahTafsir = writable<AyahTafsir[] | null>(null);

/**
 * "A reader is showing this text" — MorphologyView reads these to suppress its
 * inline copy in the parchment. True whether the reader is its own window or
 * the in-app panel, so the parchment behaves the same either way.
 */
export const tafsirDialogOpen = writable<boolean>(false);
export const translationDialogOpen = writable<boolean>(false);

/**
 * "The in-app panel is mounted" — only the fallback path, when there is no
 * window to open. Kept apart from the flags above: those are also true while a
 * reader *window* is up, and mounting the panel then would show the same text
 * twice, once per window.
 */
export const tafsirPanelOpen = writable<boolean>(false);
export const translationPanelOpen = writable<boolean>(false);
