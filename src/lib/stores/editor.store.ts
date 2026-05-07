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

// ── Tafsir display preferences ────────────────────────────────────────────────

const TAFSIR_FONT_SIZE_KEY = "tafsir-font-size";
const TAFSIR_FONT_FAMILY_KEY = "tafsir-font-family";
const TAFSIR_LINE_SPACING_KEY = "tafsir-line-spacing";
const TAFSIR_FONT_SIZE_MIN = 10;
const TAFSIR_FONT_SIZE_MAX = 28;
const TAFSIR_FONT_SIZE_DEFAULT = 13;
const TAFSIR_LINE_SPACING_MIN = 1.1;
const TAFSIR_LINE_SPACING_MAX = 2.4;
const TAFSIR_LINE_SPACING_DEFAULT = 1.6;

function loadTafsirFontSize(): number {
  try {
    const v = localStorage.getItem(TAFSIR_FONT_SIZE_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= TAFSIR_FONT_SIZE_MIN && n <= TAFSIR_FONT_SIZE_MAX) return n;
    }
  } catch {
    /* ignore */
  }
  return TAFSIR_FONT_SIZE_DEFAULT;
}

const _tafsirFontSize = writable<number>(loadTafsirFontSize());

export const tafsirFontSize = {
  subscribe: _tafsirFontSize.subscribe,
  set(v: number) {
    const clamped = Math.max(
      TAFSIR_FONT_SIZE_MIN,
      Math.min(TAFSIR_FONT_SIZE_MAX, Math.round(v)),
    );
    try {
      localStorage.setItem(TAFSIR_FONT_SIZE_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    _tafsirFontSize.set(clamped);
  },
};

export const TAFSIR_FONT_SIZE_BOUNDS = {
  min: TAFSIR_FONT_SIZE_MIN,
  max: TAFSIR_FONT_SIZE_MAX,
  default: TAFSIR_FONT_SIZE_DEFAULT,
};

function loadTafsirFontFamily(): string {
  try {
    const v = localStorage.getItem(TAFSIR_FONT_FAMILY_KEY);
    if (typeof v === "string") return v;
  } catch {
    /* ignore */
  }
  return "";
}

const _tafsirFontFamily = writable<string>(loadTafsirFontFamily());

export const tafsirFontFamily = {
  subscribe: _tafsirFontFamily.subscribe,
  set(v: string) {
    const trimmed = (v ?? "").trim();
    try {
      localStorage.setItem(TAFSIR_FONT_FAMILY_KEY, trimmed);
    } catch {
      /* ignore */
    }
    _tafsirFontFamily.set(trimmed);
  },
};

function loadTafsirLineSpacing(): number {
  try {
    const v = localStorage.getItem(TAFSIR_LINE_SPACING_KEY);
    if (v) {
      const n = parseFloat(v);
      if (n >= TAFSIR_LINE_SPACING_MIN && n <= TAFSIR_LINE_SPACING_MAX) {
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return TAFSIR_LINE_SPACING_DEFAULT;
}

const _tafsirLineSpacing = writable<number>(loadTafsirLineSpacing());

export const tafsirLineSpacing = {
  subscribe: _tafsirLineSpacing.subscribe,
  set(v: number) {
    const rounded = Math.round(v * 10) / 10;
    const clamped = Math.max(
      TAFSIR_LINE_SPACING_MIN,
      Math.min(TAFSIR_LINE_SPACING_MAX, rounded),
    );
    try {
      localStorage.setItem(TAFSIR_LINE_SPACING_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    _tafsirLineSpacing.set(clamped);
  },
};

export const TAFSIR_LINE_SPACING_BOUNDS = {
  min: TAFSIR_LINE_SPACING_MIN,
  max: TAFSIR_LINE_SPACING_MAX,
  default: TAFSIR_LINE_SPACING_DEFAULT,
};

// ── Translation display preferences ───────────────────────────────────────────

const TRANSLATION_FONT_SIZE_KEY = "translation-font-size";
const TRANSLATION_FONT_FAMILY_KEY = "translation-font-family";
const TRANSLATION_LINE_SPACING_KEY = "translation-line-spacing";
const TRANSLATION_FONT_SIZE_MIN = 10;
const TRANSLATION_FONT_SIZE_MAX = 28;
const TRANSLATION_FONT_SIZE_DEFAULT = 14;
const TRANSLATION_LINE_SPACING_MIN = 1.1;
const TRANSLATION_LINE_SPACING_MAX = 2.4;
const TRANSLATION_LINE_SPACING_DEFAULT = 1.6;

function loadTranslationFontSize(): number {
  try {
    const v = localStorage.getItem(TRANSLATION_FONT_SIZE_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= TRANSLATION_FONT_SIZE_MIN && n <= TRANSLATION_FONT_SIZE_MAX) {
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return TRANSLATION_FONT_SIZE_DEFAULT;
}

const _translationFontSize = writable<number>(loadTranslationFontSize());

export const translationFontSize = {
  subscribe: _translationFontSize.subscribe,
  set(v: number) {
    const clamped = Math.max(
      TRANSLATION_FONT_SIZE_MIN,
      Math.min(TRANSLATION_FONT_SIZE_MAX, Math.round(v)),
    );
    try {
      localStorage.setItem(TRANSLATION_FONT_SIZE_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    _translationFontSize.set(clamped);
  },
};

export const TRANSLATION_FONT_SIZE_BOUNDS = {
  min: TRANSLATION_FONT_SIZE_MIN,
  max: TRANSLATION_FONT_SIZE_MAX,
  default: TRANSLATION_FONT_SIZE_DEFAULT,
};

function loadTranslationFontFamily(): string {
  try {
    const v = localStorage.getItem(TRANSLATION_FONT_FAMILY_KEY);
    if (typeof v === "string") return v;
  } catch {
    /* ignore */
  }
  return "";
}

const _translationFontFamily = writable<string>(loadTranslationFontFamily());

export const translationFontFamily = {
  subscribe: _translationFontFamily.subscribe,
  set(v: string) {
    const trimmed = (v ?? "").trim();
    try {
      localStorage.setItem(TRANSLATION_FONT_FAMILY_KEY, trimmed);
    } catch {
      /* ignore */
    }
    _translationFontFamily.set(trimmed);
  },
};

function loadTranslationLineSpacing(): number {
  try {
    const v = localStorage.getItem(TRANSLATION_LINE_SPACING_KEY);
    if (v) {
      const n = parseFloat(v);
      if (n >= TRANSLATION_LINE_SPACING_MIN && n <= TRANSLATION_LINE_SPACING_MAX) {
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return TRANSLATION_LINE_SPACING_DEFAULT;
}

const _translationLineSpacing = writable<number>(loadTranslationLineSpacing());

export const translationLineSpacing = {
  subscribe: _translationLineSpacing.subscribe,
  set(v: number) {
    const rounded = Math.round(v * 10) / 10;
    const clamped = Math.max(
      TRANSLATION_LINE_SPACING_MIN,
      Math.min(TRANSLATION_LINE_SPACING_MAX, rounded),
    );
    try {
      localStorage.setItem(TRANSLATION_LINE_SPACING_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    _translationLineSpacing.set(clamped);
  },
};

export const TRANSLATION_LINE_SPACING_BOUNDS = {
  min: TRANSLATION_LINE_SPACING_MIN,
  max: TRANSLATION_LINE_SPACING_MAX,
  default: TRANSLATION_LINE_SPACING_DEFAULT,
};

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
