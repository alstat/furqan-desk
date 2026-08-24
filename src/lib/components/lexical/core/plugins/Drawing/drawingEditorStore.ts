import { writable } from 'svelte/store';
import { openAppWindow } from '$lib/utils/appWindow';
import type { Scene } from './drawingScene.js';

// The DrawingEditorDialog registers its `open` handler here on mount so any
// DrawingComponent can reopen the (single, shared) editor when its drawing is
// double-clicked. `scene`/`nodeKey` null → a fresh "Insert drawing".
export type OpenDrawingEditor = (scene: Scene | null, nodeKey: string | null) => void;

export const openDrawingEditor = writable<OpenDrawingEditor | null>(null);

/** Label of the drawing editor's own OS window. */
export const DRAWING_WINDOW = 'drawing';

/**
 * What the editor is opened on. `nodeKey` null means "insert a new drawing"
 * rather than "update this one".
 */
export interface DrawingSeed {
    scene: Scene | null;
    nodeKey: string | null;
}

/** What comes back when the user confirms. */
export interface DrawingResult {
    scene: Scene;
    width: number;
    height: number;
    nodeKey: string | null;
}

/**
 * The seed waits in localStorage rather than riding an event: the window may
 * still be booting when it is handed over, and a scene is arbitrarily large.
 * Every window on the origin shares this, and the editor clears the key once it
 * has read it.
 */
const SEED_KEY = 'drawingEditorSeed';
const SEED_EVENT = 'drawing:seed';
const SAVE_EVENT = 'drawing:save';

/** Leave a seed for the editor window, replacing whatever was there. */
function stashSeed(seed: DrawingSeed): void {
    try {
        localStorage.setItem(SEED_KEY, JSON.stringify(seed));
    } catch {
        // Storage full or disabled; the editor opens on an empty scene, which
        // is wrong but not broken.
    }
}

/** Take the waiting seed, clearing it so it is used once. */
export function takeDrawingSeed(): DrawingSeed | null {
    try {
        const raw = localStorage.getItem(SEED_KEY);
        if (!raw) return null;
        localStorage.removeItem(SEED_KEY);
        return JSON.parse(raw) as DrawingSeed;
    } catch {
        return null;
    }
}

/**
 * The editor runs in a window of its own so a drawing can be worked on beside
 * the document rather than on top of it.
 *
 * Unlike the other secondary windows, this one has to hand something *back*:
 * the finished scene is dispatched into the Lexical editor, which is a live
 * object in the main window's memory. So the window emits the result and the
 * main window commits it (see installDrawingSaveHost).
 */
async function openDrawingWindow(seed: DrawingSeed): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    stashSeed(seed);

    return openAppWindow({
        label: DRAWING_WINDOW,
        url: '/drawing/',
        title: 'Drawing',
        width: 1100,
        height: 760,
        minWidth: 720,
        minHeight: 520,
        // Already open: point it at this drawing instead of opening a second
        // editor over the top of it. The seed is already stashed above; this
        // just tells the window to pick it up.
        onExisting: async () => {
            const { emit } = await import('@tauri-apps/api/event');
            await emit(SEED_EVENT, null);
        },
    });
}

/**
 * Open the drawing editor on `scene`. Prefers a window of its own and falls
 * back to the in-app panel the toolbar registered.
 */
export async function launchDrawingEditor(
    scene: Scene | null,
    nodeKey: string | null,
    fallback: OpenDrawingEditor | null,
): Promise<void> {
    if (await openDrawingWindow({ scene, nodeKey })) return;
    fallback?.(scene, nodeKey);
}

/** Editor window: pick up a new seed pushed while it was already open. */
export async function onDrawingSeed(handler: () => void): Promise<() => void> {
    try {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen(SEED_EVENT, () => handler());
    } catch {
        return () => {};
    }
}

/** Editor window: hand the finished drawing back to the main window. */
export async function submitDrawing(result: DrawingResult): Promise<void> {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(SAVE_EVENT, result);
}

/**
 * Main window: commit drawings the editor window sends back. The Lexical
 * commands only exist here, where the editor does.
 */
export async function installDrawingSaveHost(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const [{ listen }, { get }, editorStore, plugin] = await Promise.all([
            import('@tauri-apps/api/event'),
            import('svelte/store'),
            import('$lib/stores/editor.store'),
            import('./DrawingPlugin.svelte'),
        ]);

        await listen<DrawingResult>(SAVE_EVENT, (e) => {
            const editor = get(editorStore.lexicalEditorInstance);
            if (!editor) return;
            const { scene, width, height, nodeKey } = e.payload;
            if (nodeKey) {
                editor.dispatchCommand(plugin.UPDATE_DRAWING_COMMAND, {
                    nodeKey,
                    scene,
                    width,
                    height,
                });
            } else {
                editor.dispatchCommand(plugin.INSERT_DRAWING_COMMAND, {
                    scene,
                    width,
                    height,
                });
            }
        });
    } catch (err) {
        console.error('drawing save host failed', err);
    }
}
