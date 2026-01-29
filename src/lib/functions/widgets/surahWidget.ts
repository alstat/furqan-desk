import {
    surah,
    surahTranslation,
    selectedSurahName,
    selectedSurahIdx,
    fontFamily,
    fontSize,
    surahOrientation,
    surahTafsir,
    enSurahName,
    surahTemplate,
    onLoadPayload,
    displayMode,
    surahMorphology
} from '$lib/stores/quran.svelte';
import { get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { SurahMorphology } from '$lib/types/morphology';

export async function handleSurahChange(event: Event, specifiedSurahIdx?:number, action?:string): Promise<void> {
    console.log("you click surah change")
    const target = event.target as HTMLSelectElement;
    const form = target.form as HTMLFormElement;
    const formData = new FormData(form);
    
    let surahIdx: number = 1
    let formAction: string = "rest/load_quran"
    let formMethod: string = "POST"

    if (form != undefined) {
        surahIdx = parseInt(formData.get('surah-idx') as string);
        selectedSurahIdx.set(surahIdx)
        formAction = form.action
        formMethod = form.method
    } else {
        if (specifiedSurahIdx != undefined) {
            selectedSurahIdx.set(specifiedSurahIdx)
            surahIdx = specifiedSurahIdx
            formData.append("surah-idx", String(surahIdx))
        } else {
            surahIdx = 1
        }
    }
    
    selectedSurahIdx.set(surahIdx);
    selectedSurahName.set(get(onLoadPayload).ar_labels[surahIdx - 1]);
    enSurahName.set(get(onLoadPayload).en_labels[surahIdx - 1]);

    try {
        const response = await fetch(formAction, {
            method: formMethod,
            body: formData,
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(data);
        surah.set(data.payload.form[0]);
        surahTranslation.set(data.payload.trans[0]);
        surahTafsir.set(data.payload.tafsir[0]);
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    }
}

export async function handleTranslationChange(event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement;
    const form = target.form as HTMLFormElement;
    const formData = new FormData(form);
    
    try {
        const response = await fetch(form.action, {
            method: form.method,
            body: formData,
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        surahTranslation.set(data.payload.trans[0]);
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    }
}

export async function handleTafsirChange(event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement;
    const form = target.form as HTMLFormElement;
    const formData = new FormData(form);
    
    try {
        const response = await fetch(form.action, {
            method: form.method,
            body: formData,
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        surahTafsir.set(data.payload.tafsir[0]);
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    }
}

export async function loadMorphologySurah(surahNumber: number): Promise<void> {
    try {
        console.log('Loading morphology for surah:', surahNumber);
        const data = await invoke<SurahMorphology>('get_surah_morphology', { surahNumber });
        surahMorphology.set(data);
        console.log('Morphology data loaded:', data.ayahs.length, 'ayahs');
    } catch (error) {
        console.error('Error loading morphology:', error instanceof Error ? error.message : 'Unknown error');
    }
}

export async function handleDisplayModeChange(mode: 'standard' | 'morphological'): Promise<void> {
    displayMode.set(mode);
    const currentSurahIdx = get(selectedSurahIdx);

    if (mode === 'morphological') {
        await loadMorphologySurah(currentSurahIdx);
    }
}
