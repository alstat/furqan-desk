/**
 * LaTeX math → native Typst math converter.
 *
 * Translates the LaTeX stored by the editor's equation nodes into Typst's
 * own math notation, so exported .typ files render equations without any
 * external package. Covers the common construct set: symbols/Greek (with
 * the LaTeX↔Typst plain/var swaps, e.g. \phi → phi.alt), scripts, fractions,
 * roots, binomials, accents, styles (\mathbb, \mathcal, …), \text, sized
 * delimiters (\left/\right → lr), spacing, and the matrix/cases/aligned
 * environments. Unknown commands degrade to `op("name")`, which compiles and
 * renders the name upright so the user can spot and fix it.
 *
 * Symbol names below are verified against Typst 0.14/0.15 (`phi.alt`,
 * `partial`, `planck`, `chevron.l`, `dots.h.c`, `bar.v.double`, …).
 */

interface Cursor {
    s: string;
    i: number;
}

// ── Symbol tables ───────────────────────────────────────────────────────────

const SYMBOLS: Record<string, string> = {
    // Greek — note the plain/var swaps between LaTeX and Typst.
    alpha: "alpha", beta: "beta", gamma: "gamma", delta: "delta",
    epsilon: "epsilon.alt", varepsilon: "epsilon",
    zeta: "zeta", eta: "eta",
    theta: "theta", vartheta: "theta.alt",
    iota: "iota", kappa: "kappa", lambda: "lambda", mu: "mu", nu: "nu",
    xi: "xi", pi: "pi", varpi: "pi.alt",
    rho: "rho", varrho: "rho.alt",
    sigma: "sigma", varsigma: "sigma.alt",
    tau: "tau", upsilon: "upsilon",
    phi: "phi.alt", varphi: "phi",
    chi: "chi", psi: "psi", omega: "omega",
    Gamma: "Gamma", Delta: "Delta", Theta: "Theta", Lambda: "Lambda",
    Xi: "Xi", Pi: "Pi", Sigma: "Sigma", Upsilon: "Upsilon", Phi: "Phi",
    Psi: "Psi", Omega: "Omega",

    // Big operators
    sum: "sum", prod: "product", coprod: "product.co",
    int: "integral", iint: "integral.double", iiint: "integral.triple",
    oint: "integral.cont",
    bigcup: "union.big", bigcap: "inter.big",
    bigoplus: "plus.circle.big", bigotimes: "times.circle.big",
    bigvee: "or.big", bigwedge: "and.big",

    // Binary operators
    times: "times", div: "div", pm: "plus.minus", mp: "minus.plus",
    cdot: "dot.op", ast: "ast.op", star: "star.op", circ: "compose",
    oplus: "plus.circle", ominus: "minus.circle", otimes: "times.circle",
    odot: "dot.circle",
    cup: "union", cap: "inter", setminus: "without",
    wedge: "and", land: "and", vee: "or", lor: "or",
    neg: "not", lnot: "not",

    // Relations
    leq: "<=", le: "<=", geq: ">=", ge: ">=", neq: "!=", ne: "!=",
    ll: "<<", gg: ">>",
    sim: "tilde.op", simeq: "tilde.eq", cong: "tilde.equiv",
    approx: "approx", equiv: "equiv", propto: "prop",
    mid: "divides", nmid: "divides.not",
    perp: "perp", parallel: "parallel", nparallel: "parallel.not",
    vdash: "tack.r", dashv: "tack.l", models: "tack.r.double",

    // Sets & logic
    in: "in", ni: "in.rev", notin: "in.not",
    subset: "subset", supset: "supset",
    subseteq: "subset.eq", supseteq: "supset.eq",
    subsetneq: "subset.neq", supsetneq: "supset.neq",
    emptyset: "nothing", varnothing: "nothing",
    forall: "forall", exists: "exists", nexists: "exists.not",
    top: "top", bot: "bot",

    // Arrows
    to: "->", rightarrow: "->", longrightarrow: "-->",
    leftarrow: "<-", gets: "<-", longleftarrow: "<--",
    leftrightarrow: "<->", longleftrightarrow: "<-->",
    Rightarrow: "=>", Longrightarrow: "==>",
    Leftarrow: "arrow.l.double", Leftrightarrow: "<=>",
    iff: "<=>", implies: "==>", impliedby: "<==",
    mapsto: "|->", longmapsto: "|->",
    hookrightarrow: "arrow.r.hook", hookleftarrow: "arrow.l.hook",
    uparrow: "arrow.t", downarrow: "arrow.b",
    Uparrow: "arrow.t.double", Downarrow: "arrow.b.double",
    updownarrow: "arrow.t.b",
    nearrow: "arrow.tr", searrow: "arrow.br",
    nwarrow: "arrow.tl", swarrow: "arrow.bl",

    // Dots
    ldots: "dots.h", dots: "dots.h", dotsc: "dots.h", dotso: "dots.h",
    cdots: "dots.h.c", dotsb: "dots.h.c",
    vdots: "dots.v", ddots: "dots.down",

    // Misc
    infty: "oo", partial: "partial", nabla: "nabla",
    hbar: "planck", ell: "ell", aleph: "aleph",
    Re: "Re", Im: "Im",
    angle: "angle", degree: "degree", prime: "prime",
    therefore: "therefore", because: "because",
    langle: "chevron.l", rangle: "chevron.r",
    lceil: "ceil.l", rceil: "ceil.r",
    lfloor: "floor.l", rfloor: "floor.r",
    vert: "|", Vert: "bar.v.double", lVert: "bar.v.double", rVert: "bar.v.double",
    backslash: "backslash", checkmark: "checkmark",
    triangleleft: "triangle.l", triangleright: "triangle.r",
};

