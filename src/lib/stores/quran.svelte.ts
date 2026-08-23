import { get, writable, type Writable } from "svelte/store";
import type { AyahMorphology, SurahMorphology } from "$lib/types/morphology";

export interface SurahLabel {
    en: string;
    ar: string;
}

export let surahLabels: Writable<SurahLabel[]> = writable([]);
/**
 * Fill `surahLabels` if this window has not already. The main page loads the
 * list as part of its startup, but secondary windows (the postcard editor) boot
 * a fresh store and would otherwise show an empty surah picker.
 */
export async function ensureSurahLabels(): Promise<SurahLabel[]> {
    const current = get(surahLabels);
    if (current.length) return current;
    const { invoke } = await import("@tauri-apps/api/core");
    const labels = await invoke<SurahLabel[]>("get_surah_labels");
    surahLabels.set(labels);
    return labels;
}

export let selectedSurahName: Writable<string> = writable('');
export let enSurahName: Writable<string> = writable('');
export let selectedSurahIdx: Writable<number> = writable(1);
export let surahOrientation: Writable<Function> = writable(() => 'flex-row-reverse');
export let hideSurahPage: Writable<Function> = writable(() => false);
export let isSidebar: Writable<boolean> = writable(false);

// Morphology stores
export let surahMorphology: Writable<SurahMorphology | null> = writable(null);
export let basmallahMorphology: Writable<AyahMorphology | null> = writable(null);
export const morphologyAyahFilter: Writable<number[] | null> = writable(null);
export const morphologyMultiSurahList: Writable<SurahMorphology[] | null> = writable(null);
