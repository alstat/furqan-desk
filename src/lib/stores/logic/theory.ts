// A Theory: the user-owned source of truth a proof is checked against.
//
// The product rule this file exists to enforce is that a proof never invents
// its own vocabulary or assumptions. Everything a proof may lean on — types,
// predicates, entities, definitions, axioms — is declared here first, by the
// user, and pinned by content hash. Editing a Theory mints a new revision
// rather than mutating the old one, so a proof that recorded revision 3 keeps
// meaning what it meant when it was checked, and is marked stale instead of
// silently re-interpreted.
//
// Vocabulary and axioms are deliberately *not* distinguished in the generated
// Lean (both become `axiom` declarations — see codegen.ts for why `constant`
// is not used). They are kept apart here so the trust report can say "you
// declared six pieces of vocabulary and accepted two assumptions" rather than
// "your proof rests on eight axioms".

import { parseProp, printProp, type Binder, type PropositionIR } from './ir';

/** How much a declaration is trusted, and why. Drives the badge colour. */
export type TrustClass = 'kernel-checked' | 'assumed' | 'external-evidence' | 'incomplete' | 'unsafe';

export type VocabularyKind = 'type' | 'entity' | 'predicate' | 'function';

/**
 * One piece of vocabulary. `signature` is written in Lean's own arrow syntax
 * (`Act → Prop`) and passed through to the generated module unchanged, so what
 * the user reads in the editor is exactly what Lean elaborates.
 */
export interface VocabularyDeclaration {
    id: string;
    kind: VocabularyKind;
    name: string;
    /** Unset for a `type` (which is always `Type`); required for everything else. */
    signature?: string;
    /** The user's own explanation, shown in the inspector and the trust report. */
    note?: string;
}

/** A reusable proposition schema — an axiom's statement before it is trusted. */
export interface StatementTemplate {
    id: string;
    name: string;
    /** Variables bound by the template, universally quantified in the generated Lean. */
    binders: Binder[];
    /** Surface syntax, parsed against the Theory's vocabulary. */
    source: string;
    note?: string;
}

export type DeclarationKind = 'definition' | 'axiom' | 'published-theorem';

/**
 * A trusted declaration. An `axiom` is accepted without proof and always
 * appears in the trust report; a `published-theorem` got there by being
 * Lean-checked and then explicitly promoted by the user, and carries the
 * hash of the proof that earned it.
 */
export interface TrustedDeclaration {
    id: string;
    kind: DeclarationKind;
    name: string;
    binders: Binder[];
    /** Surface syntax of the statement (for an axiom/theorem) or the body (for a definition). */
    source: string;
    /** `definition` only: the declared result type, e.g. `Prop`. */
    resultType?: string;
    note?: string;
    /** `published-theorem` only: the proof-graph hash that justified promotion. */
    provedByHash?: string;
}

export interface ProvenanceRecord {
    id: string;
    /** What this cites — a declaration id, or a node id in a proof graph. */
    subjectId: string;
    label: string;
    /** A URL, a book reference, a verse ref — free text on purpose. */
    citation?: string;
    note?: string;
}

export interface LogicTheory {
    id: string;
    name: string;
    /** Bumped on every published edit; a proof pins one of these. */
    revision: number;
    /** Stable hash of everything below — see `theoryContentHash`. */
    contentHash: string;
    /** The toolchain this revision was last elaborated against, if ever. */
    leanVersion?: string;
    vocabulary: VocabularyDeclaration[];
    statements: StatementTemplate[];
    trustedDeclarations: TrustedDeclaration[];
    provenance: ProvenanceRecord[];
}

export function emptyTheory(name = 'Untitled theory'): LogicTheory {
    const theory: LogicTheory = {
        id: crypto.randomUUID(),
        name,
        revision: 1,
        contentHash: '',
        vocabulary: [],
        statements: [],
        trustedDeclarations: [],
        provenance: [],
    };
    theory.contentHash = theoryContentHash(theory);
    return theory;
}

// ── Content hashing ─────────────────────────────────────────────────────────

/**
 * FNV-1a over a canonical rendering of the Theory's semantic content. Two
 * 32-bit lanes are combined to make accidental collisions negligible for the
 * number of revisions a person will ever author.
 *
 * This is a *change detector*, not a security primitive: it decides whether a
 * pinned proof is stale, and nothing trusts it against a determined forger. A
 * shareable certificate should carry a real digest computed server-side (see
 * the web verifier), not this.
 */
export function fnv1aHex(input: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < input.length; i++) {
        const c = input.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193) >>> 0;
        h2 ^= (c << 5) | (c >>> 3);
        h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/**
 * Canonical text for hashing. Ids and free-text notes are excluded on purpose:
 * renaming a note or regenerating a uuid must not invalidate every proof that
 * pinned the Theory, but changing an axiom's *statement* must.
 */
