import { selectedSurahIdx, surahMorphology, basmallahMorphology } from '$lib/stores/quran.svelte';
import { get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { AyahMorphology, SurahMorphology } from '$lib/types/morphology';
import { cachedMorphology } from '$lib/stores/surah-cache';

let loadGeneration = 0;

export async function loadMorphologySurah(surahNumber: number): Promise<void> {
    const gen = ++loadGeneration;
    try {
        const data = await cachedMorphology(surahNumber, () =>
            invoke<SurahMorphology>('get_surah_morphology', { surahNumber }),
        );
        if (gen !== loadGeneration) return;
        surahMorphology.set(data);
    } catch (error) {
        if (gen !== loadGeneration) return;
        console.error('Error loading morphology:', error instanceof Error ? error.message : 'Unknown error');
    }
}

export async function loadBasmallahMorphology(): Promise<void> {
    try {
        const data = await invoke<AyahMorphology>('get_basmallah_morphology');
        basmallahMorphology.set(data);
    } catch (error) {
        console.error('Error loading basmallah morphology:', error instanceof Error ? error.message : 'Unknown error');
    }
}