// Typst-predefined upright math operators; LaTeX names pass through bare.
const FUNCTIONS = new Set([
    "sin", "cos", "tan", "cot", "sec", "csc",
    "arcsin", "arccos", "arctan",
    "sinh", "cosh", "tanh", "coth",
    "log", "ln", "lg", "exp",
    "det", "dim", "ker", "arg", "deg", "gcd", "hom",
    "min", "max", "sup", "inf",
    "lim", "limsup", "liminf", "Pr",
]);

const ACCENTS: Record<string, string> = {
    hat: "hat", widehat: "hat",
    tilde: "tilde", widetilde: "tilde",
    bar: "macron", vec: "arrow",
    dot: "dot", ddot: "dot.double",
    breve: "breve", check: "caron",
    acute: "acute", grave: "grave",
    overline: "overline", underline: "underline",
    overbrace: "overbrace", underbrace: "underbrace",
};

const STYLES: Record<string, string> = {
    mathrm: "upright", mathbf: "bold", boldsymbol: "bold", bm: "bold",
    mathit: "italic", mathsf: "sans", mathtt: "mono",
    mathcal: "cal", mathscr: "cal", mathfrak: "frak", mathbb: "bb",
};

// \text-like commands: literal text, optionally wrapped in a style call.
const TEXTS: Record<string, string | null> = {
    text: null, textrm: null, textnormal: null, mbox: null,
    textit: "italic", textbf: "bold", texttt: "mono", textsf: "sans",
};

const SPACES: Record<string, string> = {
    ",": "thin", ":": "med", ";": "thick", "!": "",
    " ": "thin", quad: "quad", qquad: "wide",
    enspace: "thin", thinspace: "thin",
};

// Commands that only tweak layout in ways we don't reproduce.
const NOISE = new Set([
    "displaystyle", "textstyle", "scriptstyle", "scriptscriptstyle",
    "limits", "nolimits", "left.", "right.", "notag", "nonumber",
]);

// \left / \right delimiter → typst delimiter ("" = invisible "." side).
const DELIMS: Record<string, string> = {
    "(": "(", ")": ")", "[": "[", "]": "]",
    "\\{": "\\{", "\\}": "\\}",
    "|": "|", "\\|": "bar.v.double",
    "\\vert": "|", "\\Vert": "bar.v.double",
    "\\lVert": "bar.v.double", "\\rVert": "bar.v.double",
    "\\langle": "chevron.l", "\\rangle": "chevron.r",
    "\\lceil": "ceil.l", "\\rceil": "ceil.r",
    "\\lfloor": "floor.l", "\\rfloor": "floor.r",
    "/": "\\/", ".": "",
};

// Literal characters that need a backslash escape in Typst math.
const CHAR_ESCAPES: Record<string, string> = {
    "/": "\\/", // bare / would build a fraction in Typst
    '"': '\\"',
    "#": "\\#",
    "$": "\\$",
};

