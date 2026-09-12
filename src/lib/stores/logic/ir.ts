// The logic IR: propositions, terms, and the surface syntax the Theory editor
// and goal entry parse. Deliberately small and structural — this is the one
// place a proposition is represented, so the decomposer, the code generator
// and the port validator all agree on what a goal *is* rather than passing
// Lean source strings around and re-parsing them at each hop.
//
// Nothing here talks to Lean. Lean checks what we generate; it is not consulted
// to decide whether two propositions are the same shape. That keeps rule
// matching deterministic and offline, which is what makes the goal decomposer
// safe to run on every keystroke.

/** A term: a variable, a constant, or an application of one to arguments. */
export type TermIR =
    | { kind: 'var'; name: string }
    | { kind: 'const'; name: string }
    | { kind: 'app'; head: TermIR; args: TermIR[] };

/**
 * A proposition. `atom` covers a predicate applied to terms (`Deceptive a`);
 * everything else is the propositional/first-order skeleton the decomposer
 * pattern-matches on.
 */
export type PropositionIR =
    | { kind: 'atom'; head: string; args: TermIR[] }
    | { kind: 'and'; left: PropositionIR; right: PropositionIR }
    | { kind: 'or'; left: PropositionIR; right: PropositionIR }
    | { kind: 'imp'; left: PropositionIR; right: PropositionIR }
    | { kind: 'iff'; left: PropositionIR; right: PropositionIR }
    | { kind: 'not'; inner: PropositionIR }
    | { kind: 'true' }
    | { kind: 'false' }
    | { kind: 'forall'; binder: Binder; body: PropositionIR }
    | { kind: 'exists'; binder: Binder; body: PropositionIR };

export interface Binder {
    name: string;
    /** The binder's type, as written (`Act`). Unset means the app could not infer one. */
    type?: string;
}

// ── Printing ────────────────────────────────────────────────────────────────

/**
 * Precedence for parenthesising output, loosest first. Mirrors Lean's own
 * (`↔` < `→` < `∨` < `∧` < `¬` < atom) so a printed proposition can be pasted
 * into Lean unchanged — which the code generator relies on.
 */
const PREC: Record<PropositionIR['kind'], number> = {
    iff: 1,
    imp: 2,
    or: 3,
    and: 4,
    not: 5,
    forall: 1,
    exists: 1,
    atom: 9,
    true: 9,
    false: 9,
};

export function printTerm(term: TermIR): string {
    switch (term.kind) {
        case 'var':
        case 'const':
            return term.name;
        case 'app': {
            const parts = [printTerm(term.head), ...term.args.map((a) => printTermArg(a))];
            return parts.join(' ');
        }
    }
}

/** An argument position needs parens around anything applied. */
function printTermArg(term: TermIR): string {
    return term.kind === 'app' ? `(${printTerm(term)})` : printTerm(term);
}

/** Renders a proposition in Lean 4 syntax. `parentPrec` drives parenthesising. */
export function printProp(prop: PropositionIR, parentPrec = 0): string {
    const prec = PREC[prop.kind];
    const wrap = (text: string) => (prec < parentPrec ? `(${text})` : text);
    switch (prop.kind) {
        case 'atom':
            return prop.args.length
                ? wrap(`${prop.head} ${prop.args.map(printTermArg).join(' ')}`)
                : prop.head;
        case 'true':
            return 'True';
        case 'false':
            return 'False';
        case 'not':
            return wrap(`¬${printProp(prop.inner, PREC.not + 1)}`);
        // Right-associative, so the right operand keeps this level and the
        // left is bumped — `P → Q → R` prints without parens, `(P → Q) → R`
        // keeps them.
        case 'and':
            return wrap(`${printProp(prop.left, PREC.and + 1)} ∧ ${printProp(prop.right, PREC.and)}`);
        case 'or':
            return wrap(`${printProp(prop.left, PREC.or + 1)} ∨ ${printProp(prop.right, PREC.or)}`);
        case 'imp':
            return wrap(`${printProp(prop.left, PREC.imp + 1)} → ${printProp(prop.right, PREC.imp)}`);
        case 'iff':
            return wrap(`${printProp(prop.left, PREC.iff + 1)} ↔ ${printProp(prop.right, PREC.iff)}`);
        case 'forall':
            return wrap(`∀ ${printBinder(prop.binder)}, ${printProp(prop.body, 0)}`);
        case 'exists':
            return wrap(`∃ ${printBinder(prop.binder)}, ${printProp(prop.body, 0)}`);
    }
}

