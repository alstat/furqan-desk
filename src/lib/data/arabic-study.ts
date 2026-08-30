import { invoke } from "@tauri-apps/api/core";
import type { AyahMorphology, SurahMorphology } from "$lib/types/morphology";
import { cachedMorphology } from "$lib/stores/surah-cache";

/** Cached morphology for a complete surah, used by local verse pickers. */
export function fetchSurahMorphology(surah: number): Promise<SurahMorphology> {
    return cachedMorphology(surah, () =>
        invoke<SurahMorphology>("get_surah_morphology", { surahNumber: surah }),
    );
}

/** Word-by-word morphology for one ayah — used by the Verse Study canvas. */
export function fetchAyahMorphology(surah: number, ayah: number): Promise<AyahMorphology> {
    return invoke<AyahMorphology>("get_ayah_morphology", { surah, ayah });
}

/** One verse elsewhere in the Qur'an sharing a studied word's root or lemma. */
export interface RelatedVerseMatch {
    surah: number;
    ayah: number;
    word: number;
}

/**
 * Exact root/lemma match, not AI-ranked — see the Rust command's own comment
 * for why (a future AI-reranking pass sits in front of this, not inside it).
 */
export function findVersesByRootOrLemma(
    root: string | null,
    lemma: string | null,
    excludeSurah: number,
    excludeAyah: number,
): Promise<RelatedVerseMatch[]> {
    return invoke<RelatedVerseMatch[]>("find_verses_by_root_or_lemma", {
        root,
        lemma,
        excludeSurah,
        excludeAyah,
    });
}
