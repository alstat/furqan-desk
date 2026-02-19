import { selectedSurahIdx, surahMorphology, basmallahMorphology } from '$lib/stores/quran.svelte';
import { get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { AyahMorphology, SurahMorphology } from '$lib/types/morphology';

export async function loadMorphologySurah(surahNumber: number): Promise<void> {
    try {
        const data = await invoke<SurahMorphology>('get_surah_morphology', { surahNumber });
        surahMorphology.set(data);
    } catch (error) {
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
