import { writable, derived, get, type Writable } from "svelte/store";
import type { LexicalEditor } from "lexical";
import type { HistoryState } from "@lexical/history";
import type { EditorView } from "@codemirror/view";
import { activeTab, type EditorTab } from "./tabs.store";

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

// ── Editor / right-panel split ratio ──────────────────────────────────────────
// Percentage (0–100) of the row's width occupied by the SIDEBAR (the editor side).
// Drives the draggable divider when Hide Quran Page is on and the active tab
// is Julia or Typst (so the right panel is a REPL or Typst preview).

const SPLIT_MIN = 20;
const SPLIT_MAX = 80;

function loadEditorSplitRatio(): number {
  try {
    const v = localStorage.getItem("editor-split-ratio");
    if (v) {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n >= SPLIT_MIN && n <= SPLIT_MAX) return n;
    }
  } catch {
    /* ignore */
  }
  return 50;
}

const _editorSplitRatio = writable<number>(loadEditorSplitRatio());

export const editorSplitRatio = {
  subscribe: _editorSplitRatio.subscribe,
  set(v: number) {
    const clamped = Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, v));
    try {
      localStorage.setItem("editor-split-ratio", String(clamped));
    } catch {
      /* ignore */
    }
    _editorSplitRatio.set(clamped);
  },
};

// ── Julia split (two stacked Julia editors) height ratio ──────────────────────
// Percentage (20–80) of the stack's height occupied by the TOP Julia editor
// when two Julia files are split-stacked. Drives the horizontal divider.

const JULIA_SPLIT_MIN = 20;
const JULIA_SPLIT_MAX = 80;

