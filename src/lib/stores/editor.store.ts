import { writable, derived, get, type Writable } from "svelte/store";
import type { LexicalEditor } from "lexical";
import type { HistoryState } from "@lexical/history";
import type { EditorView } from "@codemirror/view";
import { activeTab } from "./tabs.store";

// ── Page Width ────────────────────────────────────────
function loadSinglePageMargin(): number {
  try {
    const v = localStorage.getItem("single-page-margin");
    if (v) {
      const n = parseInt(v, 10);
      if (n >= 5 && n <= 12) return n;
    }
  } catch {
    /* ignore */
  }
  return 6;
}
const _singlePageMargin = writable<number>(loadSinglePageMargin());
export const singlePageMargin = {
  subscribe: _singlePageMargin.subscribe,
  set(v: number) {
    const clamped = Math.max(5, Math.min(12, v));
    try {
      localStorage.setItem("single-page-margin", String(clamped));
    } catch {
      /* ignore */
    }
    _singlePageMargin.set(clamped);
  },
};

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

function loadTypstPreviewDarkMode(): boolean {
  try {
    const v = localStorage.getItem("typst-preview-dark-mode");
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {
    /* ignore */
  }
  return false;
}

const _typstPreviewDarkMode = writable<boolean>(loadTypstPreviewDarkMode());

export const typstPreviewDarkMode = {
  subscribe: _typstPreviewDarkMode.subscribe,
  set(v: boolean) {
    try {
      localStorage.setItem("typst-preview-dark-mode", String(v));
    } catch {
      /* ignore */
    }
    _typstPreviewDarkMode.set(v);
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

// ── Custom editor font families ───────────────────────────────────────────────

const CUSTOM_FONT_FAMILIES_KEY = "custom-font-families";

function normalizeCustomFontFamilies(fonts: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of fonts) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(name);
  }

  return normalized;
}

function loadCustomFontFamilies(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_FONT_FAMILIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return normalizeCustomFontFamilies(
        parsed.filter((value): value is string => typeof value === "string"),
      );
    }
  } catch {
    /* ignore */
  }
  return [];
}

function persistCustomFontFamilies(fonts: string[]): void {
  try {
    localStorage.setItem(CUSTOM_FONT_FAMILIES_KEY, JSON.stringify(fonts));
  } catch {
    /* ignore */
  }
}

const _customFontFamilies = writable<string[]>(loadCustomFontFamilies());

function setCustomFontFamilies(fonts: string[]): void {
  const normalized = normalizeCustomFontFamilies(fonts);
  persistCustomFontFamilies(normalized);
  _customFontFamilies.set(normalized);
}

export const customFontFamilies = {
  subscribe: _customFontFamilies.subscribe,
  set: setCustomFontFamilies,
};

export type CustomFontAddResult = "added" | "empty" | "duplicate";

export function addCustomFontFamily(name: string): CustomFontAddResult {
  const trimmed = name.trim();
  if (!trimmed) return "empty";

  const exists = get(_customFontFamilies).some(
    (font) => font.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
  );
  if (exists) return "duplicate";

  setCustomFontFamilies([...get(_customFontFamilies), trimmed]);
  return "added";
}

export function removeCustomFontFamily(name: string): void {
  setCustomFontFamilies(
    get(_customFontFamilies).filter((font) => font !== name),
  );
}

export function resetCustomFontFamilies(): void {
  setCustomFontFamilies([]);
}

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

// ── Zen Mode ──────────────────────────────────────────────────────────────────

function loadZenMode(): boolean {
  try {
    const v = localStorage.getItem("zen-mode");
    if (v !== null) return v === "true";
  } catch {
    /* ignore */
  }
  return false;
}
const _zenMode = writable<boolean>(loadZenMode());
export const zenMode = {
  subscribe: _zenMode.subscribe,
  set(v: boolean) {
    try {
      localStorage.setItem("zen-mode", String(v));
    } catch {
      /* ignore */
    }
    _zenMode.set(v);
  },
};

// ── Zen Peek (transient press-and-hold to reveal hidden icons) ────────────────
export const zenPeek = writable<boolean>(false);

// ── TOC button anchor rect (set on click so the panel tracks the button) ─────
export const tocAnchorRect = writable<DOMRect | null>(null);

/** Shared compile output — written by TypstEditor, read by TypstPreview. */
export const typstSvgPages: Writable<string[]> = writable([]);
export const typstCompileError: Writable<string> = writable("");
export const typstIsCompiling: Writable<boolean> = writable(false);
