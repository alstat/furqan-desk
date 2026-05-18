/**
 * Julia-style LaTeX → Unicode input for CodeMirror.
 *
 * Mirrors the Julia REPL: type a LaTeX abbreviation such as `\sigma` and press
 * Tab to replace it with the corresponding Unicode glyph (`σ`). Subscripts
 * (`\_1`), superscripts (`\^2`) and blackboard-bold (`\bbR`) work the same way.
 *
 * Shared by the file editor (CodeMirrorEditor.svelte) and the notebook's Julia
 * code cells (JuliaCellComponent.svelte).
 */
import { EditorView, keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

// Abbreviation → glyph. Keys include the leading backslash. This is a curated
// subset of Julia's table covering the symbols used in day-to-day code.
const LATEX_SYMBOLS: Record<string, string> = {
    // ── Greek lowercase ──────────────────────────────────────────────────
    "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ",
    "\\epsilon": "ϵ", "\\varepsilon": "ε", "\\zeta": "ζ", "\\eta": "η",
    "\\theta": "θ", "\\vartheta": "ϑ", "\\iota": "ι", "\\kappa": "κ",
    "\\lambda": "λ", "\\mu": "μ", "\\nu": "ν", "\\xi": "ξ",
    "\\omicron": "ο", "\\pi": "π", "\\varpi": "ϖ", "\\rho": "ρ",
    "\\varrho": "ϱ", "\\sigma": "σ", "\\varsigma": "ς", "\\tau": "τ",
    "\\upsilon": "υ", "\\phi": "ϕ", "\\varphi": "φ", "\\chi": "χ",
    "\\psi": "ψ", "\\omega": "ω",
    // ── Greek uppercase ──────────────────────────────────────────────────
    "\\Gamma": "Γ", "\\Delta": "Δ", "\\Theta": "Θ", "\\Lambda": "Λ",
    "\\Xi": "Ξ", "\\Pi": "Π", "\\Sigma": "Σ", "\\Upsilon": "Υ",
    "\\Phi": "Φ", "\\Psi": "Ψ", "\\Omega": "Ω",
    // ── Math operators & relations ───────────────────────────────────────
    "\\infty": "∞", "\\pm": "±", "\\mp": "∓", "\\times": "×",
    "\\div": "÷", "\\cdot": "⋅", "\\ast": "∗", "\\star": "⋆",
    "\\circ": "∘", "\\bullet": "∙", "\\oplus": "⊕", "\\ominus": "⊖",
    "\\otimes": "⊗", "\\odot": "⊙", "\\neq": "≠", "\\ne": "≠",
    "\\leq": "≤", "\\le": "≤", "\\geq": "≥", "\\ge": "≥",
    "\\ll": "≪", "\\gg": "≫", "\\approx": "≈", "\\equiv": "≡",
    "\\cong": "≅", "\\sim": "∼", "\\simeq": "≃", "\\propto": "∝",
    "\\doteq": "≐", "\\in": "∈", "\\notin": "∉", "\\ni": "∋",
    "\\subset": "⊂", "\\subseteq": "⊆", "\\supset": "⊃",
    "\\supseteq": "⊇", "\\cup": "∪", "\\cap": "∩", "\\setminus": "∖",
    "\\emptyset": "∅", "\\forall": "∀", "\\exists": "∃",
    "\\nexists": "∄", "\\partial": "∂", "\\nabla": "∇", "\\wedge": "∧",
    "\\vee": "∨", "\\neg": "¬", "\\land": "∧", "\\lor": "∨",
    "\\angle": "∠", "\\perp": "⊥", "\\parallel": "∥", "\\sqrt": "√",
    "\\cbrt": "∛", "\\sum": "∑", "\\prod": "∏", "\\coprod": "∐",
    "\\int": "∫", "\\oint": "∮", "\\therefore": "∴", "\\because": "∵",
    "\\dagger": "†", "\\ddagger": "‡", "\\top": "⊤", "\\bot": "⊥",
    "\\models": "⊨", "\\vdash": "⊢",
    // ── Arrows ───────────────────────────────────────────────────────────
    "\\to": "→", "\\rightarrow": "→", "\\leftarrow": "←",
    "\\leftrightarrow": "↔", "\\Rightarrow": "⇒", "\\Leftarrow": "⇐",
    "\\Leftrightarrow": "⇔", "\\uparrow": "↑", "\\downarrow": "↓",
    "\\updownarrow": "↕", "\\mapsto": "↦", "\\hookrightarrow": "↪",
    "\\longrightarrow": "⟶", "\\longleftarrow": "⟵",
    // ── Letter-like symbols ──────────────────────────────────────────────
    "\\hbar": "ℏ", "\\ell": "ℓ", "\\Re": "ℜ", "\\Im": "ℑ",
    "\\aleph": "ℵ", "\\wp": "℘", "\\degree": "°", "\\prime": "′",
    "\\dprime": "″", "\\dots": "…", "\\ldots": "…", "\\cdots": "⋯",
    "\\vdots": "⋮", "\\ddots": "⋱", "\\checkmark": "✓",
    // ── Blackboard bold ──────────────────────────────────────────────────
    "\\bbR": "ℝ", "\\bbZ": "ℤ", "\\bbN": "ℕ", "\\bbQ": "ℚ",
    "\\bbC": "ℂ", "\\bbP": "ℙ", "\\bbH": "ℍ", "\\bbE": "𝔼",
    // ── Subscripts ───────────────────────────────────────────────────────
    "\\_0": "₀", "\\_1": "₁", "\\_2": "₂", "\\_3": "₃", "\\_4": "₄",
    "\\_5": "₅", "\\_6": "₆", "\\_7": "₇", "\\_8": "₈", "\\_9": "₉",
    "\\_+": "₊", "\\_-": "₋", "\\_=": "₌", "\\_(": "₍", "\\_)": "₎",
    "\\_a": "ₐ", "\\_e": "ₑ", "\\_h": "ₕ", "\\_i": "ᵢ", "\\_j": "ⱼ",
    "\\_k": "ₖ", "\\_l": "ₗ", "\\_m": "ₘ", "\\_n": "ₙ", "\\_o": "ₒ",
    "\\_p": "ₚ", "\\_r": "ᵣ", "\\_s": "ₛ", "\\_t": "ₜ", "\\_u": "ᵤ",
    "\\_v": "ᵥ", "\\_x": "ₓ",
    // ── Superscripts ─────────────────────────────────────────────────────
    "\\^0": "⁰", "\\^1": "¹", "\\^2": "²", "\\^3": "³", "\\^4": "⁴",
    "\\^5": "⁵", "\\^6": "⁶", "\\^7": "⁷", "\\^8": "⁸", "\\^9": "⁹",
    "\\^+": "⁺", "\\^-": "⁻", "\\^=": "⁼", "\\^(": "⁽", "\\^)": "⁾",
    "\\^a": "ᵃ", "\\^b": "ᵇ", "\\^c": "ᶜ", "\\^d": "ᵈ", "\\^e": "ᵉ",
    "\\^i": "ⁱ", "\\^n": "ⁿ", "\\^o": "ᵒ", "\\^p": "ᵖ", "\\^x": "ˣ",
};

// Longest abbreviation in the table — used to bound the look-back when
// scanning the text before the caret.
const MAX_LEN = Object.keys(LATEX_SYMBOLS).reduce(
    (m, k) => Math.max(m, k.length),
    0,
);

// A LaTeX token: a backslash followed by abbreviation characters (letters,
// digits and the `_`/`^`/`+`/`-`/`(`/`)`/`=` used by sub/superscripts).
const TOKEN_RE = /\\[A-Za-z0-9_^+()=-]+$/;

// On Tab, if the text immediately before the caret is a known LaTeX
// abbreviation, replace it with the Unicode glyph. Returns false (so Tab keeps
// its normal indent behaviour) when there's no match.
function completeLatex(view: EditorView): boolean {
    const { state } = view;
    const sel = state.selection.main;
    if (!sel.empty) return false;
    const pos = sel.head;
    const line = state.doc.lineAt(pos);
    const before = line.text.slice(
        Math.max(0, pos - line.from - MAX_LEN),
        pos - line.from,
    );
    const match = before.match(TOKEN_RE);
    if (!match) return false;
    const glyph = LATEX_SYMBOLS[match[0]];
    if (!glyph) return false;
    const from = pos - match[0].length;
    view.dispatch({
        changes: { from, to: pos, insert: glyph },
        selection: { anchor: from + glyph.length },
        userEvent: "input.complete",
        scrollIntoView: true,
    });
    return true;
}

/** CodeMirror extension: Julia-style `\latex`+Tab → Unicode substitution. */
export const latexInput: Extension = keymap.of([
    { key: "Tab", run: completeLatex },
]);