function loadJuliaSplitRatio(): number {
  try {
    const v = localStorage.getItem("julia-split-ratio");
    if (v) {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n >= JULIA_SPLIT_MIN && n <= JULIA_SPLIT_MAX) {
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return 50;
}

const _juliaSplitRatio = writable<number>(loadJuliaSplitRatio());

export const juliaSplitRatio = {
  subscribe: _juliaSplitRatio.subscribe,
  set(v: number) {
    const clamped = Math.max(JULIA_SPLIT_MIN, Math.min(JULIA_SPLIT_MAX, v));
    try {
      localStorage.setItem("julia-split-ratio", String(clamped));
    } catch {
      /* ignore */
    }
    _juliaSplitRatio.set(clamped);
  },
};

// Right column of a three-file Julia split: percentage (20–80) of the column's
// height given to the third editor (tabC), stacked above the shared REPL.

function loadJuliaRightSplitRatio(): number {
  try {
    const v = localStorage.getItem("julia-right-split-ratio");
    if (v) {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n >= JULIA_SPLIT_MIN && n <= JULIA_SPLIT_MAX) {
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return 50;
}

const _juliaRightSplitRatio = writable<number>(loadJuliaRightSplitRatio());

export const juliaRightSplitRatio = {
  subscribe: _juliaRightSplitRatio.subscribe,
  set(v: number) {
    const clamped = Math.max(JULIA_SPLIT_MIN, Math.min(JULIA_SPLIT_MAX, v));
    try {
      localStorage.setItem("julia-right-split-ratio", String(clamped));
    } catch {
      /* ignore */
    }
    _juliaRightSplitRatio.set(clamped);
  },
};

// ── Typst split (two/three stacked Typst editors) height ratios ───────────────
// Mirrors the Julia split: left column = tabA/tabB, right column = tabC above
// the shared Typst preview. Same 20–80 clamp.

function loadRatio(key: string): number {
  try {
    const v = localStorage.getItem(key);
    if (v) {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n >= JULIA_SPLIT_MIN && n <= JULIA_SPLIT_MAX) {
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return 50;
}

const _typstSplitRatio = writable<number>(loadRatio("typst-split-ratio"));

export const typstSplitRatio = {
  subscribe: _typstSplitRatio.subscribe,
  set(v: number) {
    const clamped = Math.max(JULIA_SPLIT_MIN, Math.min(JULIA_SPLIT_MAX, v));
    try {
      localStorage.setItem("typst-split-ratio", String(clamped));
    } catch {
      /* ignore */
    }
    _typstSplitRatio.set(clamped);
  },
};

const _typstRightSplitRatio = writable<number>(
  loadRatio("typst-right-split-ratio"),
);

export const typstRightSplitRatio = {
  subscribe: _typstRightSplitRatio.subscribe,
  set(v: number) {
    const clamped = Math.max(JULIA_SPLIT_MIN, Math.min(JULIA_SPLIT_MAX, v));
    try {
      localStorage.setItem("typst-right-split-ratio", String(clamped));
    } catch {
      /* ignore */
    }
    _typstRightSplitRatio.set(clamped);
  },
};

// ── Editor theme ──────────────────────────────────────────────────────────────

export type EditorTheme =
  | "ayu-light"
  | "ayu-mirage"
  | "gruvbox-light"
  | "gruvbox-dark"
  | "monokai-light"
  | "monokai-dark"
  | "solarized-light"
  | "solarized-dark"
  | "tokyo-night-light"
  | "tokyo-night-dark";

export interface EditorThemeInfo {
  id: EditorTheme;
  label: string;
  dark: boolean;
  /** Editor background colour — used for the theme swatch in the picker. */
  bg: string;
  /** Accent colour — used for the swatch dot. */
  accent: string;
}

/** All CodeMirror themes available to the editor, in display order. */
export const ALL_EDITOR_THEMES: EditorThemeInfo[] = [
  { id: "ayu-light", label: "Ayu Light", dark: false, bg: "#fafafa", accent: "#ff9940" },
  { id: "ayu-mirage", label: "Ayu Mirage", dark: true, bg: "#1f2430", accent: "#ffcc66" },
  { id: "gruvbox-light", label: "Gruvbox Light", dark: false, bg: "#fbf1c7", accent: "#b57614" },
  { id: "gruvbox-dark", label: "Gruvbox Dark", dark: true, bg: "#282828", accent: "#fabd2f" },
  { id: "monokai-light", label: "Monokai Light", dark: false, bg: "#fafaf6", accent: "#e0185a" },
  { id: "monokai-dark", label: "Monokai Dark", dark: true, bg: "#272822", accent: "#f92672" },
  { id: "solarized-light", label: "Solarized Light", dark: false, bg: "#fdf6e3", accent: "#b58900" },
  { id: "solarized-dark", label: "Solarized Dark", dark: true, bg: "#002b36", accent: "#b58900" },
  { id: "tokyo-night-light", label: "Tokyo Night Light", dark: false, bg: "#e1e2e7", accent: "#9854f1" },
  { id: "tokyo-night-dark", label: "Tokyo Night", dark: true, bg: "#1a1b26", accent: "#bb9af7" },
];

function isEditorTheme(v: unknown): v is EditorTheme {
  return (
    typeof v === "string" &&
    ALL_EDITOR_THEMES.some((t) => t.id === v)
  );
}

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

// ── REPL / Terminal font size ─────────────────────────────────────────────────

function loadReplFontSize(): number {
  try {
    const v = localStorage.getItem("repl-font-size");
    if (v) {
      const n = parseInt(v, 10);
      if (n >= 9 && n <= 24) return n;
    }
  } catch {
    /* ignore */
  }
  return 13;
}

const _replFontSize = writable<number>(loadReplFontSize());

export const replFontSize = {
  subscribe: _replFontSize.subscribe,
  set(v: number) {
    const clamped = Math.max(9, Math.min(24, v));
    try {
      localStorage.setItem("repl-font-size", String(clamped));
    } catch {
      /* ignore */
    }
    _replFontSize.set(clamped);
  },
};

// ── REPL / Terminal line spacing ──────────────────────────────────────────────

function loadReplLineSpacing(): number {
  try {
    const v = localStorage.getItem("repl-line-spacing");
    if (v) {
      const n = parseFloat(v);
      if (n >= 1 && n <= 2) return n;
    }
  } catch {
    /* ignore */
  }
  return 1.3;
}

const _replLineSpacing = writable<number>(loadReplLineSpacing());

export const replLineSpacing = {
  subscribe: _replLineSpacing.subscribe,
  set(v: number) {
    const clamped = Math.max(1, Math.min(2, v));
    try {
      localStorage.setItem("repl-line-spacing", String(clamped));
    } catch {
      /* ignore */
    }
    _replLineSpacing.set(clamped);
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

// Preview zoom (1 = page fits the pane width). Stores rather than component
// state so the level survives the remounts caused by cross-type tab switches.
// The side-by-side preview and the embedded pane keep separate levels since
// their widths differ so much.
export const typstPreviewZoom = writable<number>(1);
export const typstEmbeddedPreviewZoom = writable<number>(1);

function loadTheme(): EditorTheme {
  try {
    const v = localStorage.getItem("editor-theme");
    if (isEditorTheme(v)) return v;
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

// ── Editor theme toolbar slots ───────────────────────────────────────────────
// The two themes surfaced as quick-switch buttons in the Editor Toolbar.

function loadThemeSlots(): [EditorTheme, EditorTheme] {
  try {
    const raw = localStorage.getItem("editor-theme-slots");
    if (raw) {
      const arr = JSON.parse(raw);
      if (
        Array.isArray(arr) &&
        arr.length === 2 &&
        isEditorTheme(arr[0]) &&
        isEditorTheme(arr[1]) &&
        arr[0] !== arr[1]
      ) {
        return [arr[0], arr[1]];
      }
    }
  } catch {
    /* ignore */
  }
  return ["ayu-light", "ayu-mirage"];
}

const _editorThemeSlots = writable<[EditorTheme, EditorTheme]>(
  loadThemeSlots(),
);

export const editorThemeSlots = {
  subscribe: _editorThemeSlots.subscribe,
  set(v: [EditorTheme, EditorTheme]) {
    try {
      localStorage.setItem("editor-theme-slots", JSON.stringify(v));
    } catch {
      /* ignore */
    }
    _editorThemeSlots.set(v);
  },
};

// ── Code editor indent size ───────────────────────────────────────────────────
// Number of spaces inserted per indent level (Tab key, auto-indent).

export type IndentSize = 2 | 4;

function loadIndentSize(): IndentSize {
  try {
    const v = localStorage.getItem("editor-indent-size");
    if (v === "4") return 4;
    if (v === "2") return 2;
  } catch {
    /* ignore */
  }
  return 2;
}

const _editorIndentSize = writable<IndentSize>(loadIndentSize());

export const editorIndentSize = {
  subscribe: _editorIndentSize.subscribe,
  set(v: IndentSize) {
    try {
      localStorage.setItem("editor-indent-size", String(v));
    } catch {
      /* ignore */
    }
    _editorIndentSize.set(v);
  },
};

// ── UI font scale (accessibility) ─────────────────────────────────────────────
// Multiplier applied to the document root font-size so the whole interface
// (all rem-based text and spacing) scales up or down. 1.0 = default.

const UI_FONT_SCALE_KEY = "ui-font-scale";
const UI_FONT_SCALE_MIN = 0.8;
const UI_FONT_SCALE_MAX = 1.4;
const UI_FONT_SCALE_DEFAULT = 1.0;
const UI_FONT_SCALE_STEP = 0.05;

function loadUiFontScale(): number {
  try {
    const v = localStorage.getItem(UI_FONT_SCALE_KEY);
    if (v) {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n >= UI_FONT_SCALE_MIN && n <= UI_FONT_SCALE_MAX) {
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return UI_FONT_SCALE_DEFAULT;
}

const _uiFontScale = writable<number>(loadUiFontScale());

export const uiFontScale = {
  subscribe: _uiFontScale.subscribe,
  set(v: number) {
    // Snap to the step grid to avoid float drift (e.g. 1.0500000001).
    const snapped = Math.round(v / UI_FONT_SCALE_STEP) * UI_FONT_SCALE_STEP;
    const clamped = Math.max(
      UI_FONT_SCALE_MIN,
      Math.min(UI_FONT_SCALE_MAX, Math.round(snapped * 100) / 100),
    );
    try {
      localStorage.setItem(UI_FONT_SCALE_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    _uiFontScale.set(clamped);
  },
};

export const UI_FONT_SCALE_BOUNDS = {
  min: UI_FONT_SCALE_MIN,
  max: UI_FONT_SCALE_MAX,
  default: UI_FONT_SCALE_DEFAULT,
  step: UI_FONT_SCALE_STEP,
};

export type ReplMode = "julia" | "pkg" | "shell" | "help";

export interface ReplLine {
  text: string;
  kind: "input" | "output" | "error" | "warn";
  /** Only meaningful when kind === "input". Defaults to "julia". */
  mode?: ReplMode;
}
/** Shared REPL output lines for all Julia tabs */
export const juliaReplHistory: Writable<ReplLine[]> = writable([]);
export const juliaReplStarted: Writable<boolean> = writable(false);
/** Active Julia project/environment name (empty string = default global env). */
export const juliaActiveEnv: Writable<string> = writable("");

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
/**
 * Live CodeMirror views and their history depths, keyed by the tab each one
 * edits. Split layouts mount several editors at once, so `codeMirrorViewInstance`
 * (last mount wins) can't tell them apart. An action bar pinned to one panel
 * looks its view up here instead. Entries appear on mount and are removed on
 * unmount, so a missing key just means "that tab isn't on screen".
 */
export const codeMirrorViewsByTab: Writable<Record<string, EditorView>> =
  writable({});
export const codeMirrorHistoryByTab: Writable<
  Record<string, { canUndo: boolean; canRedo: boolean }>
> = writable({});
/**
 * A requested cursor jump into a specific file. The CodeMirror editor whose
 * `filePath` matches `path` performs the jump once it is mounted, then clears
 * this — so a jump can target a file that isn't focused (or open) yet, without
 * racing whichever editor happens to be active. Used by Typst error links.
 */
export const pendingEditorJump: Writable<{
  path: string;
  line: number;
  col: number;
} | null> = writable(null);
/** Increment to force TypstEditor to recompile without changing the source. */
export const typstRecompile: Writable<number> = writable(0);

// ── Typst preview source selection ────────────────────────────────────────────
// Two ways to choose what the Typst preview renders:
//   • "active" (default) — the preview follows whichever Typst file is focused,
//     so unrelated files each show their own output as you switch between them.
//   • "pinned" — always render one chosen file (e.g. a main.typ that #includes
//     the chapters), so editing chapter1.typ keeps previewing main.typ.
export type TypstPreviewMode = "active" | "pinned";

function loadTypstPreviewMode(): TypstPreviewMode {
  try {
    const v = localStorage.getItem("typst-preview-mode");
    if (v === "pinned" || v === "active") return v;
  } catch {
    /* ignore */
  }
  return "active";
}

const _typstPreviewMode = writable<TypstPreviewMode>(loadTypstPreviewMode());

export const typstPreviewMode = {
  subscribe: _typstPreviewMode.subscribe,
  set(v: TypstPreviewMode) {
    try {
      localStorage.setItem("typst-preview-mode", v);
    } catch {
      /* ignore */
    }
    _typstPreviewMode.set(v);
  },
};

// Absolute path of the file pinned for preview (only honoured when
// mode === "pinned"). Stored by path so the choice survives reloads — tab ids
// are regenerated each session, paths are not.
function loadTypstPinnedPath(): string | null {
  try {
    const v = localStorage.getItem("typst-pinned-path");
    if (v) return v;
  } catch {
    /* ignore */
  }
  return null;
}

const _typstPinnedPath = writable<string | null>(loadTypstPinnedPath());

export const typstPinnedPath = {
  subscribe: _typstPinnedPath.subscribe,
  set(v: string | null) {
    try {
      if (v) localStorage.setItem("typst-pinned-path", v);
      else localStorage.removeItem("typst-pinned-path");
    } catch {
      /* ignore */
    }
    _typstPinnedPath.set(v);
  },
};

/**
 * Path of the file currently feeding the preview pipeline — the companion to
 * `typstSource`. Written by the driving editor; read by PDF export so it
 * compiles the *previewed* file (resolving its imports), not necessarily the
 * focused one.
 */
export const typstPreviewPath: Writable<string | null> = writable(null);

/**
 * Resolve which open tab the Typst preview should render.
 *
 * In "pinned" mode the pinned file is previewed whenever it is open; otherwise —
 * and as a fallback when the pinned file isn't open — the active tab is used.
 * Returning a tab (rather than just driving from the pinned file's own editor)
 * lets the always-mounted active editor compile a pinned file that is open only
 * in a background tab.
 */
export function resolveTypstPreviewTab(
  allTabs: EditorTab[],
  active: EditorTab | null,
  mode: TypstPreviewMode,
  pinnedPath: string | null,
): EditorTab | null {
  if (mode === "pinned" && pinnedPath) {
    const pinned = allTabs.find(
      (t) =>
        t.path === pinnedPath && (t.type === "typst" || t.type === "text"),
    );
    if (pinned) return pinned;
  }
  return active;
}

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
  format: "png" | "svg" | "plotly";
  data: string; // base64 — image bytes for png/svg, an HTML document for plotly
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

// ── Editor tabs opacity in Zen Mode (0–100%) ──────────────────────────────────
// The tab strip is shown at this opacity while in Zen Mode (0 = hidden until
// hover, 100 = fully visible). Hovering always reveals it fully so the tabs stay
// usable at low opacities.
export const ZEN_TABS_OPACITY_BOUNDS = { min: 0, max: 100, step: 5, default: 70 };

function loadZenTabsOpacity(): number {
  try {
    const v = localStorage.getItem("zen-tabs-opacity");
    if (v !== null) {
      const n = Number(v);
      if (Number.isFinite(n)) {
        return Math.min(
          ZEN_TABS_OPACITY_BOUNDS.max,
          Math.max(ZEN_TABS_OPACITY_BOUNDS.min, n),
        );
      }
    }
  } catch {
    /* ignore */
  }
  return ZEN_TABS_OPACITY_BOUNDS.default;
}
const _zenTabsOpacity = writable<number>(loadZenTabsOpacity());
export const zenTabsOpacity = {
  subscribe: _zenTabsOpacity.subscribe,
  set(v: number) {
    const clamped = Math.min(
      ZEN_TABS_OPACITY_BOUNDS.max,
      Math.max(ZEN_TABS_OPACITY_BOUNDS.min, Math.round(v)),
    );
    try {
      localStorage.setItem("zen-tabs-opacity", String(clamped));
    } catch {
      /* ignore */
    }
    _zenTabsOpacity.set(clamped);
  },
};

// ── TOC button anchor rect (set on click so the panel tracks the button) ─────
export const tocAnchorRect = writable<DOMRect | null>(null);

/** Shared compile output — written by TypstEditor, read by TypstPreview. */
export const typstSvgPages: Writable<string[]> = writable([]);
export const typstCompileError: Writable<string> = writable("");
export const typstIsCompiling: Writable<boolean> = writable(false);
