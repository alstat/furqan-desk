import { writable } from 'svelte/store';
import { browser } from '$app/environment';

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
    borderOn: boolean;

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

export function openPostcard(mode: PostcardOpenMode) {
    postcardOpenMode.set(mode);
    postcardDialogOpen.set(true);
}
