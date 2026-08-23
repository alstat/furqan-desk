import { derived, get, writable, type Readable } from 'svelte/store';
import {
    activeTafsirId,
    activeTranslatorId,
    multiSurahTafsirMap,
    multiSurahTranslationMap,
    surahTafsir,
    surahTranslation,
    tafsirDialogOpen,
    tafsirPanelOpen,
    translationDialogOpen,
    translationPanelOpen,
    type AyahTranslation,
} from './translation.store';
import { morphologyMultiSurahList, selectedSurahIdx } from './quran.svelte';

/**
 * The translation and tafsir readers show state the *main* window computes:
 * MorphologyView's effects fill `surahTranslation` / `surahTafsir` and their
 * multi-surah maps as the reader navigates. A window of their own boots with an
 * empty store and no MorphologyView to fill it, and cannot rebuild the view for
 * itself the way the manuscript viewer can.
 *
 * So the main window ships the finished view — the sections it has already
 * derived — and the reader window renders it. Names (surah, translator, author)
 * are resolved locally from lists the window loads itself, so only the text
 * crosses.
 */

export interface ReaderSection<Entry> {
    surah: number;
    entries: Entry[];
}

export interface ReaderSnapshot<Entry> {
    /** Surah the single-surah view is showing. */
    surah: number;
    isMulti: boolean;
    sections: ReaderSection<Entry>[];
}

export type TranslationEntry = AyahTranslation;
export type TafsirEntry = { ayah: number; text: string };

export type TranslationSnapshot = ReaderSnapshot<TranslationEntry>;
export type TafsirSnapshot = ReaderSnapshot<TafsirEntry>;

/** What a reader window renders. Filled from the host's broadcast. */
export const translationSnapshot = writable<TranslationSnapshot | null>(null);
export const tafsirSnapshot = writable<TafsirSnapshot | null>(null);

const TRANSLATION_EVENT = 'reader:translation';
const TAFSIR_EVENT = 'reader:tafsir';
const REQUEST_EVENT = 'reader:request';
/** A reader window announcing that it is going away. */
const CLOSED_EVENT = 'reader:closed';

export type ReaderKind = 'translation' | 'tafsir';

const OPEN_FLAGS: Record<ReaderKind, typeof translationDialogOpen> = {
    translation: translationDialogOpen,
    tafsir: tafsirDialogOpen,
};

const WINDOW_LABELS: Record<ReaderKind, string> = {
    translation: 'translation',
    tafsir: 'tafsir',
};

export const TRANSLATION_WINDOW = 'translation';
export const TAFSIR_WINDOW = 'tafsir';

// ── Deriving the view, once, where the data lives ─────────────────────────────

const translationView: Readable<TranslationSnapshot> = derived(
    [
        selectedSurahIdx,
        morphologyMultiSurahList,
        multiSurahTranslationMap,
        surahTranslation,
        activeTranslatorId,
    ],
    ([surah, list, multiMap, single]) => {
        if (list && list.length > 0 && multiMap) {
            return {
                surah,
                isMulti: list.length > 1,
                sections: list.map((s) => {
                    const m = multiMap.get(s.surah);
                    return {
                        surah: s.surah,
                        entries: m
                            ? [...m.values()].sort((a, b) => a.ayah - b.ayah)
                            : [],
                    };
                }),
            };
        }
        return {
            surah,
            isMulti: false,
            sections:
                single && single.length > 0
                    ? [{ surah, entries: single }]
                    : [],
        };
    },
);

const tafsirView: Readable<TafsirSnapshot> = derived(
    [
        selectedSurahIdx,
        morphologyMultiSurahList,
        multiSurahTafsirMap,
        surahTafsir,
        activeTafsirId,
    ],
    ([surah, list, multiMap, single]) => {
        if (list && list.length > 0 && multiMap) {
            return {
                surah,
                isMulti: list.length > 1,
                sections: list.map((s) => {
                    const m = multiMap.get(s.surah);
                    return {
                        surah: s.surah,
                        entries: m
                            ? [...m.entries()]
                                  .sort((a, b) => a[0] - b[0])
                                  .map(([ayah, text]) => ({ ayah, text }))
                            : [],
                    };
                }),
            };
        }
        return {
            surah,
            isMulti: false,
            sections:
                single && single.length > 0
                    ? [
                          {
                              surah,
                              entries: single.map((r) => ({
                                  ayah: r.ayah,
                                  text: r.text,
                              })),
                          },
                      ]
                    : [],
        };
    },
);

let hostInstalled = false;

/**
 * Broadcast the derived views to any reader window, and answer a window that
 * has just opened and is asking for the current one. Call from the main window.
 */