// ── Entry point ─────────────────────────────────────────────────────────────

export function latexToTypstMath(latex: string): string {
    const cur: Cursor = { s: latex, i: 0 };
    return parseSequence(cur, null).trim();
}

// ── Parsing ─────────────────────────────────────────────────────────────────

type StopFn = (cur: Cursor) => boolean;

interface Piece {
    t: string;
    // Set for {…} groups: multi-token content must be parenthesized if a
    // script attaches to it, but stays bare when standalone.
    grouped?: boolean;
}

function skipWs(cur: Cursor): void {
    for (;;) {
        while (cur.i < cur.s.length && /\s/.test(cur.s[cur.i])) cur.i++;
        if (cur.s[cur.i] === "%" && cur.s[cur.i - 1] !== "\\") {
            while (cur.i < cur.s.length && cur.s[cur.i] !== "\n") cur.i++;
            continue;
        }
        return;
    }
}

function peekCommand(cur: Cursor): string | null {
    if (cur.s[cur.i] !== "\\") return null;
    const rest = cur.s.slice(cur.i + 1);
    const m = rest.match(/^[a-zA-Z]+/);
    return m ? m[0] : (rest[0] ?? null);
}

// Consume "\name" (letters) or "\X" (single char); cursor sits on "\".
function readCommand(cur: Cursor): string {
    cur.i++; // consume "\"
    const m = cur.s.slice(cur.i).match(/^[a-zA-Z]+/);
    if (m) {
        cur.i += m[0].length;
        return m[0];
    }
    const ch = cur.s[cur.i] ?? "";
    cur.i++;
    return ch;
}

// Raw {…} content (nested braces allowed), for \text / env names.
function readBraceRaw(cur: Cursor): string {
    skipWs(cur);
    if (cur.s[cur.i] !== "{") {
        // Single token fallback (e.g. \text x)
        const ch = cur.s[cur.i] ?? "";
        cur.i++;
        return ch;
    }
    cur.i++;
    let depth = 1;
    let out = "";
    while (cur.i < cur.s.length && depth > 0) {
        const ch = cur.s[cur.i];
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) break;
        }
        out += ch;
        cur.i++;
    }
    cur.i++; // closing }
    return out;
}