export function printBinder(binder: Binder): string {
    return binder.type ? `${binder.name} : ${binder.type}` : binder.name;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

export class PropParseError extends Error {
    constructor(
        message: string,
        /** 0-based offset into the source string, for underlining the problem. */
        readonly at: number,
    ) {
        super(message);
        this.name = 'PropParseError';
    }
}

type Token =
    | { t: 'ident'; v: string; at: number }
    | { t: 'sym'; v: string; at: number }
    | { t: 'end'; at: number };

/**
 * ASCII spellings accepted alongside the unicode ones, so a user without a
 * maths keyboard can still type a proposition. Longest first — the scanner
 * takes the first match, so `<->` must be tried before `<-`.
 */
const SYMBOLS: [string, string][] = [
    ['<->', '↔'],
    ['->', '→'],
    ['/\\', '∧'],
    ['\\/', '∨'],
    ['↔', '↔'],
    ['→', '→'],
    ['∧', '∧'],
    ['∨', '∨'],
    ['¬', '¬'],
    ['~', '¬'],
    ['∀', '∀'],
    ['∃', '∃'],
    ['(', '('],
    [')', ')'],
    [',', ','],
    [':', ':'],
];

function tokenize(src: string): Token[] {
    const out: Token[] = [];
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        const sym = SYMBOLS.find(([lit]) => src.startsWith(lit, i));
        if (sym) {
            out.push({ t: 'sym', v: sym[1], at: i });
            i += sym[0].length;
            continue;
        }
        // Identifiers allow Lean's dotted/primed/underscored names so an
        // imported declaration like `Or.inl` or `h'` can be referenced.
        const m = /^[A-Za-z_][A-Za-z0-9_.'!?]*/.exec(src.slice(i));
        if (m) {
            out.push({ t: 'ident', v: m[0], at: i });
            i += m[0].length;
            continue;
        }
        throw new PropParseError(`Unexpected character ${JSON.stringify(ch)}`, i);
    }
    out.push({ t: 'end', at: src.length });
    return out;
}

/**
 * Parses the surface syntax into a `PropositionIR`.
 *
 * `boundVars` are the names already in scope (a Theory's declared variables,
 * plus binders introduced further out); a bare identifier in a term position
 * becomes a `var` when it is one of these and a `const` otherwise. Getting
 * that split right is what lets rule matching treat `a` in a Theory axiom as
 * instantiable while treating `rescue` as a fixed entity.
 */
export function parseProp(src: string, boundVars: readonly string[] = []): PropositionIR {
    const tokens = tokenize(src);
    let pos = 0;
    const peek = () => tokens[pos];
    const bound = new Set(boundVars);

    function eat(sym: string): boolean {
        const tok = peek();
        if (tok.t === 'sym' && tok.v === sym) {
            pos++;
            return true;
        }
        return false;
    }

    function expect(sym: string): void {
        if (!eat(sym)) {
            const tok = peek();
            throw new PropParseError(
                `Expected ${JSON.stringify(sym)}${tok.t === 'end' ? ' but the text ended' : ''}`,
                tok.at,
            );
        }
    }

    // iff is loosest and non-associative; everything below it recurses right.
    function parseIff(): PropositionIR {
        const left = parseImp();
        if (eat('↔')) return { kind: 'iff', left, right: parseIff() };
        return left;
    }

    function parseImp(): PropositionIR {
        const left = parseOr();
        if (eat('→')) return { kind: 'imp', left, right: parseImp() };
        return left;
    }

    function parseOr(): PropositionIR {
        const left = parseAnd();
        if (eat('∨')) return { kind: 'or', left, right: parseOr() };
        return left;
    }

    function parseAnd(): PropositionIR {
        const left = parseUnary();
        if (eat('∧')) return { kind: 'and', left, right: parseAnd() };
        return left;
    }

    function parseUnary(): PropositionIR {
        if (eat('¬')) return { kind: 'not', inner: parseUnary() };
        if (eat('∀')) return parseQuantifier('forall');
        if (eat('∃')) return parseQuantifier('exists');
        return parseAtomOrGroup();
    }

    /** `∀ x : T, body` — the binder is in scope for `body` only. */
    function parseQuantifier(kind: 'forall' | 'exists'): PropositionIR {
        const nameTok = peek();
        if (nameTok.t !== 'ident') throw new PropParseError('Expected a variable name after the quantifier', nameTok.at);
        pos++;
        let type: string | undefined;
        if (eat(':')) {
            const typeTok = peek();
            if (typeTok.t !== 'ident') throw new PropParseError('Expected a type after ":"', typeTok.at);
            pos++;
            type = typeTok.v;
        }
        expect(',');
        const had = bound.has(nameTok.v);
        bound.add(nameTok.v);
        const body = parseIff();
        if (!had) bound.delete(nameTok.v);
        return { kind, binder: { name: nameTok.v, type }, body };
    }

    function parseAtomOrGroup(): PropositionIR {
        const tok = peek();
        if (tok.t === 'sym' && tok.v === '(') {
            pos++;
            const inner = parseIff();
            expect(')');
            return inner;
        }
        if (tok.t !== 'ident') throw new PropParseError('Expected a proposition', tok.at);
        pos++;
        if (tok.v === 'True') return { kind: 'true' };
        if (tok.v === 'False') return { kind: 'false' };
        // A predicate consumes the argument terms that follow it, the way
        // application binds tightest in Lean.
        const args: TermIR[] = [];
        for (;;) {
            const next = peek();
            if (next.t === 'ident') {
                pos++;
                args.push(bound.has(next.v) ? { kind: 'var', name: next.v } : { kind: 'const', name: next.v });
                continue;
            }
            if (next.t === 'sym' && next.v === '(') {
                pos++;
                const inner = parseTerm();
                expect(')');
                args.push(inner);
                continue;
            }
            break;
        }
        return { kind: 'atom', head: tok.v, args };
    }

    function parseTerm(): TermIR {
        const tok = peek();
        if (tok.t !== 'ident') throw new PropParseError('Expected a term', tok.at);
        pos++;
        const head: TermIR = bound.has(tok.v) ? { kind: 'var', name: tok.v } : { kind: 'const', name: tok.v };
        const args: TermIR[] = [];
        for (;;) {
            const next = peek();
            if (next.t === 'ident') {
                pos++;
                args.push(bound.has(next.v) ? { kind: 'var', name: next.v } : { kind: 'const', name: next.v });
                continue;
            }
            if (next.t === 'sym' && next.v === '(') {
                pos++;
                args.push(parseTerm());
                expect(')');
                continue;
            }
            break;
        }
        return args.length ? { kind: 'app', head, args } : head;
    }

    const result = parseIff();
    const rest = peek();
    if (rest.t !== 'end') throw new PropParseError('Unexpected extra text', rest.at);
    return result;
}

/** Parses, returning the error instead of throwing — for live form validation. */
export function tryParseProp(
    src: string,
    boundVars: readonly string[] = [],
): { ok: true; prop: PropositionIR } | { ok: false; error: string; at: number } {
    try {
        return { ok: true, prop: parseProp(src, boundVars) };
    } catch (e) {
        if (e instanceof PropParseError) return { ok: false, error: e.message, at: e.at };
        return { ok: false, error: e instanceof Error ? e.message : String(e), at: 0 };
    }
}

// ── Structural operations ───────────────────────────────────────────────────

/** Structural equality, used to decide whether a goal is closed by a hypothesis. */
export function propEq(a: PropositionIR, b: PropositionIR): boolean {
    if (a.kind !== b.kind) return false;
    switch (a.kind) {
        case 'true':
        case 'false':
            return true;
        case 'atom': {
            const other = b as Extract<PropositionIR, { kind: 'atom' }>;
            return (
                a.head === other.head &&
                a.args.length === other.args.length &&
                a.args.every((arg, i) => termEq(arg, other.args[i]))
            );
        }
        case 'not':
            return propEq(a.inner, (b as Extract<PropositionIR, { kind: 'not' }>).inner);
        case 'and':
        case 'or':
        case 'imp':
        case 'iff': {
            const other = b as Extract<PropositionIR, { kind: 'and' }>;
            return propEq(a.left, other.left) && propEq(a.right, other.right);
        }
        case 'forall':
        case 'exists': {
            const other = b as Extract<PropositionIR, { kind: 'forall' }>;
            // Compared up to the binder's name (alpha-equivalence) by renaming
            // the right-hand binder to match the left's.
            return propEq(a.body, substProp(other.body, other.binder.name, { kind: 'var', name: a.binder.name }));
        }
    }
}

export function termEq(a: TermIR, b: TermIR): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'app') {
        const other = b as Extract<TermIR, { kind: 'app' }>;
        return (
            termEq(a.head, other.head) &&
            a.args.length === other.args.length &&
            a.args.every((arg, i) => termEq(arg, other.args[i]))
        );
    }
    return a.name === (b as { name: string }).name;
}