export async function installReaderSnapshotHost(): Promise<void> {
    if (hostInstalled || typeof window === 'undefined') return;
    hostInstalled = true;
    try {
        const { emit, listen } = await import('@tauri-apps/api/event');

        translationView.subscribe((v) => void emit(TRANSLATION_EVENT, v));
        tafsirView.subscribe((v) => void emit(TAFSIR_EVENT, v));

        await listen(REQUEST_EVENT, () => {
            void emit(TRANSLATION_EVENT, get(translationView));
            void emit(TAFSIR_EVENT, get(tafsirView));
        });

        // A closing reader says so itself. `tauri://destroyed` alone proved
        // unreliable from the window that did the creating, and a flag left
        // stuck true keeps the parchment hiding its inline copy forever.
        await listen<{ kind: ReaderKind }>(CLOSED_EVENT, (e) => {
            OPEN_FLAGS[e.payload.kind]?.set(false);
        });

        // Belt and braces: whenever this window comes back to the foreground,
        // reconcile the flags against which reader windows actually exist. Any
        // close this missed is corrected the moment the user looks at the
        // parchment again.
        window.addEventListener('focus', () => void reconcileReaderFlags());
        void reconcileReaderFlags();
    } catch {
        // Not running inside Tauri (browser dev) — nothing to broadcast to.
    }
}

/**
 * Set each flag from whether its window is actually open. Cheap, and the only
 * thing that can rescue a flag whose close notification went missing.
 */
export async function reconcileReaderFlags(): Promise<void> {
    try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        for (const kind of ['translation', 'tafsir'] as ReaderKind[]) {
            const win = await WebviewWindow.getByLabel(WINDOW_LABELS[kind]);
            if (!win) OPEN_FLAGS[kind].set(false);
        }
    } catch {
        /* not inside Tauri */
    }
}

/** Announce from a reader window that it is closing. */
export async function notifyReaderClosed(kind: ReaderKind): Promise<void> {
    try {
        const { emit } = await import('@tauri-apps/api/event');
        await emit(CLOSED_EVENT, { kind });
    } catch {
        /* not inside Tauri */
    }
}

/** Receive broadcasts and ask for the current view. Call from a reader window. */
export async function installReaderSnapshotClient(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const { emit, listen } = await import('@tauri-apps/api/event');
        await listen<TranslationSnapshot>(TRANSLATION_EVENT, (e) =>
            translationSnapshot.set(e.payload),
        );
        await listen<TafsirSnapshot>(TAFSIR_EVENT, (e) =>
            tafsirSnapshot.set(e.payload),
        );
        await emit(REQUEST_EVENT, null);
    } catch {
        /* not inside Tauri */
    }
}

// ── The windows ───────────────────────────────────────────────────────────────

/**
 * `translationDialogOpen` / `tafsirDialogOpen` do double duty: MorphologyView
 * reads them to *suppress* the inline copy in the parchment while the reader is
 * up. So the flag has to follow the window's lifetime, or the same text shows
 * twice.
 */
async function openReaderWindow(
    label: string,
    route: string,
    title: string,
    openFlag: typeof translationDialogOpen,
): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

        const existing = await WebviewWindow.getByLabel(label);
        if (existing) {
            await existing.unminimize().catch(() => {});
            await existing.setFocus();
            openFlag.set(true);
            return true;
        }

        // Frameless: the reader's own header doubles as the title bar, the same
        // trade the main window makes. macOS keeps its traffic lights by
        // overlaying them on that header; Windows and Linux have no equivalent,
        // so they go undecorated and the header draws its own controls.
        const isMac = navigator.userAgent.includes('Mac');
        const chrome = isMac
            ? { titleBarStyle: 'overlay' as const, hiddenTitle: true }
            : { decorations: false };

        const win = new WebviewWindow(label, {
            // Trailing slash: the build emits `<route>/index.html`, which is
            // what Tauri's asset protocol resolves this path to.
            url: `/${route}/`,
            title,
            width: 720,
            height: 780,
            minWidth: 480,
            minHeight: 420,
            resizable: true,
            focus: true,
            ...chrome,
        });

        return await new Promise<boolean>((resolve) => {
            let settled = false;
            const settle = (ok: boolean) => {
                if (settled) return;
                settled = true;
                resolve(ok);
            };
            void win.once('tauri://created', () => {
                openFlag.set(true);
                settle(true);
            });
            void win.once('tauri://error', (e) => {
                console.error(`${label} window failed to open`, e);
                settle(false);
            });
            // The parchment must stop hiding its inline copy the moment the
            // reader goes away.
            void win.once('tauri://destroyed', () => openFlag.set(false));
            setTimeout(() => settle(false), 4000);
        });
    } catch {
        return false;
    }
}

/** Open the translation reader, or focus it if it is already open. */
export async function openTranslationReader(): Promise<void> {
    const opened = await openReaderWindow(
        TRANSLATION_WINDOW,
        'translation',
        'Translation',
        translationDialogOpen,
    );
    // Fallback: the floating panel inside the main window. Only this path
    // mounts it — with a window up the panel would duplicate it.
    if (!opened) {
        translationPanelOpen.set(true);
        translationDialogOpen.set(true);
    }
}

/** Open the tafsir reader, or focus it if it is already open. */
export async function openTafsirReader(): Promise<void> {
    const opened = await openReaderWindow(
        TAFSIR_WINDOW,
        'tafsir',
        'Tafsir',
        tafsirDialogOpen,
    );
    if (!opened) {
        tafsirPanelOpen.set(true);
        tafsirDialogOpen.set(true);
    }
}
