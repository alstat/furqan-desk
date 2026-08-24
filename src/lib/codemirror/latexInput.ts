/**
 * LaTeX → Unicode input for CodeMirror.
 *
 * Type an abbreviation such as `\sigma` and press Tab to replace it with the
 * corresponding Unicode glyph (`σ`). Subscripts (`\_1`), superscripts (`\^2`)
 * and blackboard-bold (`\bbR`) work the same way.
 *
 * Two tables are exported. `latexInput` mirrors the Julia REPL and is used by
 * Julia files and Julia notebook cells. `leanInput` layers Lean's own
 * abbreviations on top — its single-letter set names (`\N`, `\R`), its logic
 * shorthands (`\and`, `\ex`) and its anonymous-constructor brackets
 * (`\<`, `\>`) — for Lean files and Lean notebook cells.
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

// Lean's abbreviations, layered over the shared table above. Entries that
// repeat a key deliberately win: Lean writes the anonymous-function placeholder
// as `·` (U+00B7), so its `\cdot` is not Julia's `⋅` (U+22C5).
const LEAN_SYMBOLS: Record<string, string> = {
    // ── Set names — Lean spells these with a single letter ───────────────
    "\\N": "ℕ", "\\Z": "ℤ", "\\Q": "ℚ", "\\R": "ℝ", "\\C": "ℂ",
    "\\P": "ℙ", "\\nat": "ℕ", "\\real": "ℝ",
    // ── Logic ────────────────────────────────────────────────────────────
    "\\and": "∧", "\\or": "∨", "\\not": "¬", "\\all": "∀",
    "\\ex": "∃", "\\imp": "→", "\\iff": "↔", "\\gets": "←",
    "\\l": "←", "\\r": "→",
    // ── Anonymous constructor and dot notation ───────────────────────────
    "\\<": "⟨", "\\>": "⟩", "\\langle": "⟨", "\\rangle": "⟩",
    "\\.": "·", "\\cdot": "·",
    // ── Functions, products, sets ─────────────────────────────────────────
    "\\lam": "λ", "\\fun": "λ", "\\o": "∘", "\\comp": "∘",
    "\\x": "×", "\\u": "∪", "\\un": "∪", "\\i": "∩",
    "\\inter": "∩", "\\ss": "⊆", "\\mem": "∈", "\\nin": "∉",
    "\\empty": "∅", "\\Union": "⋃", "\\Inter": "⋂", "\\dvd": "∣",
};

// A token: a backslash followed by abbreviation characters. Beyond the letters
// and digits, this covers `_`/`^`/`+`/`-`/`(`/`)`/`=` from the sub- and
// superscripts and `<`/`>`/`.`/`|` from Lean's bracket and dot abbreviations.
const TOKEN_RE = /\\[A-Za-z0-9_^+()=<>.|-]+$/;

/**
 * Build the Tab handler for one table: if the text immediately before the
 * caret is a known abbreviation, replace it with the glyph. Returns false — so
 * Tab keeps its normal indent behaviour — when there is no match.
 */
function completer(table: Record<string, string>) {
    // Bounds the look-back when scanning the text before the caret.
    const maxLen = Object.keys(table).reduce((m, k) => Math.max(m, k.length), 0);

    return (view: EditorView): boolean => {
        const { state } = view;
        const sel = state.selection.main;
        if (!sel.empty) return false;
        const pos = sel.head;
        const line = state.doc.lineAt(pos);
        const before = line.text.slice(
            Math.max(0, pos - line.from - maxLen),
            pos - line.from,
        );
        const match = before.match(TOKEN_RE);
        if (!match) return false;
        const glyph = table[match[0]];
        if (!glyph) return false;
        const from = pos - match[0].length;
        view.dispatch({
            changes: { from, to: pos, insert: glyph },
            selection: { anchor: from + glyph.length },
            userEvent: "input.complete",
            scrollIntoView: true,
        });
        return true;
    };
}

/** CodeMirror extension: Julia-style `\latex`+Tab → Unicode substitution. */
export const latexInput: Extension = keymap.of([
    { key: "Tab", run: completer(LATEX_SYMBOLS) },
]);

/** As `latexInput`, plus Lean's own abbreviations (`\N` → ℕ, `\<` → ⟨, …). */
export const leanInput: Extension = keymap.of([
    { key: "Tab", run: completer({ ...LATEX_SYMBOLS, ...LEAN_SYMBOLS }) },
]);
