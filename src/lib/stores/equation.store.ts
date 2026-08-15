import { writable, get } from "svelte/store";

// ── Equation (KaTeX) font size ───────────────────────────────────────────────
// Equation sizing is an *application-wide* display preference, not document
// content: resizing one equation resizes every equation in every open tab, and
// the choice survives a restart. It therefore lives in localStorage next to the
// other display preferences (tafsir font size, UI font scale, editor theme…)
// rather than in the .lexical file — a document opened on any machine renders
// its math at whatever size that reader prefers.

const EQUATION_FONT_SCALE_KEY = "equation-font-scale";

export const EQUATION_FONT_SCALE_DEFAULT = 1;
export const EQUATION_FONT_SCALE_MIN = 0.7;
export const EQUATION_FONT_SCALE_MAX = 2.0;
export const EQUATION_FONT_SCALE_STEP = 0.1;

export function clampEquationFontScale(s: number): number {
  if (!Number.isFinite(s)) return EQUATION_FONT_SCALE_DEFAULT;
  return Math.min(
    EQUATION_FONT_SCALE_MAX,
    Math.max(EQUATION_FONT_SCALE_MIN, s),
  );
}

function loadEquationFontScale(): number {
  try {
    const v = localStorage.getItem(EQUATION_FONT_SCALE_KEY);
    if (v) {
      const n = parseFloat(v);
      if (Number.isFinite(n)) return clampEquationFontScale(n);
    }
  } catch {
    /* ignore */
  }
  return EQUATION_FONT_SCALE_DEFAULT;
}

const _equationFontScale = writable<number>(loadEquationFontScale());

export const equationFontScale = {
  subscribe: _equationFontScale.subscribe,
  set(v: number) {
    // Round to two decimals so repeated ±0.1 steps don't accumulate float
    // noise into the "120%" readout.
    const clamped = +clampEquationFontScale(v).toFixed(2);
    if (clamped === get(_equationFontScale)) return;
    try {
      localStorage.setItem(EQUATION_FONT_SCALE_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    _equationFontScale.set(clamped);
  },
};

// Keep every window in step. Tauri's webviews share an origin, so a change made
// in one window reaches the others through the storage event; the guard stops
// the write above from bouncing back as a second set().
try {
  window.addEventListener("storage", (e) => {
    if (e.key !== EQUATION_FONT_SCALE_KEY || e.newValue === null) return;
    const n = parseFloat(e.newValue);
    if (Number.isFinite(n)) _equationFontScale.set(clampEquationFontScale(n));
  });
} catch {
  /* ignore */
}
