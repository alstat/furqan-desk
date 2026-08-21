/**
 * Shared Lean 4 language support for CodeMirror.
 *
 * `@codemirror/legacy-modes` ships no Lean mode, so this is a hand-written
 * stream tokenizer. It covers what actually matters for reading Lean source:
 * nestable block comments (`/- … -/`), doc comments, string interpolation
 * (`s!"…"`), attributes (`@[simp]`), and the split between declaration
 * keywords, term-level keywords and tactic names — a Lean proof is mostly
 * tactic invocations, so colouring tactics like ordinary identifiers makes
 * proofs unreadable.
 *
 * Both the file editor (CodeMirrorEditor.svelte) and the Lexical editor's
 * Lean code cells build on this, so they highlight identically.
 */
import {
    StreamLanguage,
    type StreamParser,
    type StringStream,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';

// Declarations — the "outline" of a file. Each one introduces a name.
const DECLARATION_KEYWORDS = new Set([
    'def', 'theorem', 'lemma', 'instance', 'structure', 'class', 'inductive',
    'coinductive', 'abbrev', 'axiom', 'opaque', 'macro', 'macro_rules',
    'syntax', 'notation', 'elab', 'elab_rules', 'infix', 'infixl', 'infixr',
    'prefix', 'postfix', 'declare_syntax_cat', 'initialize',
]);

// Declaration-adjacent keywords that do *not* introduce a name of their own.
const DECLARATION_MODIFIERS = new Set([
    'example', 'partial', 'unsafe', 'noncomputable', 'mutual', 'private',
    'protected', 'local', 'scoped', 'public', 'meta',
]);

const MODULE_KEYWORDS = new Set([
    'import', 'open', 'namespace', 'section', 'end', 'export', 'variable',
    'variables', 'universe', 'universes', 'attribute', 'set_option',
    'deriving', 'extends', 'where',
]);

// Term-level and control-flow keywords.
const CONTROL_KEYWORDS = new Set([
    'if', 'then', 'else', 'match', 'with', 'fun', 'do', 'let', 'have', 'show',
    'from', 'suffices', 'calc', 'by', 'at', 'in', 'return', 'for', 'while',
    'unless', 'try', 'catch', 'finally', 'break', 'continue', 'this',
    'forall', 'λ',
]);

// Tactic names. Not exhaustive — Lean tactics are user-extensible — but this
// covers the core set plus the Mathlib tactics a reader meets constantly.
const TACTIC_KEYWORDS = new Set([
    'intro', 'intros', 'exact', 'apply', 'refine', 'rfl', 'simp', 'simpa',
    'simp_all', 'rw', 'rewrite', 'nth_rewrite', 'induction', 'cases', 'rcases',
    'obtain', 'rintro', 'constructor', 'use', 'ring', 'ring_nf', 'linarith',
    'nlinarith', 'omega', 'decide', 'native_decide', 'trivial', 'assumption',
    'contradiction', 'exfalso', 'left', 'right', 'ext', 'funext', 'congr',
    'subst', 'substs', 'norm_num', 'norm_cast', 'push_cast', 'push_neg',
    'field_simp', 'aesop', 'tauto', 'positivity', 'gcongr', 'specialize',
    'revert', 'clear', 'rename', 'rename_i', 'change', 'convert', 'conv',
    'unfold', 'delta', 'split', 'split_ifs', 'first', 'repeat', 'all_goals',
    'any_goals', 'focus', 'skip', 'guard_hyp', 'guard_target',
    'infer_instance', 'trans', 'symm',
]);

// Sorts. Everything else uppercase is picked up by the type-name convention.
const SORT_KEYWORDS = new Set(['Type', 'Prop', 'Sort']);

const BOOL_LITERALS = new Set(['true', 'false']);

// `sorry` admits a goal without proving it. Tagging it `invalid` makes an
// unfinished proof visually obvious — the same signal the VS Code extension
// gives, and the reason Lean itself emits a warning for it.
const HOLE_KEYWORDS = new Set(['sorry', 'sorryAx', 'admit', 'stop']);

// Commands that print into the infoview rather than defining anything. These
// produce the `#eval` / `#check` output the infoview panel shows, so they get
// their own colour to tie the editor to that panel.
const HASH_COMMANDS = new Set([
    '#eval', '#check', '#print', '#reduce', '#exit', '#help', '#align',
    '#check_failure', '#guard', '#guard_msgs', '#synth', '#where', '#lint',
]);

/**
 * Identifier characters. Lean is unicode-heavy: Greek letters, blackboard
 * bold (ℕ, ℝ), subscripts and the `'`/`!`/`?` suffixes are all legal in names.
 */
const IDENT_CHAR =
    /[\w'!?\u00C0-\u024F\u0370-\u03FF\u1D00-\u1DBF\u2070-\u209F\u2100-\u214F\u1E00-\u1EFF]/;
const IDENT_START =
    /[A-Za-z_\u00C0-\u024F\u0370-\u03FF\u1D00-\u1DBF\u2100-\u214F\u1E00-\u1EFF]/;

interface LeanState {
    /** Nesting depth of `/- … -/`; Lean block comments nest, unlike C's. */
    commentDepth: number;
    /** Inside a `"…"` string that has not been closed on this line. */
    inString: boolean;
    /** Set by a declaration keyword so the name it introduces is tagged as a
     *  definition rather than a plain identifier. */
    expectDefName: boolean;
}

const leanParser: StreamParser<LeanState> = {
    name: 'lean',

    startState(): LeanState {
        return { commentDepth: 0, inString: false, expectDefName: false };
    },

    token(stream: StringStream, state: LeanState): string | null {
        // ── Block comment continuing from a previous line ────────────────────
        if (state.commentDepth > 0) {
            while (!stream.eol()) {
                if (stream.match('/-')) {
                    state.commentDepth++;
                    continue;
                }
                if (stream.match('-/')) {
                    state.commentDepth--;
                    if (state.commentDepth === 0) return 'comment';
                    continue;
                }
                stream.next();
            }
            return 'comment';
        }

        // ── Unterminated string continuing from a previous line ──────────────
        if (state.inString) {
            while (!stream.eol()) {
                const ch = stream.next()!;
                if (ch === '\\') {
                    stream.next();
                } else if (ch === '"') {
                    state.inString = false;
                    return 'string';
                }
            }
            return 'string';
        }

        if (stream.eatSpace()) return null;

        // The "next identifier names a declaration" flag is only ever true for
        // the single token that follows the keyword — clear it up front so a
        // stray `:` or `(` can't leave it armed for the rest of the file.
        const namingDeclaration = state.expectDefName;
        state.expectDefName = false;

        // ── Comments ─────────────────────────────────────────────────────────
        if (stream.match('/-')) {
            // `/-- … -/` is a doc comment; it shares the nesting counter.
            state.commentDepth = 1;
            while (!stream.eol()) {
                if (stream.match('/-')) {
                    state.commentDepth++;
                    continue;
                }
                if (stream.match('-/')) {
                    state.commentDepth--;
                    if (state.commentDepth === 0) break;
                    continue;
                }
                stream.next();
            }
            return 'comment';
        }
        if (stream.match('--')) {
            stream.skipToEnd();
            return 'comment';
        }

        // ── Attributes: `@[simp, norm_cast]` ─────────────────────────────────
        if (stream.match('@[')) {
            let depth = 1;
            while (!stream.eol() && depth > 0) {
                const ch = stream.next()!;
                if (ch === '[') depth++;
                else if (ch === ']') depth--;
            }
            return 'meta';
        }

        // ── `#eval` / `#check` and friends ───────────────────────────────────
        if (stream.peek() === '#') {
            const start = stream.pos;
            stream.next();
            while (!stream.eol() && IDENT_CHAR.test(stream.peek()!)) stream.next();
            const word = stream.string.slice(start, stream.pos);
            return HASH_COMMANDS.has(word) ? 'leanCommand' : 'meta';
        }

        // ── Interpolated-string prefixes: `s!"…"`, `m!"…"`, `f!"…"` ──────────
        if (stream.match(/^[a-z]!(?=")/)) {
            return 'leanInterp';
        }

        // ── Strings and char literals ────────────────────────────────────────
        if (stream.peek() === '"') {
            stream.next();
            state.inString = true;
            while (!stream.eol()) {
                const ch = stream.next()!;
                if (ch === '\\') {
                    stream.next();
                } else if (ch === '"') {
                    state.inString = false;
                    break;
                }
            }
            return 'string';
        }
        if (stream.match(/^'(?:\\.|[^'\\])'/)) {
            return 'string';
        }

        // ── Numbers ──────────────────────────────────────────────────────────
        if (stream.match(/^0[xX][0-9a-fA-F_]+/) || stream.match(/^0[bB][01_]+/)) {
            return 'number';
        }
        if (stream.match(/^\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/)) {
            return 'number';
        }

        // ── Identifiers and keywords ─────────────────────────────────────────
        if (IDENT_START.test(stream.peek() ?? '')) {
            const start = stream.pos;
            while (!stream.eol() && IDENT_CHAR.test(stream.peek()!)) stream.next();
            // Dotted names (`Nat.succ`, `List.map`) are a single token.
            while (
                stream.peek() === '.' &&
                IDENT_START.test(stream.string[stream.pos + 1] ?? '')
            ) {
                stream.next();
                while (!stream.eol() && IDENT_CHAR.test(stream.peek()!)) stream.next();
            }
            const word = stream.string.slice(start, stream.pos);

            if (
                namingDeclaration &&
                !DECLARATION_KEYWORDS.has(word) &&
                !DECLARATION_MODIFIERS.has(word) &&
                !MODULE_KEYWORDS.has(word)
            ) {
                return 'leanDefName';
            }

            if (HOLE_KEYWORDS.has(word)) return 'invalid';
            if (DECLARATION_KEYWORDS.has(word)) {
                state.expectDefName = true;
                return 'definitionKeyword';
            }
            if (DECLARATION_MODIFIERS.has(word)) return 'definitionKeyword';
            if (MODULE_KEYWORDS.has(word)) return 'moduleKeyword';
            if (CONTROL_KEYWORDS.has(word)) return 'controlKeyword';
            if (SORT_KEYWORDS.has(word)) return 'type';
            if (BOOL_LITERALS.has(word)) return 'bool';
            if (TACTIC_KEYWORDS.has(word)) return 'leanTactic';

            // Uppercase-initial names are types/namespaces by Lean convention.
            const lastSegment = word.split('.').pop() ?? word;
            if (/^[A-Z\u0391-\u03A9\u2100-\u214F]/.test(lastSegment)) return 'type';
            // A lowercase name applied directly to `(` reads as a function call.
            if (stream.peek() === '(') return 'leanFunctionCall';
            return 'variableName';
        }

        // ── Unicode math / logic operators ───────────────────────────────────
        if (stream.match(/^[→←↔↦⇒⇔∘∙×⊕⊗∧∨¬≤≥≠≡∈∉⊆⊂∪∩∑∏√∫±∀∃λ]/)) {
            return 'operator';
        }
        if (stream.match(/^[⟨⟩⟦⟧‹›«»]/)) {
            return 'bracket';
        }

        // ── ASCII operators and punctuation ──────────────────────────────────
        if (
            stream.match(
                /^(?:<\||\|>|:=|=>|->|<->|<-|\.\.\.|\.\.|::|\|\||&&|==|!=|<=|>=|\+\+|>>=|<\$>)/,
            )
        ) {
            return 'operator';
        }
        if (stream.match(/^[+\-*/%^<>=|&!~$:]/)) {
            return 'operator';
        }
        if (stream.match(/^[()[\]{}]/)) {
            return 'bracket';
        }
        if (stream.match(/^[,;.]/)) {
            return 'punctuation';
        }

        stream.next();
        return null;
    },

    // Maps this parser's custom token names onto highlight tags. The standard
    // names ('comment', 'string', 'number', …) are resolved by CodeMirror.
    tokenTable: {
        leanTactic: tags.special(tags.keyword),
        leanCommand: tags.macroName,
        leanInterp: tags.special(tags.string),
        leanFunctionCall: tags.function(tags.variableName),
        leanDefName: tags.definition(tags.variableName),
    },

    languageData: {
        commentTokens: { line: '--', block: { open: '/-', close: '-/' } },
    },
};

export const leanLanguage = StreamLanguage.define(leanParser);

export const leanCommentData = leanLanguage.data.of({
    commentTokens: { line: '--', block: { open: '/-', close: '-/' } },
});

/** Lean language extension bundle (language + comment metadata). */
export const leanSupport = [leanLanguage, leanCommentData];

// The Ayu light/dark highlight styles are palette definitions keyed by generic
// Lezer tags rather than Julia-specific rules, and Lean's tokens resolve to
// those same tags — so both languages share one source of truth for colours.
export {
    juliaLightHighlight as leanLightHighlight,
    juliaDarkHighlight as leanDarkHighlight,
} from './julia';
