/**
 * Shared, incremental Lean 4 highlighting for file editors and notebook cells.
 * This is lexical highlighting, not an elaborator/LSP: user-defined syntax and
 * the types of local names cannot be inferred here. Keep state limited to the
 * constructs that can span lines, so editing doesn't require a whole-file scan.
 */
import { StreamLanguage, type StreamParser, type StringStream } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const DECLARATION_KEYWORDS = new Set([
    'def', 'theorem', 'lemma', 'instance', 'structure', 'class', 'inductive',
    'coinductive', 'abbrev', 'axiom', 'opaque', 'macro', 'macro_rules',
    'syntax', 'notation', 'elab', 'elab_rules', 'infix', 'infixl', 'infixr',
    'prefix', 'postfix', 'declare_syntax_cat', 'initialize', 'builtin_initialize',
]);
// Syntax/notation declarations do not necessarily introduce an identifier.
const NAMED_DECLARATIONS = new Set([
    'def', 'theorem', 'lemma', 'instance', 'structure', 'class', 'inductive',
    'coinductive', 'abbrev', 'axiom', 'opaque', 'declare_syntax_cat',
]);
const DECLARATION_MODIFIERS = new Set([
    'example', 'partial', 'unsafe', 'noncomputable', 'mutual', 'private',
    'protected', 'local', 'scoped', 'public', 'meta', 'nonrec',
]);
const MODULE_KEYWORDS = new Set([
    'import', 'prelude', 'open', 'namespace', 'section', 'end', 'export',
    'variable', 'variables', 'universe', 'universes', 'attribute', 'set_option',
    'deriving', 'extends', 'where', 'include', 'omit',
]);
const CONTROL_KEYWORDS = new Set([
    'if', 'then', 'else', 'match', 'with', 'fun', 'do', 'let', 'have', 'show',
    'from', 'suffices', 'calc', 'by', 'at', 'in', 'return', 'for', 'while',
    'unless', 'try', 'catch', 'finally', 'break', 'continue', 'this',
    'forall', 'λ', 'termination_by', 'termination_by?', 'decreasing_by',
    'decreasing_trivial', 'using', 'only', 'case', 'next',
]);
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
    'any_goals', 'focus', 'skip', 'guard_hyp', 'guard_target', 'infer_instance',
    'trans', 'symm', 'classical', 'by_cases', 'by_contra', 'contrapose',
    'push', 'pull', 'rw_mod_cast', 'exact_mod_cast', 'apply_mod_cast',
    'ac_rfl', 'dsimp', 'erw', 'rwa', 'squeeze_simp', 'simp_rw', 'simp_arith',
    'ext1', 'assumption_mod_cast', 'interval_cases', 'fin_cases',
    'norm_num1', 'linear_combination',
    'abel', 'abel_nf', 'group', 'module', 'fun_prop', 'continuity',
    'measurability', 'filter_upwards', 'exact_type', 'solve', 'solve_by_elim',
    'apply_rules', 'repeat\'', 'done', 'stop', 'trace_state',
]);
const SORT_KEYWORDS = new Set(['Type', 'Prop', 'Sort']);
const HOLE_KEYWORDS = new Set(['sorry', 'sorryAx', 'admit']);

// Match whole Unicode code points (including supplementary-plane math letters),
// combining marks and Lean's subscript/superscript and prime suffixes. Escaped
// identifiers such as «a name with spaces» may also occur in qualified names.
const SEGMENT = String.raw`(?:«[^»\r\n]*»|[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{N}\p{M}_'!?]*)`;
const IDENTIFIER = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})*`, 'u');
const NAME_LITERAL = new RegExp('^`{1,2}' + SEGMENT + '(?:\\.' + SEGMENT + ')*', 'u');
const PLACEHOLDER = new RegExp('^\\?(?:' + SEGMENT + ')?', 'u');

interface StringContext {
    /** null means escaped string; a number means r#…# raw string. */
    rawHashes: number | null;
    interpolated: boolean;
    inExpression: boolean;
    braceDepth: number;
}
interface LeanState {
    commentDepth: number;
    docComment: boolean;
    strings: StringContext[];
    attributeDepth: number;
    expectDefName: boolean;
}

