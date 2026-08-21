import type { LexicalEditor } from 'lexical';
import { get } from 'svelte/store';
import { tabs } from '$lib/stores/tabs.store';

/**
 * How long typing must pause before the document is written back to its tab.
 *
 * `tab.content` for a Lexical file is not what gets saved — `saveTab` reads the
 * live editor. It exists so the document survives hot exit and so the editor can
 * be re-seeded when it remounts. Neither needs to be current to the keystroke,
 * which is what makes a debounce free of consequence here.
 */
const CONTENT_SYNC_MS = 400;

/**
 * Mirror a Lexical editor's document into a tab that is *not* the active one.
 *
 * Only the split layouts need this. Normally the editor shows the active tab and
 * `saveTab` reads the editor directly, so nothing serializes while typing. In a
 * cross-group split the editor holds one tab while another is active, so its
 * content has to be pushed into the store instead.
 *
 * The dirty flag is set immediately — it drives the `*` in the tab strip and
 * must not lag behind the keystroke — but the document itself is written on a
 * pause. Writing it per keystroke meant a `toJSON()` walk plus a `stringify` of
 * the whole document (~2 ms at 800 KB), and, more expensively, a `tabs.update`
 * that rebuilt the tab array and woke every `$tabs` subscriber in the app on
 * every character typed.
 *
 * The returned disposer flushes, so switching tabs or dissolving the split
 * cannot drop the last few hundred milliseconds of typing.
 */
export function syncLexicalEditorToTab(
    editor: LexicalEditor,
    tabId: string,
): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;

    const writeContent = (): void => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        if (!pending) return;
        pending = false;
        const json = JSON.stringify(editor.getEditorState().toJSON());
        tabs.update((ts) =>
            ts.map((t) => (t.id === tabId ? { ...t, content: json, isDirty: true } : t)),
        );
    };

    const markDirty = (): void => {
        // Already dirty — skip the store write, or this reintroduces exactly the
        // per-keystroke churn the debounce exists to remove.
        const current = get(tabs).find((t) => t.id === tabId);
        if (!current || current.isDirty) return;
        tabs.update((ts) =>
            ts.map((t) => (t.id === tabId ? { ...t, isDirty: true } : t)),
        );
    };

    const unregister = editor.registerUpdateListener(
        ({ dirtyElements, dirtyLeaves, tags }) => {
            if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
            // Programmatic loads (file open, tab switch, cross-group seeding)
            // carry this tag; they are not user edits and must not mark dirty.
            if (tags.has('history-merge')) return;

            markDirty();
            pending = true;
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(writeContent, CONTENT_SYNC_MS);
        },
    );

    // Quitting does not unmount components, so the disposer below never runs on
    // app close. Without this, hot exit could persist a document up to one
    // debounce window stale.
    const flushOnExit = () => writeContent();
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', flushOnExit);
    }

    return () => {
        unregister();
        if (typeof window !== 'undefined') {
            window.removeEventListener('beforeunload', flushOnExit);
        }
        writeContent();
    };
}
