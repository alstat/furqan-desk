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

// ── What the reader has worked through ──────────────────────────────────────

export interface StudyActivity {
    area: string;
    item: string;
    seen_count: number;
    first_seen: string;
    last_seen: string;
}

/** Areas the lessons report against. */
export const STUDY_AREA = {
    /** item = "<letterId>:<harakah>" — one letter paired with one vowel. */
    pairing: 'pairing',
    /** item = tajwīd rule id. */
    tajweed: 'tajweed',
    /** item = long-vowel / special-form id. */
    alifForms: 'alif_forms',
    /** item = the built word's id. */
    words: 'words',
    /** item = grammar topic id — opened and read. */
    topics: 'topics',
    /** item = "<topicId>:<exercise index>" — an answer was chosen. */
    exercises: 'exercises',
    /** item = topic id — one follow-up question asked about it. */
    followUps: 'follow_ups',
} as const;

/**
 * Note that an item has just been worked through. Fire-and-forget: progress
 * reporting is not worth interrupting a lesson for, and outside Tauri there is
 * nowhere to write.
 */
export function recordStudyActivity(area: string, item: string): void {
    void invoke('record_study_activity', { area, item }).catch(() => {});
}

export function fetchStudyActivity(): Promise<StudyActivity[]> {
    return invoke<StudyActivity[]>('get_study_activity');
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

/** One version of a lesson: the shipped English one, or an AI generation. */
export interface TopicVersion {
    id: number;
    topic_id: string;
    locale: string;
    content: string;
    /** 'premade' ships with the app; 'ai' was generated here. */
    source: string;
    created_at: string;
}

export function fetchTopicVersions(topicId: string, locale: string): Promise<TopicVersion[]> {
    return invoke<TopicVersion[]>('get_topic_versions', { topicId, locale });
}

/** Adds a version. Nothing is overwritten — history is the point. */
export function saveTopicVersion(
    topicId: string,
    locale: string,
    content: string,
    source: 'premade' | 'ai',
): Promise<TopicVersion> {
    return invoke<TopicVersion>('save_topic_version', { topicId, locale, content, source });
}

export function deleteTopicVersion(id: number): Promise<void> {
    return invoke<void>('delete_topic_version', { id });
}

/**
 * The lesson versions on screen, published by the grammar curriculum so the
 * wizard's header can offer them — the header owns no lesson state of its own.
 */
export const lessonVersions = writable<TopicVersion[]>([]);
export const activeVersionId = writable<number | null>(null);

/** A section the reader added to a lesson, stored per topic and language. */
export interface TopicSection {
    id: number;
    topic_id: string;
    locale: string;
    position: number;
    title: string;
    brief: string;
    content: string;
    expanded: boolean;
    updated_at: string;
}

export function fetchTopicSections(topicId: string, locale: string): Promise<TopicSection[]> {
    return invoke<TopicSection[]>('get_topic_sections', { topicId, locale });
}

/** Insert (no `id`) or update one section; returns the stored row. */
export function saveTopicSection(section: {
    id?: number;
    topicId: string;
    locale: string;
    position: number;
    title: string;
    brief: string;
    content: string;
    expanded: boolean;
}): Promise<TopicSection> {
    return invoke<TopicSection>('save_topic_section', {
        id: section.id ?? null,
        topicId: section.topicId,
        locale: section.locale,
        position: section.position,
        title: section.title,
        brief: section.brief,
        content: section.content,
        expanded: section.expanded,
    });
}

export function deleteTopicSection(id: number): Promise<void> {
    return invoke<void>('delete_topic_section', { id });
}

export function saveTopicContent(topicId: string, content: string, locale: string): Promise<TopicContent> {
    return invoke<TopicContent>('save_topic_content', { topicId, content, locale });
}