export function theoryCanonicalForm(theory: LogicTheory): string {
    const vocab = [...theory.vocabulary]
        .map((v) => `${v.kind} ${v.name} : ${v.signature ?? 'Type'}`)
        .sort();
    const statements = [...theory.statements]
        .map((s) => `stmt ${s.name} ${s.binders.map(bindKey).join(' ')} := ${normalizeSource(s.source)}`)
        .sort();
    const decls = [...theory.trustedDeclarations]
        .map(
            (d) =>
                `${d.kind} ${d.name} ${d.binders.map(bindKey).join(' ')}${
                    d.resultType ? ` : ${d.resultType}` : ''
                } := ${normalizeSource(d.source)}`,
        )
        .sort();
    return [...vocab, ...statements, ...decls].join('\n');
}

const bindKey = (b: Binder) => `(${b.name}:${b.type ?? '_'})`;

/** Whitespace is not semantic, so it must not change the hash. */
const normalizeSource = (src: string) => src.replace(/\s+/g, ' ').trim();

export function theoryContentHash(theory: LogicTheory): string {
    return fnv1aHex(theoryCanonicalForm(theory));
}

/**
 * Publishes an edited Theory as the next revision. Returns the original
 * untouched when nothing semantic changed, so re-saving an unedited Theory
 * does not strand every proof that pinned it.
 */
export function publishRevision(previous: LogicTheory, edited: LogicTheory): LogicTheory {
    const hash = theoryContentHash(edited);
    if (hash === previous.contentHash) return { ...previous, name: edited.name };
    return { ...edited, id: previous.id, revision: previous.revision + 1, contentHash: hash };
}

// ── Elaboration (structural, before Lean ever runs) ─────────────────────────

export interface TheoryProblem {
    /** The declaration/statement this is about, so the editor can highlight it. */
    subjectId: string;
    severity: 'error' | 'warning';
    message: string;
}

export interface TheoryElaboration {
    ok: boolean;
    problems: TheoryProblem[];
    /** Every name the Theory brings into scope, for the proposition parser. */
    names: string[];
    /** Predicate/function/entity names — what may appear in a proposition. */
    termNames: string[];
    /** Declared type names, for binder type checking. */
    typeNames: string[];
    /**
     * The trust inventory shown before a proof is allowed to start: what the
     * user has accepted without proof, split so vocabulary is not miscounted
     * as an assumption.
     */
    trust: {
        vocabulary: VocabularyDeclaration[];
        axioms: TrustedDeclaration[];
        definitions: TrustedDeclaration[];
        publishedTheorems: TrustedDeclaration[];
    };
}

const LEAN_RESERVED = new Set([
    'theorem', 'axiom', 'def', 'have', 'show', 'fun', 'let', 'match', 'with',
    'if', 'then', 'else', 'by', 'do', 'end', 'namespace', 'section', 'open',
    'variable', 'universe', 'instance', 'class', 'structure', 'inductive',
    'Type', 'Prop', 'Sort', 'sorry',
]);

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_']*$/;

/**
 * Checks a Theory for well-formedness — names, duplicates, unknown types,
 * unparseable statements, references to vocabulary that does not exist.
 *
 * This is not a proof of anything. A Theory that elaborates cleanly is still
 * exactly as trustworthy as the axioms the user chose to accept; that is what
 * `trust` above is for.
 */
