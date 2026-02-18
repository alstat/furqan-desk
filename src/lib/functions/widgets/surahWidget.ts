import { selectedSurahIdx, surahMorphology } from '$lib/stores/quran.svelte';
import { get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { SurahMorphology } from '$lib/types/morphology';

export async function loadMorphologySurah(surahNumber: number): Promise<void> {
    try {
        const data = await invoke<SurahMorphology>('get_surah_morphology', { surahNumber });
        surahMorphology.set(data);
    } catch (error) {
        console.error('Error loading morphology:', error instanceof Error ? error.message : 'Unknown error');
    }
}
