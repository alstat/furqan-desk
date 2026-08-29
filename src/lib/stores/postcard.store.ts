import { get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { openAppWindow } from '$lib/utils/appWindow';
import type { FrameStyle } from '$lib/components/postcard/patterns';

/** Visibility of the postcard editor window. */
export const postcardDialogOpen = writable(false);

/**
 * A full snapshot of the editor, enough to put the card back exactly as it was.
 *
 * The manuscript background is stored as a *reference* rather than as pixels:
 * the scan itself arrives as a blob that cannot be serialised, so the saved
 * design keeps the manuscript and folio ids and the editor re-fetches the page
 * when it restores.
 */
export interface PostcardDesign {
    surah: number;
    selected: number[];
    translatorId: string;
    translationOn: boolean;
    showBasmallah: boolean;
    showAyahNumbers: boolean;
    refOn: boolean;
    refLang: 'en' | 'ar';

    sizeId: string;
    arabicFont: string;
    arabicSize: number;
    arabicLine: number;
    arabicColor: string;
    textAlign: 'left' | 'center' | 'right';
    vAlign: number;
    autoFit: boolean;

    shadowOn: boolean;
    shadowBlur: number;
    shadowDx: number;
    shadowDy: number;
    shadowColor: string;
    shadowOpacity: number;

    transFont: string;
    transSize: number;
    transLine: number;
    transColor: string;
    refSize: number;
    refColor: string;

    padPct: number;
    /** Kept for designs saved before `frameStyle` existed. */
    borderOn: boolean;
    frameStyle?: FrameStyle;

    bgMode: 'plain' | 'manuscript' | 'pattern' | 'combo';
    baseColor: string;
    patternId: string;
    patternColor: string;
    patternOpacity: number;
    patternScale: number;
    patternStroke: number;

    bgOpacity: number;
    bgZoom: number;
    bgOffsetX: number;
    bgOffsetY: number;
    bgBlur: number;
    bgGray: boolean;

    gradientId: string;
    gradientDir: string;
    gradientOpacity: number;
    gradientBlend: string;

    /** Which folio was on the card, so it can be fetched again on restore. */
    manuscriptId: number | null;
    manuscriptFolio: number;

    savedAt: number;
}

const STORAGE_KEY = 'postcardDesign';

function readSaved(): PostcardDesign | null {
    if (!browser) return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as PostcardDesign) : null;
    } catch {
        return null;
    }
}

export const savedPostcardDesign = writable<PostcardDesign | null>(readSaved());

savedPostcardDesign.subscribe((design) => {
    if (!browser) return;
    try {
        if (design) localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // A full or disabled storage should not break the editor.
    }
});

/**
 * `new` seeds the card from whatever the Parchment view is showing; `resume`
 * reopens the last design untouched.
 */
export type PostcardOpenMode = 'new' | 'resume';

export const postcardOpenMode = writable<PostcardOpenMode>('new');

/** Label of the editor's own OS window. */
export const POSTCARD_WINDOW = 'postcard';

/**
 * The editor runs in a window of its own so it behaves like a native document
 * window — its own entry in the dock/taskbar, its own place on screen, and it
 * stays put while you keep reading in the main window.
 *
 * Seed state rides on the query string rather than a store, because the new
 * window boots a fresh JS context that shares no memory with this one. The
 * saved design travels the other way through localStorage, which every window
 * on the origin shares.
 */
async function openPostcardWindow(mode: PostcardOpenMode): Promise<boolean> {
    if (!browser) return false;

    const quran = await import('./quran.svelte');
    const params = new URLSearchParams({ mode });
    const surah = get(quran.selectedSurahIdx);
    if (surah) params.set('surah', String(surah));
    const ayahs = get(quran.morphologyAyahFilter);
    if (ayahs?.length) params.set('ayahs', ayahs.join(','));

    return openAppWindow({
        label: POSTCARD_WINDOW,
        url: `/postcard/?${params}`,
        title: 'Postcard',
        width: 1160,
        height: 820,
        minWidth: 900,
        minHeight: 620,
    });
}

export async function openPostcard(mode: PostcardOpenMode) {
    postcardOpenMode.set(mode);
    if (await openPostcardWindow(mode)) return;
    // Fallback: the floating panel inside the main window.
    postcardDialogOpen.set(true);
}

/**
 * Keep `savedPostcardDesign` current when the editor window writes a new design.
 * Storage events only fire in *other* windows on the origin, which is exactly
 * the direction we need: the main window learns what the editor saved.
 */
if (browser) {
    window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY) return;
        try {
            savedPostcardDesign.set(
                e.newValue ? (JSON.parse(e.newValue) as PostcardDesign) : null,
            );
        } catch {
            // A malformed write is not worth tearing the store down over.
        }
    });
}
