import { invoke } from "@tauri-apps/api/core";
import type { AyahMorphology, SurahMorphology } from "$lib/types/morphology";
import { cachedMorphology } from "$lib/stores/surah-cache";

/** Cached morphology for a complete surah, used by local verse pickers. */
export function fetchSurahMorphology(surah: number): Promise<SurahMorphology> {
    return cachedMorphology(surah, () =>
        invoke<SurahMorphology>("get_surah_morphology", { surahNumber: surah }),
    );
}

/** One randomly sampled Qur'anic word, with its muṣḥaf spelling and gloss. */
export interface StudyWord {
    surah: number;
    ayah: number;
    word: number;
    arabic: string;
    gloss: string;
}

/**
 * A fresh random selection of short Qur'anic words for the "build a word"
 * picker. `letters` counts base letters, not characters, and `lang` names one
 * of the bundled word-by-word gloss languages (unknown ones fall back to
 * English).
 */
export function fetchRandomStudyWords(
    count: number,
    letters: number,
    lang: string,
): Promise<StudyWord[]> {
    return invoke<StudyWord[]>("get_random_study_words", { count, letters, lang });
}

/** One real occurrence of a grammatical pattern in the muṣḥaf. */
export interface MorphologyExample {
    surah: number;
    ayah: number;
    word: number;
    arabic: string;
    tag: string;
    features: string;
}

/**
 * Verified occurrences of a grammatical pattern, for the grammar curriculum to
 * explain. `features` atoms must all be present on the matched token.
 */
export function findMorphologyExamples(
    query: { tag?: string; features?: string[] },
    limit: number,
): Promise<MorphologyExample[]> {
    return invoke<MorphologyExample[]>("find_morphology_examples", {
        tag: query.tag ?? null,
        features: query.features ?? [],
        limit,
    });
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
