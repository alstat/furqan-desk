import { get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { openAppWindow } from '$lib/utils/appWindow';

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
function openManuscriptWindow(): Promise<boolean> {
    const params = new URLSearchParams();
    const ref = get(manuscriptAyah);
    if (ref) {
        params.set('surah', String(ref.surah));
        params.set('ayah', String(ref.ayah));
    }

    return openAppWindow({
        label: MANUSCRIPT_WINDOW,
        url: `/manuscripts/?${params}`,
        title: 'Manuscripts',
        width: 1100,
        height: 800,
        minWidth: 820,
        minHeight: 600,
        // Already open: point it at the new ayah rather than starting over.
        onExisting: async (win) => {
            const current = get(manuscriptAyah);
            if (current) await win.emit('manuscript-ayah', current);
        },
    });
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
