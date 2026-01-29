import { writable, type Writable } from "svelte/store";
import type { SurahMorphology } from "$lib/types/morphology";

export type DisplayMode = 'standard' | 'morphological';

interface SurahNames {
    en_labels: Array<string>;
    ar_labels: Array<string>;
    saved_surah: Array<string>;
    surah_trans: Array<string>;
    surah_tafsir: Array<string>;
    basmallah_trans: string;
    list_translations: Array<string>;
    list_tafsir: Array<string>
}

let surahList: SurahNames = $state({
    en_labels: [],
    ar_labels: [],
    saved_surah: [],
    surah_trans: [],
    surah_tafsir: [],
    basmallah_trans: '',
    list_translations: [],
    list_tafsir: []
});

export let surah: Writable<Array<string>> = writable([])
export let surahTranslation: Writable<Array<string>> = writable([])
export let surahTafsir: Writable<Array<string>> = writable([])
export let surahTemplate: Writable<Function> = writable(() => 'separated-sections')
export let selectedSurahName: Writable<string | null> = writable('')
export let enSurahName: Writable<string | null> = writable('')
export let selectedSurahIdx: Writable<number> = writable(1)
export let fontFamily: Writable<Function> = writable(() => 'font-amiri')
export let fontSize: Writable<Function> = writable(() => 'text-base')
export let surahOrientation: Writable<Function> = writable(() => 'flex-row-reverse')
export let basmallahTrans: Writable<string> = writable('')
export let onLoadPayload: Writable<SurahNames> = writable(surahList)
export let defaultTranslation: Writable<string> = writable('EN: Saheeh International')
export let defaultTafsir: Writable<string> = writable('AR: Al-Tabari')
export let hideSurahPage: Writable<Function> = writable(() => false)
export let isSidebar: Writable<boolean> = writable(false)

// Morphology mode stores
export let displayMode: Writable<DisplayMode> = writable('standard')
export let surahMorphology: Writable<SurahMorphology | null> = writable(null)
