import { writable, derived, type Writable } from "svelte/store";
import type { LexicalEditor } from "lexical";
import type { HistoryState } from "@lexical/history";
import type { EditorView } from "@codemirror/view";
import { activeTab } from "./tabs.store";

// ── Editor theme (Ayu Light / Ayu Mirage) ────────────────────────────────────

export type EditorTheme = "ayu-light" | "ayu-mirage";

// ── CodeMirror font size ──────────────────────────────────────────────────────

function loadCmFontSize(): number {
  try {
    const v = localStorage.getItem("cm-font-size");
    if (v) {
      const n = parseInt(v, 10);
      if (n >= 10 && n <= 24) return n;
    }
  } catch {
    /* ignore */
  }
  return 13;
}

const _cmFontSize = writable<number>(loadCmFontSize());

export const cmFontSize = {
  subscribe: _cmFontSize.subscribe,
  set(v: number) {
    const clamped = Math.max(10, Math.min(24, v));
    try {
      localStorage.setItem("cm-font-size", String(clamped));
    } catch {
      /* ignore */
    }
    _cmFontSize.set(clamped);
  },
};

// ── App dark mode ─────────────────────────────────────────────────────────────

function loadAppDarkMode(): boolean {
  try {
    const stored = localStorage.getItem("app-dark-mode");
    if (stored !== null) return stored === "true";
  } catch {
    /* ignore */
  }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    /* ignore */
  }
  return false;
}

const _appDarkMode = writable<boolean>(loadAppDarkMode());

export const appDarkMode = {
  subscribe: _appDarkMode.subscribe,
  set(v: boolean) {
    try {
      localStorage.setItem("app-dark-mode", String(v));
    } catch {
      /* ignore */
    }
    _appDarkMode.set(v);
  },
};

function loadTheme(): EditorTheme {
  try {
    const v = localStorage.getItem("editor-theme");
    if (v === "ayu-light" || v === "ayu-mirage") return v;
  } catch {
    /* ignore */
  }
  return "ayu-light";
}

const _editorTheme = writable<EditorTheme>(loadTheme());

export const editorTheme = {
  subscribe: _editorTheme.subscribe,
  set(v: EditorTheme) {
    try {
      localStorage.setItem("editor-theme", v);
    } catch {
      /* ignore */
    }
    _editorTheme.set(v);
  },
};

export interface ReplLine {
  text: string;
  kind: "input" | "output" | "error" | "warn";
}
/** Shared REPL output lines for all Julia tabs */
export const juliaReplHistory: Writable<ReplLine[]> = writable([]);
export const juliaReplStarted: Writable<boolean> = writable(false);

export const typstMode = derived(
  activeTab,
  ($t) => $t?.type === "typst" || $t?.type === "text",
);
export const juliaMode = derived(activeTab, ($t) => $t?.type === "julia");
export const typstSource: Writable<string> = writable("");
export const lexicalSnapshot: Writable<string | null> = writable(null);
export const lexicalEditorInstance: Writable<LexicalEditor | null> =
  writable(null);
export const lexicalHistoryState: Writable<HistoryState | null> =
  writable(null);
export const codeMirrorViewInstance: Writable<EditorView | null> =
  writable(null);
export const codeMirrorCanUndo: Writable<boolean> = writable(false);
export const codeMirrorCanRedo: Writable<boolean> = writable(false);
/** Increment to force TypstEditor to recompile without changing the source. */
export const typstRecompile: Writable<number> = writable(0);

// ── Julia plot output ─────────────────────────────────────────────────────────

export interface JuliaPlot {
  id: string;
  format: "png" | "svg";
  data: string; // base64-encoded image bytes
  timestamp: number;
}

export const juliaPlots: Writable<JuliaPlot[]> = writable([]);
export const juliaViewerOpen: Writable<boolean> = writable(false);
export const tocOpen: Writable<boolean> = writable(false);

/** Shared compile output — written by TypstEditor, read by TypstPreview. */
export const typstSvgPages: Writable<string[]> = writable([]);
export const typstCompileError: Writable<string> = writable("");
export const typstIsCompiling: Writable<boolean> = writable(false);