export function elaborateTheory(theory: LogicTheory): TheoryElaboration {
    const problems: TheoryProblem[] = [];
    const typeNames = new Set<string>();
    const termNames = new Set<string>();
    const seen = new Map<string, string>();

    const claim = (id: string, name: string) => {
        if (!NAME_RE.test(name)) {
            problems.push({ subjectId: id, severity: 'error', message: `"${name}" is not a usable Lean name.` });
            return false;
        }
        if (LEAN_RESERVED.has(name)) {
            problems.push({ subjectId: id, severity: 'error', message: `"${name}" is a reserved Lean word.` });
            return false;
        }
        const owner = seen.get(name);
        if (owner && owner !== id) {
            problems.push({ subjectId: id, severity: 'error', message: `"${name}" is declared more than once.` });
            return false;
        }
        seen.set(name, id);
        return true;
    };

    for (const v of theory.vocabulary) {
        if (!claim(v.id, v.name)) continue;
        if (v.kind === 'type') {
            typeNames.add(v.name);
        } else {
            termNames.add(v.name);
            if (!v.signature?.trim()) {
                problems.push({
                    subjectId: v.id,
                    severity: 'error',
                    message: `${v.name} needs a signature, e.g. "Act → Prop".`,
                });
            }
        }
    }

    // Signatures are checked after every type is known, so declaration order
    // in the editor never matters.
    for (const v of theory.vocabulary) {
        if (v.kind === 'type' || !v.signature) continue;
        for (const token of v.signature.split(/→|->/)) {
            const name = token.trim();
            if (!name || name === 'Prop' || name === 'Type' || typeNames.has(name)) continue;
            problems.push({
                subjectId: v.id,
                severity: 'error',
                message: `${v.name} mentions the unknown type "${name}". Declare it first.`,
            });
        }
    }

    const knownTerms = [...termNames];
    const checkStatement = (id: string, name: string, binders: Binder[], source: string) => {
        for (const b of binders) {
            if (b.type && !typeNames.has(b.type)) {
                problems.push({
                    subjectId: id,
                    severity: 'error',
                    message: `${name} binds ${b.name} to the unknown type "${b.type}".`,
                });
            }
        }
        if (!source.trim()) {
            problems.push({ subjectId: id, severity: 'error', message: `${name} has no statement yet.` });
            return;
        }
        let parsed: PropositionIR;
        try {
            parsed = parseProp(source, binders.map((b) => b.name));
        } catch (e) {
            problems.push({
                subjectId: id,
                severity: 'error',
                message: `${name} does not parse: ${e instanceof Error ? e.message : String(e)}`,
            });
            return;
        }
        for (const head of headsOf(parsed)) {
            if (!termNames.has(head)) {
                problems.push({
                    subjectId: id,
                    severity: 'error',
                    message: `${name} uses "${head}", which is not declared in this theory.`,
                });
            }
        }
        for (const c of constantsOf(parsed)) {
            if (!termNames.has(c) && !knownTerms.includes(c)) {
                problems.push({
                    subjectId: id,
                    severity: 'warning',
                    message: `${name} mentions "${c}", which is not declared vocabulary — it will be treated as free.`,
                });
            }
        }
    };

    for (const s of theory.statements) {
        if (!claim(s.id, s.name)) continue;
        checkStatement(s.id, s.name, s.binders, s.source);
    }
    for (const d of theory.trustedDeclarations) {
        if (!claim(d.id, d.name)) continue;
        // A definition's body is a proposition in this first release, so it is
        // checked the same way; a value-level definition would need its own path.
        checkStatement(d.id, d.name, d.binders, d.source);
    }

    return {
        ok: !problems.some((p) => p.severity === 'error'),
        problems,
        names: [...seen.keys()],
        termNames: [...termNames],
        typeNames: [...typeNames],
        trust: {
            vocabulary: theory.vocabulary,
            axioms: theory.trustedDeclarations.filter((d) => d.kind === 'axiom'),
            definitions: theory.trustedDeclarations.filter((d) => d.kind === 'definition'),
            publishedTheorems: theory.trustedDeclarations.filter((d) => d.kind === 'published-theorem'),
        },
    };
}

/** Every predicate head used in a proposition. */
export function headsOf(prop: PropositionIR, out: Set<string> = new Set()): Set<string> {
    switch (prop.kind) {
        case 'atom':
            out.add(prop.head);
            return out;
        case 'not':
            return headsOf(prop.inner, out);
        case 'and':
        case 'or':
        case 'imp':
        case 'iff':
            headsOf(prop.left, out);
            return headsOf(prop.right, out);
        case 'forall':
        case 'exists':
            return headsOf(prop.body, out);
        default:
            return out;
    }
}

/** Every constant appearing in argument position. */
export function constantsOf(prop: PropositionIR, out: Set<string> = new Set()): Set<string> {
    const walkTerm = (t: { kind: string; name?: string; head?: unknown; args?: unknown[] }) => {
        if (t.kind === 'const' && t.name) out.add(t.name);
        if (t.kind === 'app') {
            walkTerm(t.head as never);
            (t.args as never[])?.forEach(walkTerm);
        }
    };
    switch (prop.kind) {
        case 'atom':
            prop.args.forEach((a) => walkTerm(a as never));
            return out;
        case 'not':
            return constantsOf(prop.inner, out);
        case 'and':
        case 'or':
        case 'imp':
        case 'iff':
            constantsOf(prop.left, out);
            return constantsOf(prop.right, out);
        case 'forall':
        case 'exists':
            return constantsOf(prop.body, out);
        default:
            return out;
    }
}

/**
 * The full statement of a declaration as one proposition, with its binders
 * re-attached as leading `∀`s. This is the form rule matching consumes — a
 * Theory axiom and a proved hypothesis then look identical to the decomposer.
 */
export function declarationProp(decl: TrustedDeclaration | StatementTemplate): PropositionIR | null {
    try {
        const body = parseProp(decl.source, decl.binders.map((b) => b.name));
        return decl.binders.reduceRight<PropositionIR>(
            (acc, binder) => ({ kind: 'forall', binder, body: acc }),
            body,
        );
    } catch {
        return null;
    }
}

/** Renders a declaration's statement for display. */
export function declarationText(decl: TrustedDeclaration | StatementTemplate): string {
    const prop = declarationProp(decl);
    return prop ? printProp(prop) : decl.source;
}
