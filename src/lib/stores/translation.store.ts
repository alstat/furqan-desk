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

export const surahWordByWord = writable<Map<string, string> | null>(null);
