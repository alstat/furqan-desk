import { get, writable } from 'svelte/store';
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
    try {
        const [{ WebviewWindow }, quran] = await Promise.all([
            import('@tauri-apps/api/webviewWindow'),
            import('./quran.svelte'),
        ]);

        const existing = await WebviewWindow.getByLabel(POSTCARD_WINDOW);
        if (existing) {
            // Already open: bring it forward rather than starting over, so a
            // half-finished card is never thrown away by a stray click.
            await existing.unminimize().catch(() => {});
            await existing.setFocus();
            return true;
        }

        const params = new URLSearchParams({ mode });
        const surah = get(quran.selectedSurahIdx);
        if (surah) params.set('surah', String(surah));
        const ayahs = get(quran.morphologyAyahFilter);
        if (ayahs?.length) params.set('ayahs', ayahs.join(','));

        // Frameless: the editor's own header doubles as the title bar, the same
        // trade the main window makes. macOS keeps its traffic lights by
        // overlaying them on that header; Windows and Linux have no equivalent,
        // so they go undecorated and the header draws its own controls.
        const isMac = navigator.userAgent.includes('Mac');
        // Linux goes transparent as well as undecorated: the frame is drawn in
        // CSS, and its drop shadow needs the margin around it to be genuinely
        // see-through (see `.csd-dialog` in app.css). Windows keeps an opaque
        // frame — it has no such shadow to cast.
        const isLinux =
            navigator.userAgent.includes('Linux') &&
            !navigator.userAgent.includes('Android');
        const chrome = isMac
            ? { titleBarStyle: 'overlay' as const, hiddenTitle: true }
            : { decorations: false, transparent: isLinux };

        const win = new WebviewWindow(POSTCARD_WINDOW, {
            // Trailing slash: the build emits `postcard/index.html`, which is
            // what Tauri's asset protocol resolves this path to.
            url: `/postcard/?${params}`,
            title: 'Postcard',
            width: 1160,
            height: 820,
            minWidth: 900,
            minHeight: 620,
            resizable: true,
            focus: true,
            ...chrome,
        });

        // Creation is asynchronous on the Rust side; a failure arrives here
        // rather than as a rejected constructor.
        return await new Promise<boolean>((resolve) => {
            let settled = false;
            const settle = (ok: boolean) => {
                if (settled) return;
                settled = true;
                resolve(ok);
            };
            void win.once('tauri://created', () => settle(true));
            void win.once('tauri://error', (e) => {
                console.error('postcard window failed to open', e);
                settle(false);
            });
            // Never leave the button dead if neither event arrives.
            setTimeout(() => settle(false), 4000);
        });
    } catch {
        // Not running inside Tauri (browser dev), or the webview API is
        // unavailable — the caller falls back to the in-app panel.
        return false;
    }
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
