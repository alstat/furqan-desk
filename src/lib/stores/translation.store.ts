import { writable } from 'svelte/store';
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
export const surahTafsir = writable<AyahTafsir[] | null>(null);

export const tafsirDialogOpen = writable<boolean>(false);
export const translationDialogOpen = writable<boolean>(false);
