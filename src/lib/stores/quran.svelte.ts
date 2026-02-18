import { writable, type Writable } from "svelte/store";
import type { SurahMorphology } from "$lib/types/morphology";

export interface SurahLabel {
    en: string;
    ar: string;
}

export let surahLabels: Writable<SurahLabel[]> = writable([]);
export let selectedSurahName: Writable<string> = writable('');
export let enSurahName: Writable<string> = writable('');
export let selectedSurahIdx: Writable<number> = writable(1);
export let surahOrientation: Writable<Function> = writable(() => 'flex-row-reverse');
export let hideSurahPage: Writable<Function> = writable(() => false);
export let isSidebar: Writable<boolean> = writable(false);

// Morphology stores
export let surahMorphology: Writable<SurahMorphology | null> = writable(null);
