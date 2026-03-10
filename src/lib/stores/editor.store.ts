import { writable, derived, type Writable } from 'svelte/store';
import type { LexicalEditor } from 'lexical';
import { activeTab } from './tabs.store';

// ── Editor theme (Ayu Light / Ayu Mirage) ────────────────────────────────────

export type EditorTheme = 'ayu-light' | 'ayu-mirage';

function loadTheme(): EditorTheme {
    try {
        const v = localStorage.getItem('editor-theme');
        if (v === 'ayu-light' || v === 'ayu-mirage') return v;
    } catch { /* ignore */ }
    return 'ayu-light';
}

const _editorTheme = writable<EditorTheme>(loadTheme());

export const editorTheme = {
    subscribe: _editorTheme.subscribe,
    set(v: EditorTheme) {
        try { localStorage.setItem('editor-theme', v); } catch { /* ignore */ }
        _editorTheme.set(v);
    },
};

export interface ReplLine { text: string; kind: 'input' | 'output' | 'error' }
export const juliaReplHistory = new Map<string, ReplLine[]>();
export const juliaReplStarted: Writable<boolean> = writable(false);

export const typstMode = derived(activeTab, $t => $t?.type === 'typst' || $t?.type === 'text');
export const typstSource:           Writable<string>             = writable('');
export const lexicalSnapshot:       Writable<string | null>      = writable(null);
export const lexicalEditorInstance: Writable<LexicalEditor | null> = writable(null);
/** Increment to force TypstEditor to recompile without changing the source. */
export const typstRecompile:        Writable<number>             = writable(0);

/** Shared compile output — written by TypstEditor, read by TypstPreview. */
export const typstSvgPages:     Writable<string[]> = writable([]);
export const typstCompileError: Writable<string>   = writable('');
export const typstIsCompiling:  Writable<boolean>  = writable(false);
