import { get, writable } from 'svelte/store';
import { browser } from '$app/environment';

export const manuscriptsEnabled = writable<boolean>(true);

export const manuscriptViewerOpen = writable(false);
export const manuscriptDemoOpen = writable(false);
export const manuscriptAyah = writable<{ surah: number; ayah: number } | null>(null);

/**
 * Payload the viewer window hands the main window to insert into the editor.
 * The Lexical editor is a live object in the main window's memory, so a viewer
 * running in its own window cannot dispatch to it directly — it ships the
 * finished image and caption instead.
 */
export interface ManuscriptInsertRequest {
    src: string;
    altText: string;
    captionText: string;
    /** Absent when the folio has no Corpus Coranicum page to link to. */
    linkUrl?: string;
}

const INSERT_EVENT = 'manuscript:insert';
const EDITOR_STATE_EVENT = 'manuscript:editor-available';
const EDITOR_STATE_REQUEST = 'manuscript:editor-available-request';

/**
 * Whether the main window currently has a Lexical editor to insert into. The
 * viewer window mirrors it so its Insert button can be disabled for the same
 * reason it always was, rather than because the editor is simply out of reach.
 */
export const lexicalEditorAvailable = writable(false);

/** Label of the viewer's own OS window. */
export const MANUSCRIPT_WINDOW = 'manuscripts';

/**
 * The viewer runs in a window of its own so it behaves like a native document
 * window — its own entry in the dock/taskbar, its own place on screen, and it
 * stays put while you keep reading in the main window.
 *
 * Which ayah to show rides on the query string, because the new window boots a
 * fresh JS context that shares no memory with this one.
 */
async function openManuscriptWindow(): Promise<boolean> {
    if (!browser) return false;
    try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

        const existing = await WebviewWindow.getByLabel(MANUSCRIPT_WINDOW);
        if (existing) {
            // Already open: point it at the new ayah rather than starting over.
            await existing.unminimize().catch(() => {});
            await existing.setFocus();
            const ref = get(manuscriptAyah);
            if (ref) await existing.emit('manuscript-ayah', ref);
            return true;
        }

        const params = new URLSearchParams();
        const ref = get(manuscriptAyah);
        if (ref) {
            params.set('surah', String(ref.surah));
            params.set('ayah', String(ref.ayah));
        }

        // Frameless: the viewer's own header doubles as the title bar, the same
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

        const win = new WebviewWindow(MANUSCRIPT_WINDOW, {
            // Trailing slash: the build emits `manuscripts/index.html`, which is
            // what Tauri's asset protocol resolves this path to.
            url: `/manuscripts/?${params}`,
            title: 'Manuscripts',
            width: 1100,
            height: 800,
            minWidth: 820,
            minHeight: 600,
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
                console.error('manuscript window failed to open', e);
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

/**
 * Main window: answer the viewer's insert requests by dispatching into the
 * live Lexical editor, and keep the viewer told whether there is one.
 */
export async function installManuscriptInsertHost(): Promise<void> {
    if (!browser) return;
    try {
        const [{ emit, listen }, editorStore, commands] = await Promise.all([
            import('@tauri-apps/api/event'),
            import('./editor.store'),
            import(
                '$lib/components/lexical/core/plugins/Image/ImagePlugin.svelte'
            ),
        ]);

        const publish = (available: boolean) =>
            void emit(EDITOR_STATE_EVENT, available);

        editorStore.lexicalEditorInstance.subscribe((editor) => {
            lexicalEditorAvailable.set(!!editor);
            publish(!!editor);
        });
        await listen(EDITOR_STATE_REQUEST, () =>
            publish(!!get(editorStore.lexicalEditorInstance)),
        );

        await listen<ManuscriptInsertRequest>(INSERT_EVENT, (e) => {
            const editor = get(editorStore.lexicalEditorInstance);
            if (!editor) return;
            editor.dispatchCommand(commands.INSERT_IMAGE_COMMAND, e.payload);
        });
    } catch (err) {
        console.error('manuscript insert host failed', err);
    }
}

/** Viewer window: mirror editor availability and send insert requests. */
export async function installManuscriptInsertClient(): Promise<() => void> {
    if (!browser) return () => {};
    try {
        const { emit, listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<boolean>(EDITOR_STATE_EVENT, (e) =>
            lexicalEditorAvailable.set(e.payload),
        );
        await emit(EDITOR_STATE_REQUEST, null);
        return unlisten;
    } catch {
        return () => {};
    }
}

/** Ask the main window to insert this image into its editor. */
export async function requestManuscriptInsert(
    payload: ManuscriptInsertRequest,
): Promise<void> {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(INSERT_EVENT, payload);
}

/**
 * Show the manuscripts for an ayah, or for whatever `manuscriptAyah` already
 * holds when called without one.
 */
export async function openManuscriptViewer(ref?: { surah: number; ayah: number }) {
    if (ref) manuscriptAyah.set(ref);
    if (await openManuscriptWindow()) return;
    // Fallback: the floating panel inside the main window.
    manuscriptViewerOpen.set(true);
}