function typstString(s: string): string {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Does this converted fragment work unparenthesized as a script operand /
// single argument? (single char, number, or one dotted identifier)
function isBareSafe(s: string): boolean {
    return /^[A-Za-z0-9]$|^[A-Za-z][A-Za-z.]*$|^[0-9]+(\.[0-9]+)?$/.test(s);
}

function parenthesize(s: string): string {
    return isBareSafe(s) ? s : `(${s})`;
}

// One argument of a command like \frac: {…} group, \command, or single char.
function parseArg(cur: Cursor): string {
    skipWs(cur);
    const ch = cur.s[cur.i];
    if (ch === undefined) return "";
    if (ch === "{") {
        cur.i++;
        const inner = parseSequence(cur, null);
        if (cur.s[cur.i] === "}") cur.i++;
        return inner;
    }
    if (ch === "\\") return commandToTypst(cur) ?? "";
    cur.i++;
    return CHAR_ESCAPES[ch] ?? ch;
}

// Operand of ^ or _: like parseArg but the result must be attachable.
function parseScriptOperand(cur: Cursor): string {
    const arg = parseArg(cur);
    return parenthesize(arg);
}

function parseSequence(cur: Cursor, stop: StopFn | null): string {
    const pieces: Piece[] = [];
    for (;;) {
        skipWs(cur);
        if (cur.i >= cur.s.length) break;
        if (stop && stop(cur)) break;
        const ch = cur.s[cur.i];
        if (ch === "}") break; // caller consumes

        if (ch === "^" || ch === "_") {
            cur.i++;
            const operand = parseScriptOperand(cur);
            const base = pieces.pop();
            const baseText = base
                ? base.grouped
                    ? parenthesize(base.t)
                    : base.t
                : '""';
            pieces.push({ t: `${baseText}${ch}${operand}` });
            continue;
        }
        if (ch === "'") {
            let primes = "";
            while (cur.s[cur.i] === "'") {
                primes += "'";
                cur.i++;
            }
            const base = pieces.pop();
            pieces.push({ t: `${base?.t ?? '""'}${primes}` });
            continue;
        }
        if (ch === "{") {
            cur.i++;
            const inner = parseSequence(cur, null);
            if (cur.s[cur.i] === "}") cur.i++;
            if (inner) pieces.push({ t: inner, grouped: true });
            continue;
        }
        if (ch === "\\") {
            const out = commandToTypst(cur);
            if (out) pieces.push({ t: out });
            continue;
        }
        if (/[0-9]/.test(ch)) {
            const m = cur.s.slice(cur.i).match(/^[0-9]+(\.[0-9]+)?/)!;
            cur.i += m[0].length;
            pieces.push({ t: m[0] });
            continue;
        }
        if (ch === "~") {
            cur.i++;
            continue; // plain space in output
        }
        cur.i++;
        const mapped = CHAR_ESCAPES[ch] ?? ch;
        pieces.push({ t: mapped });
    }
    return pieces
        .map((p) => p.t)
        .filter((t) => t !== "")
        .join(" ");
}

// ── Commands ────────────────────────────────────────────────────────────────

// Cursor sits on "\"; consumes the command (and its arguments) and returns
// the Typst fragment ("" for pure-layout commands).
function commandToTypst(cur: Cursor): string {
    const name = readCommand(cur);

    if (name === "\\") {
        // Row/line break; swallow an optional [len] spacing argument.
        skipWs(cur);
        if (cur.s[cur.i] === "[") {
            while (cur.i < cur.s.length && cur.s[cur.i] !== "]") cur.i++;
            cur.i++;
        }
        return "\\";
    }

    if (name in SPACES) return SPACES[name];
    if (NOISE.has(name)) return "";
    if (name in SYMBOLS) return SYMBOLS[name];
    if (FUNCTIONS.has(name)) return name;

    switch (name) {
        case "{": return "\\{";
        case "}": return "\\}";
        case "|": return "bar.v.double";
        case "$": return "\\$";
        case "#": return "\\#";
        case "%": return "%";
        case "&": return "\\&";
        case "_": return "\\_";

        case "frac":
        case "dfrac":
        case "tfrac":
        case "cfrac": {
            const a = parseArg(cur);
            const b = parseArg(cur);
            const core = `frac(${a}, ${b})`;
            if (name === "dfrac") return `display(${core})`;
            if (name === "tfrac") return `inline(${core})`;
            return core;
        }
        case "sqrt": {
            skipWs(cur);
            if (cur.s[cur.i] === "[") {
                cur.i++;
                const idx = parseSequence(cur, (c) => c.s[c.i] === "]");
                if (cur.s[cur.i] === "]") cur.i++;
                const radicand = parseArg(cur);
                return `root(${idx}, ${radicand})`;
            }
            return `sqrt(${parseArg(cur)})`;
        }
        case "binom": {
            const a = parseArg(cur);
            const b = parseArg(cur);
            return `binom(${a}, ${b})`;
        }
        case "operatorname": {
            return `op(${typstString(readBraceRaw(cur))})`;
        }
        case "stackrel": {
            const t = parseArg(cur);
            const b = parseArg(cur);
            return `attach(${b}, t: ${t})`;
        }
        case "pmod": {
            const arg = parseArg(cur);
            return `(op("mod") ${arg})`;
        }
        case "bmod":
        case "mod": {
            return `op("mod")`;
        }
        case "not": {
            skipWs(cur);
            if (cur.s[cur.i] === "=") {
                cur.i++;
                return "!=";
            }
            const next = peekCommand(cur);
            if (next === "in") {
                readCommand(cur);
                return "in.not";
            }
            return "not";
        }
        case "left": {
            return parseLeftRight(cur);
        }
        case "right": {
            // Stray \right (its \left was elsewhere): keep the delimiter.
            return DELIMS[readDelimToken(cur)] ?? "";
        }
        case "middle": {
            const d = DELIMS[readDelimToken(cur)] ?? "|";
            return d ? `mid(${d})` : "";
        }
        case "begin": {
            return parseEnvironment(cur);
        }
        case "end": {
            // Stray \end: swallow the name.
            readBraceRaw(cur);
            return "";
        }
        case "hspace": {
            readBraceRaw(cur);
            return "med";
        }
    }

    if (name in ACCENTS) {
        return `${ACCENTS[name]}(${parseArg(cur)})`;
    }
    if (name in STYLES) {
        return `${STYLES[name]}(${parseArg(cur)})`;
    }
    if (name in TEXTS) {
        const style = TEXTS[name];
        const str = typstString(readBraceRaw(cur));
        return style ? `${style}(${str})` : str;
    }

    // Unknown command: render its name upright — compiles, and visibly
    // signals what needs manual attention.
    return `op(${typstString(name)})`;
}

// ── \left … \right ──────────────────────────────────────────────────────────

// Reads the delimiter token after \left / \right / \middle.
function readDelimToken(cur: Cursor): string {
    skipWs(cur);
    if (cur.s[cur.i] === "\\") {
        return "\\" + readCommand(cur);
    }
    const ch = cur.s[cur.i] ?? "";
    cur.i++;
    return ch;
}

function parseLeftRight(cur: Cursor): string {
    const open = DELIMS[readDelimToken(cur)] ?? "";
    const body = parseSequence(cur, (c) => peekCommand(c) === "right" && c.s[c.i] === "\\");
    let close = "";
    skipWs(cur);
    if (cur.s[cur.i] === "\\" && peekCommand(cur) === "right") {
        readCommand(cur);
        close = DELIMS[readDelimToken(cur)] ?? "";
    }
    const inner = [open, body, close].filter(Boolean).join(" ");
    if (!open && !close) return body;
    return `lr(${inner})`;
}

// ── Environments ────────────────────────────────────────────────────────────

const MATRIX_DELIMS: Record<string, string | null> = {
    matrix: "#none",
    smallmatrix: "#none",
    array: "#none",
    pmatrix: null, // typst default: parentheses
    bmatrix: `"["`,
    Bmatrix: `"{"`,
    vmatrix: `"|"`,
    Vmatrix: "bar.v.double",
};

const ALIGN_ENVS = new Set([
    "aligned", "align", "align*", "alignat", "alignat*",
    "gather", "gather*", "gathered", "split", "eqnarray", "eqnarray*",
]);

function parseEnvironment(cur: Cursor): string {
    const env = readBraceRaw(cur);
    if (env === "array") {
        // Discard the column-spec argument.
        skipWs(cur);
        if (cur.s[cur.i] === "{") readBraceRaw(cur);
    }

    const rows: string[][] = [];
    let row: string[] = [];
    for (;;) {
        const cell = parseSequence(cur, (c) => {
            if (c.s[c.i] === "&") return true;
            const cmd = c.s[c.i] === "\\" ? peekCommand(c) : null;
            return cmd === "\\" || cmd === "end";
        });
        row.push(cell.trim());
        skipWs(cur);
        if (cur.i >= cur.s.length) break;
        if (cur.s[cur.i] === "&") {
            cur.i++;
            continue;
        }
        const cmd = peekCommand(cur);
        if (cmd === "\\") {
            commandToTypst(cur); // consumes \\ (+ optional [len])
            rows.push(row);
            row = [];
            continue;
        }
        if (cmd === "end") {
            readCommand(cur);
            readBraceRaw(cur); // env name
            break;
        }
        break; // safety: unexpected token
    }
    if (row.some((c) => c !== "")) rows.push(row);
    const nonEmptyRows = rows.filter((r) => r.some((c) => c !== ""));

    if (env in MATRIX_DELIMS) {
        const delim = MATRIX_DELIMS[env];
        const delimArg = delim === null ? "" : `delim: ${delim}, `;
        const body = nonEmptyRows
            .map((r) => r.map((c) => c || `""`).join(", "))
            .join("; ");
        return `mat(${delimArg}${body})`;
    }
    if (env === "cases" || env === "dcases" || env === "rcases") {
        const body = nonEmptyRows
            .map((r) => r.filter((c) => c !== "").join(" & "))
            .join(", ");
        return `cases(${body})`;
    }
    if (ALIGN_ENVS.has(env)) {
        // Join with all cells intact: an empty leading cell means the row
        // starts at an alignment point ("& = c"), which must be preserved.
        return nonEmptyRows
            .map((r) => r.join(" & ").trim())
            .join(" \\ ");
    }
    // Unknown environment: emit its content unwrapped.
    return nonEmptyRows.map((r) => r.filter((c) => c !== "").join(" ")).join(" \\ ");
}