/** Replaces free occurrences of the variable `name` with `value`. */
export function substProp(prop: PropositionIR, name: string, value: TermIR): PropositionIR {
    switch (prop.kind) {
        case 'true':
        case 'false':
            return prop;
        case 'atom':
            return { kind: 'atom', head: prop.head, args: prop.args.map((a) => substTerm(a, name, value)) };
        case 'not':
            return { kind: 'not', inner: substProp(prop.inner, name, value) };
        case 'and':
        case 'or':
        case 'imp':
        case 'iff':
            return {
                kind: prop.kind,
                left: substProp(prop.left, name, value),
                right: substProp(prop.right, name, value),
            };
        case 'forall':
        case 'exists':
            // A binder of the same name shadows the substitution.
            if (prop.binder.name === name) return prop;
            return { kind: prop.kind, binder: prop.binder, body: substProp(prop.body, name, value) };
    }
}

export function substTerm(term: TermIR, name: string, value: TermIR): TermIR {
    switch (term.kind) {
        case 'var':
            return term.name === name ? value : term;
        case 'const':
            return term;
        case 'app':
            return {
                kind: 'app',
                head: substTerm(term.head, name, value),
                args: term.args.map((a) => substTerm(a, name, value)),
            };
    }
}

/** Every free variable in a proposition, in first-seen order. */
export function freeVars(prop: PropositionIR, bound: ReadonlySet<string> = new Set()): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const pushTerm = (term: TermIR, scope: ReadonlySet<string>) => {
        if (term.kind === 'var') {
            if (!scope.has(term.name) && !seen.has(term.name)) {
                seen.add(term.name);
                out.push(term.name);
            }
        } else if (term.kind === 'app') {
            pushTerm(term.head, scope);
            term.args.forEach((a) => pushTerm(a, scope));
        }
    };
    const walk = (p: PropositionIR, scope: ReadonlySet<string>) => {
        switch (p.kind) {
            case 'true':
            case 'false':
                return;
            case 'atom':
                p.args.forEach((a) => pushTerm(a, scope));
                return;
            case 'not':
                walk(p.inner, scope);
                return;
            case 'and':
            case 'or':
            case 'imp':
            case 'iff':
                walk(p.left, scope);
                walk(p.right, scope);
                return;
            case 'forall':
            case 'exists': {
                const next = new Set(scope);
                next.add(p.binder.name);
                walk(p.body, next);
            }
        }
    };
    walk(prop, bound);
    return out;
}