function comment(stream: StringStream, state: LeanState): string {
    while (!stream.eol()) {
        if (stream.match('/-')) state.commentDepth++;
        else if (stream.match('-/')) {
            if (--state.commentDepth === 0) break;
        } else stream.next();
    }
    return state.docComment ? 'docComment' : 'comment';
}

function stringToken(stream: StringStream, state: LeanState, context: StringContext): string {
    const end = '"' + '#'.repeat(context.rawHashes ?? 0);
    if (context.rawHashes === null && stream.match(/^\\(?:u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/)) {
        return 'escape';
    }
    if (context.interpolated && stream.peek() === '{' && !stream.match('{{', false)) {
        stream.next();
        context.inExpression = true;
        context.braceDepth = 0;
        return 'leanInterpolation';
    }
    while (!stream.eol()) {
        if (stream.match(end)) {
            state.strings.pop();
            break;
        }
        if (context.rawHashes === null && stream.peek() === '\\') {
            // Leave the escape for its own token. A trailing backslash must
            // still advance the stream, even in an incomplete string.
            if (stream.pos > stream.start) break;
            stream.next();
            break;
        }
        if (context.interpolated && stream.peek() === '{') {
            if (stream.match('{{')) continue;
            break;
        }
        stream.next();
    }
    return 'string';
}

export const leanParser: StreamParser<LeanState> = {
    name: 'lean',
    startState: () => ({
        commentDepth: 0, docComment: false, strings: [],
        attributeDepth: 0, expectDefName: false,
    }),
    // CodeMirror copies parser checkpoints while editing. Nested interpolation
    // contexts must not be shared with an older checkpoint.
    copyState: state => ({ ...state, strings: state.strings.map(context => ({ ...context })) }),

    token(stream, state) {
        if (state.commentDepth) return comment(stream, state);
        const context = state.strings[state.strings.length - 1];
        if (context && !context.inExpression) return stringToken(stream, state, context);
        if (stream.eatSpace()) return null;

        // Comments are trivia: `def /- explanation -/ foo` still defines foo.
        if (stream.match('/-')) {
            state.commentDepth = 1;
            state.docComment = stream.peek() === '-' || stream.peek() === '!';
            return comment(stream, state);
        }
        if (stream.match('--')) { stream.skipToEnd(); return 'comment'; }

        const namingDeclaration = state.expectDefName;
        state.expectDefName = false;

        if (context?.inExpression) {
            if (stream.peek() === '}') {
                stream.next();
                if (context.braceDepth === 0) {
                    context.inExpression = false;
                    return 'leanInterpolation';
                }
                context.braceDepth--;
                return 'bracket';
            }
            if (stream.peek() === '{') { stream.next(); context.braceDepth++; return 'bracket'; }
        }

        if (stream.match('@[')) { state.attributeDepth++; return 'meta'; }
        if (state.attributeDepth && stream.peek() === '[') {
            stream.next(); state.attributeDepth++; return 'meta';
        }
        if (state.attributeDepth && stream.peek() === ']') {
            stream.next(); state.attributeDepth--; return 'meta';
        }

        // Raw strings ignore backslashes and quotes not followed by the right
        // hash delimiter. Interpolation expressions re-enter the code tokenizer.
        const raw = stream.match(/^r(#+)?"/);
        if (Array.isArray(raw)) {
            state.strings.push({ rawHashes: (raw[1] ?? '').length, interpolated: false, inExpression: false, braceDepth: 0 });
            return 'string';
        }
        if (stream.match(/^[sSmMfF]!"/)) {
            state.strings.push({ rawHashes: null, interpolated: true, inExpression: false, braceDepth: 0 });
            return 'leanInterp';
        }
        if (stream.match('"')) {
            state.strings.push({ rawHashes: null, interpolated: false, inExpression: false, braceDepth: 0 });
            return 'string';
        }
        if (stream.match(/^'(?:\\(?:u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)|[^'\\\r\n])'/u)) return 'string';
        if (stream.match(NAME_LITERAL)) return 'atom';
        if (stream.match(/^#[\p{L}_][\p{L}\p{N}_']*/u)) return 'leanCommand';
        if (stream.match(PLACEHOLDER)) return 'leanHole';
        if (stream.match(/^0[xX][0-9a-fA-F_]+/) || stream.match(/^0[bB][01_]+/) ||
            stream.match(/^\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?/)) return 'number';

        const identifier = stream.match(IDENTIFIER);
        if (Array.isArray(identifier)) {
            const word = identifier[0];
            if (state.attributeDepth) return 'attributeName';
            if (namingDeclaration && !DECLARATION_KEYWORDS.has(word) &&
                !DECLARATION_MODIFIERS.has(word) && !MODULE_KEYWORDS.has(word)) return 'leanDefName';
            if (DECLARATION_KEYWORDS.has(word)) {
                state.expectDefName = NAMED_DECLARATIONS.has(word);
                return 'definitionKeyword';
            }
            if (DECLARATION_MODIFIERS.has(word)) return 'definitionKeyword';
            if (MODULE_KEYWORDS.has(word)) return 'moduleKeyword';
            if (CONTROL_KEYWORDS.has(word)) return 'controlKeyword';
            if (HOLE_KEYWORDS.has(word)) return 'invalid';
            if (SORT_KEYWORDS.has(word)) return 'type';
            if (word === 'true' || word === 'false') return 'bool';
            // Include core/Mathlib suggestion and aggressive variants: simp?,
            // simp!, exact?, aesop?, etc., without splitting the suffix off.
            if (TACTIC_KEYWORDS.has(word) || TACTIC_KEYWORDS.has(word.replace(/[!?]+$/, ''))) return 'leanTactic';
            const lastSegment = word.slice(word.lastIndexOf('.') + 1);
            if (/^[\p{Lu}\p{Lt}ℕℤℚℝℂ]/u.test(lastSegment)) return 'type';
            // Qualified lowercase names and parenthesized applications are a
            // useful lexical hint, not a claim about the elaborated type.
            if (word.includes('.') || stream.match(/^\s*\(/, false)) return 'leanFunctionCall';
            return 'variableName';
        }

        if (stream.match(/^[∀∃]/u)) return 'controlKeyword';
        if (stream.match(/^[⟨⟩⟦⟧‹›«»()[\]{}]/u)) return 'bracket';
        if (stream.match(/^(?:<;>|<\|>|<->|:=|=>|->|<-|\.\.\.|\.\.|::|\|\||&&|==|!=|<=|>=|\+\+|>>=|<\$>|<\*>)/)) return 'operator';
        // Consume other operators one code point at a time so an adjacent
        // comment opener (x+/- note -/y) isn't swallowed into an operator run.
        if (stream.match(/^[\p{Sm}→←↔↦⇒⇔∘∙∧∨¬∈∉⊆⊂∪∩∑∏√∫±·•⊢↑↓↥↧+\-*/%^<>=|&!~$:@\\]/u)) return 'operator';
        if (stream.match(/^[,;.`]/)) return 'punctuation';
        stream.next();
        return null;
    },
    tokenTable: {
        leanTactic: tags.special(tags.keyword),
        leanCommand: tags.macroName,
        leanInterp: tags.special(tags.string),
        leanInterpolation: tags.special(tags.string),
        leanHole: tags.invalid,
        leanFunctionCall: tags.function(tags.variableName),
        leanDefName: tags.definition(tags.variableName),
    },
    languageData: { commentTokens: { line: '--', block: { open: '/-', close: '-/' } } },
};

export const leanLanguage = StreamLanguage.define(leanParser);
export const leanCommentData = leanLanguage.data.of({
    commentTokens: { line: '--', block: { open: '/-', close: '-/' } },
});
export const leanSupport = [leanLanguage, leanCommentData];

// Cell colours share the generic tag palettes with Julia; file editors use the
// selected app theme. Neither needs a separate hard-coded Lean colour scheme.
export {
    juliaLightHighlight as leanLightHighlight,
    juliaDarkHighlight as leanDarkHighlight,
} from './julia';
