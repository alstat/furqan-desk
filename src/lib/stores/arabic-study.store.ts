import { get, writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { openAppWindow } from '$lib/utils/appWindow';

export const arabicStudyEnabled = writable<boolean>(true);

/** In-app fallback panels, used outside Tauri (browser dev) or if the window fails to open. */
export const verseStudyOpen = writable(false);
export const onboardingOpen = writable(false);

/** The ayah the Verse Study canvas is currently focused on. */
export const verseStudyAyah = writable<{ surah: number; ayah: number } | null>(null);

export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * `undefined` = not yet loaded, `null` = loaded and no profile exists yet
 * (onboarding hasn't run), otherwise the saved level.
 */
export const proficiencyLevel = writable<ProficiencyLevel | null | undefined>(undefined);

const ARABIC_STUDY_WINDOW = 'arabic-study';
const ARABIC_STUDY_HOME_WINDOW = 'arabic-study-home';

interface ArabicStudyProfile {
    proficiency_level: string;
    onboarded_at: string;
    updated_at: string;
}

/** Load the saved proficiency level, if any — call once at app startup. */
export async function hydrateProficiencyLevel(): Promise<void> {
    try {
        const profile = await invoke<ArabicStudyProfile | null>('get_arabic_study_profile');
        proficiencyLevel.set((profile?.proficiency_level as ProficiencyLevel) ?? null);
    } catch (e) {
        console.error('Failed to load Arabic Study profile', e);
        proficiencyLevel.set(null);
    }
}

export async function saveProficiencyLevel(level: ProficiencyLevel): Promise<void> {
    const profile = await invoke<ArabicStudyProfile>('save_arabic_study_profile', {
        proficiencyLevel: level,
    });
    proficiencyLevel.set(profile.proficiency_level as ProficiencyLevel);
}

/**
 * The Verse Study canvas runs in a window of its own, same reasoning as the
 * Manuscript Viewer: its own dock/taskbar entry, its own place on screen,
 * and it stays open while the reader keeps studying in the main window.
 *
 * Which ayah to show rides on the query string — the new window boots a
 * fresh JS context that shares no memory with this one.
 */
function openVerseStudyWindow(): Promise<boolean> {
    const params = new URLSearchParams();
    const ref = get(verseStudyAyah);
    if (ref) {
        params.set('surah', String(ref.surah));
        params.set('ayah', String(ref.ayah));
    }
    return openAppWindow({
        label: ARABIC_STUDY_WINDOW,
        url: `/arabic-study/?${params}`,
        title: 'Arabic Language Study',
        width: 1180,
        height: 820,
        minWidth: 900,
        minHeight: 640,
        // Already open: point it at the new ayah rather than starting over.
        onExisting: async (win) => {
            const current = get(verseStudyAyah);
            if (current) await win.emit('verse-study-ayah', current);
        },
    });
}

/** Open the Verse Study canvas focused on a specific ayah. */
export async function openVerseStudy(ref: { surah: number; ayah: number }): Promise<void> {
    verseStudyAyah.set(ref);
    if (await openVerseStudyWindow()) return;
    // Fallback: the floating panel inside the main window.
    verseStudyOpen.set(true);
}

function openHomeWindow(): Promise<boolean> {
    return openAppWindow({
        label: ARABIC_STUDY_HOME_WINDOW,
        url: `/arabic-study-home/`,
        title: 'Arabic Language Study',
        // Sized for the alphabet/pairing lessons, not just the onboarding card.
        width: 1180,
        height: 820,
        minWidth: 900,
        minHeight: 640,
    });
}

/**
 * The toolbar button's entry point: no specific ayah, just the feature's
 * home. The route itself decides what to render — the proficiency picker on
 * first run, then routes into the curriculum (see ArabicStudyHome.svelte).
 */
export async function openArabicStudyHome(): Promise<void> {
    if (await openHomeWindow()) return;
    onboardingOpen.set(true);
}

// ── Letter progress (alphabet curriculum) ────────────────────────────────

export interface LetterProgress {
    letter: string;
    practiced_at: string | null;
    mastered: boolean;
    mastered_at: string | null;
}

/** All rows — used to drive the letter grid's checkmarks and the "N of 28" counter. */
export function fetchLetterProgress(): Promise<LetterProgress[]> {
    return invoke<LetterProgress[]>('get_letter_progress');
}

export function markLetterPracticed(letter: string): Promise<LetterProgress> {
    return invoke<LetterProgress>('mark_letter_practiced', { letter });
}

export function setLetterMastered(letter: string, mastered: boolean): Promise<LetterProgress> {
    return invoke<LetterProgress>('set_letter_mastered', { letter, mastered });
}

// ── Grammar-topic content (intermediate/advanced curriculum) ────────────────

/**
 * Which language the AI writes the grammar lesson in. Picked in the wizard's
 * header from the same list Settings offers for the app itself, and remembered
 * separately: a reader may run the app in English and still want the
 * explanation in their mother tongue.
 */
const GRAMMAR_LANGUAGE_KEY = 'arabicStudyGrammarLanguage';

function initialGrammarLanguage(): string {
    if (typeof localStorage === 'undefined') return 'en';
    try {
        return localStorage.getItem(GRAMMAR_LANGUAGE_KEY) ?? localStorage.getItem('app-locale') ?? 'en';
    } catch {
        return 'en';
    }
}

export const grammarLanguage = writable<string>(initialGrammarLanguage());
grammarLanguage.subscribe((value) => {
    try {
        localStorage.setItem(GRAMMAR_LANGUAGE_KEY, value);
    } catch {
        /* ignore */
    }
});


export interface TopicContent {
    topic_id: string;
    content: string;
    locale: string;
    generated_at: string;
}

/** All cached topics — a row's presence is the "viewed" signal for the sidebar. */
export function fetchTopicContent(): Promise<TopicContent[]> {
    return invoke<TopicContent[]>('get_topic_content');
}

export function saveTopicContent(topicId: string, content: string, locale: string): Promise<TopicContent> {
    return invoke<TopicContent>('save_topic_content', { topicId, content, locale });
}
