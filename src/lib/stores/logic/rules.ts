// The inference-rule catalog and the goal decomposer.
//
// This is where the product's central promise lives: given a goal and a rule
// the *user* chose, work out exactly which obligations that choice creates —
// and nothing else. Every function here is total and offline. Nothing in this
// file searches for a proof, picks a rule, invents a witness, or consults an
// LLM; `applicableRules` returns every rule whose shape fits so the UI can
// offer them, and `decompose` runs only the one the user actually selected.
//
// The Lean term for each rule is described here too (`build`), so the code
// generator stays a dumb walker over the graph rather than a second place
// where the meaning of a rule is decided.

import {
    printProp,
    printTerm,
    propEq,
    substProp,
    type Binder,
    type PropositionIR,
    type TermIR,
} from './ir';

export type RuleId =
    | 'exact'
    | 'and_intro'
    | 'or_intro_left'
    | 'or_intro_right'
    | 'imp_intro'
    | 'not_intro'
    | 'iff_intro'
    | 'forall_intro'
    | 'exists_intro'
    | 'apply'
    | 'cases_or'
    | 'false_elim';

/** What the user must supply before a rule's children can be created. */
export type RuleParam = 'witness' | 'reference';

export interface RuleDef {
    id: RuleId;
    /** i18n key for the rule's name as offered in the chooser. */
    labelKey: string;
    /** i18n key for the one-line plain-language description. */
    hintKey: string;
    /** Whether the rule's shape fits this goal at all. */
    fits(goal: PropositionIR): boolean;
    /** Extra input the user must give. `apply`/`exact` need a reference; `exists_intro` a witness. */
    params: RuleParam[];
}

/**
 * The rules offered in Guided mode. Introduction rules are driven by the
 * goal's outer connective; `apply`, `exact` and `cases_or` are driven by
 * something the user points at (a Theory declaration or a hypothesis in
 * scope), which is why they fit any goal and are filtered later by whether
 * the chosen reference actually matches.
 */
export const RULES: RuleDef[] = [
    {
        id: 'exact',
        labelKey: 'logic.rule.exact',
        hintKey: 'logic.rule.exact_hint',
        fits: () => true,
        params: ['reference'],
    },
    {
        id: 'apply',
        labelKey: 'logic.rule.apply',
        hintKey: 'logic.rule.apply_hint',
        fits: () => true,
        params: ['reference'],
    },
    {
        id: 'and_intro',
        labelKey: 'logic.rule.and_intro',
        hintKey: 'logic.rule.and_intro_hint',
        fits: (g) => g.kind === 'and',
        params: [],
    },
    {
        id: 'or_intro_left',
        labelKey: 'logic.rule.or_intro_left',
        hintKey: 'logic.rule.or_intro_left_hint',
        fits: (g) => g.kind === 'or',
        params: [],
    },
    {
        id: 'or_intro_right',
        labelKey: 'logic.rule.or_intro_right',
        hintKey: 'logic.rule.or_intro_right_hint',
        fits: (g) => g.kind === 'or',
        params: [],
    },
    {
        id: 'imp_intro',
        labelKey: 'logic.rule.imp_intro',
        hintKey: 'logic.rule.imp_intro_hint',
        fits: (g) => g.kind === 'imp',
        params: [],
    },
    {
        id: 'not_intro',
        labelKey: 'logic.rule.not_intro',
        hintKey: 'logic.rule.not_intro_hint',
        fits: (g) => g.kind === 'not',
        params: [],
    },
    {
        id: 'iff_intro',
        labelKey: 'logic.rule.iff_intro',
        hintKey: 'logic.rule.iff_intro_hint',
        fits: (g) => g.kind === 'iff',
        params: [],
    },
    {
        id: 'forall_intro',
        labelKey: 'logic.rule.forall_intro',
        hintKey: 'logic.rule.forall_intro_hint',
        fits: (g) => g.kind === 'forall',
        params: [],
    },
    {
        id: 'exists_intro',
        labelKey: 'logic.rule.exists_intro',
        hintKey: 'logic.rule.exists_intro_hint',
        fits: (g) => g.kind === 'exists',
        params: ['witness'],
    },
    {
        id: 'cases_or',
        labelKey: 'logic.rule.cases_or',
        hintKey: 'logic.rule.cases_or_hint',
        fits: () => true,
        params: ['reference'],
    },
    {
        id: 'false_elim',
        labelKey: 'logic.rule.false_elim',
        hintKey: 'logic.rule.false_elim_hint',
        fits: () => true,
        params: ['reference'],
    },
];

export const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]));

/**
 * Every rule whose shape fits this goal, in the order the chooser shows them.
 *
 * This is guidance, not a decision: the list is offered, and nothing happens
 * until the user picks one. Where several rules fit — and for a disjunction
 * or an unresolved atom several always do — the product must not choose.
 */
export function applicableRules(goal: PropositionIR): RuleDef[] {
    return RULES.filter((r) => r.fits(goal));
}

// ── Obligations ─────────────────────────────────────────────────────────────

/** A hypothesis brought into scope for a child goal only. */
export interface ScopedHypothesis {
    /** The Lean binder name, generated stably from the parent node's id. */
    name: string;
    prop: PropositionIR;
}

/** One child goal a rule created. */
export interface Obligation {
    /** Stable within a decomposition, so re-running it re-finds the same child. */
    key: string;
    prop: PropositionIR;
    /** Hypotheses usable only inside this child's subproof. */
    hypotheses: ScopedHypothesis[];
    /** Arbitrary values introduced for this child (from `∀` introduction). */
    binders: Binder[];
}

export interface Decomposition {
    ruleId: RuleId;
    obligations: Obligation[];
    /**
     * Builds the Lean proof term from each child's proof term, in obligation
     * order. Kept beside the rule so codegen never re-decides what a rule means.
     */
    build: (childTerms: string[]) => string;
    /** True when the rule introduces a binder, so its children cannot be hoisted to a top-level `have`. */
    opensScope: boolean;
}

/** What the user pointed the rule at — a Theory declaration or a hypothesis in scope. */
export interface RuleReference {
    /** The Lean name to emit (`justifiedCounterDeception`, `hDeceptive`). */
    leanName: string;
    /** Its full statement, `∀`s and all. */
    prop: PropositionIR;
}

export interface DecomposeInput {
    goal: PropositionIR;
    ruleId: RuleId;
    /** The parent node's id — hypothesis names are derived from it so they are stable across re-runs. */
    nodeId: string;
    reference?: RuleReference;
    /** `exists_intro`: the witness the user supplied. */
    witness?: TermIR;
}

export type DecomposeResult =
    | { ok: true; decomposition: Decomposition }
    | { ok: false; reason: string };

/** A short, collision-resistant, Lean-safe suffix from a node id. */
export function shortId(nodeId: string): string {
    return nodeId.replace(/-/g, '').slice(0, 8);
}

/**
 * Runs one user-selected rule against a goal.
 *
 * Returns a failure (never a guess) when the rule cannot apply — a reference
 * whose conclusion does not match the goal, a missing witness, a `cases_or`
 * on something that is not a disjunction. The UI surfaces the reason and the
 * graph is left untouched.
 */
export function decompose(input: DecomposeInput): DecomposeResult {
    const { goal, ruleId, nodeId } = input;
    const sid = shortId(nodeId);

    switch (ruleId) {
        case 'exact': {
            if (!input.reference) return { ok: false, reason: 'Choose what proves this goal.' };
            const ref = input.reference;
            if (!propEq(stripForalls(ref.prop).body, goal) && !propEq(ref.prop, goal)) {
                return { ok: false, reason: `${ref.leanName} does not state this goal.` };
            }
            return {
                ok: true,
                decomposition: { ruleId, obligations: [], build: () => ref.leanName, opensScope: false },
            };
        }

        case 'and_intro': {
            if (goal.kind !== 'and') return { ok: false, reason: 'This goal is not a conjunction.' };
            return {
                ok: true,
                decomposition: {
                    ruleId,
                    obligations: [obligation(`${sid}_l`, goal.left), obligation(`${sid}_r`, goal.right)],
                    build: ([l, r]) => `⟨${l}, ${r}⟩`,
                    opensScope: false,
                },
            };
        }

        case 'or_intro_left': {
            if (goal.kind !== 'or') return { ok: false, reason: 'This goal is not a disjunction.' };
            return {
                ok: true,
                decomposition: {
                    ruleId,
                    obligations: [obligation(`${sid}_l`, goal.left)],
                    build: ([c]) => `Or.inl ${paren(c)}`,
                    opensScope: false,
                },
            };
        }

        case 'or_intro_right': {
            if (goal.kind !== 'or') return { ok: false, reason: 'This goal is not a disjunction.' };
            return {
                ok: true,
                decomposition: {
                    ruleId,
                    obligations: [obligation(`${sid}_r`, goal.right)],
                    build: ([c]) => `Or.inr ${paren(c)}`,
                    opensScope: false,
                },
            };
        }

        case 'imp_intro': {
            if (goal.kind !== 'imp') return { ok: false, reason: 'This goal is not an implication.' };
            const name = `h${sid}`;
            return {
                ok: true,
                decomposition: {
                    ruleId,
                    obligations: [
                        { key: `${sid}_c`, prop: goal.right, hypotheses: [{ name, prop: goal.left }], binders: [] },
                    ],
                    build: ([c]) => `fun ${name} => ${c}`,
                    opensScope: true,
                },
            };
        }

        case 'not_intro': {
            if (goal.kind !== 'not') return { ok: false, reason: 'This goal is not a negation.' };
            const name = `h${sid}`;
            return {
                ok: true,
                decomposition: {
                    ruleId,
                    obligations: [
                        {
                            key: `${sid}_c`,
                            prop: { kind: 'false' },
                            hypotheses: [{ name, prop: goal.inner }],
                            binders: [],
                        },
                    ],
                    build: ([c]) => `fun ${name} => ${c}`,
                    opensScope: true,
                },
            };
        }

        case 'iff_intro': {
            if (goal.kind !== 'iff') return { ok: false, reason: 'This goal is not a biconditional.' };
            const fwd: PropositionIR = { kind: 'imp', left: goal.left, right: goal.right };
            const bwd: PropositionIR = { kind: 'imp', left: goal.right, right: goal.left };
            return {
                ok: true,
                decomposition: {
                    ruleId,
                    obligations: [obligation(`${sid}_f`, fwd), obligation(`${sid}_b`, bwd)],
                    build: ([f, b]) => `Iff.intro ${paren(f)} ${paren(b)}`,
                    opensScope: false,
                },
            };
        }

        case 'forall_intro': {
            if (goal.kind !== 'forall') return { ok: false, reason: 'This goal is not universally quantified.' };
            const binder = goal.binder;
            return {
                ok: true,
                decomposition: {
                    ruleId,
                    obligations: [{ key: `${sid}_b`, prop: goal.body, hypotheses: [], binders: [binder] }],
                    build: ([c]) => `fun ${binder.name} => ${c}`,
                    opensScope: true,
                },
            };
        }

        case 'exists_intro': {
            if (goal.kind !== 'exists') return { ok: false, reason: 'This goal is not existentially quantified.' };
            if (!input.witness) {
                // The single most important refusal in the product: an
                // existential stays blocked until the user names the thing.
                return { ok: false, reason: 'Supply the witness — the app will not choose one.' };
            }
            const witness = input.witness;
            const body = substProp(goal.body, goal.binder.name, witness);
            return {
                ok: true,
                decomposition: {
                    ruleId,
                    obligations: [obligation(`${sid}_w`, body)],
                    build: ([c]) => `⟨${printTerm(witness)}, ${c}⟩`,
                    opensScope: false,
                },
            };
        }

        case 'false_elim': {
            if (!input.reference) return { ok: false, reason: 'Choose the contradiction to use.' };
            const ref = input.reference;
            if (ref.prop.kind !== 'false') {
                return { ok: false, reason: `${ref.leanName} is not a contradiction.` };
            }
            return {
                ok: true,
                decomposition: {
                    ruleId,
                    obligations: [],
                    build: () => `False.elim ${ref.leanName}`,
                    opensScope: false,
                },
            };
        }

        case 'cases_or': {
            if (!input.reference) return { ok: false, reason: 'Choose the disjunction to split on.' };
            const ref = input.reference;
            const scrutinee = stripForalls(ref.prop).body;
            if (scrutinee.kind !== 'or') {
                return { ok: false, reason: `${ref.leanName} is not a disjunction.` };
            }
            const nameL = `hl${sid}`;
            const nameR = `hr${sid}`;
            return {
                ok: true,
                decomposition: {
                    ruleId,
                    obligations: [
                        { key: `${sid}_cl`, prop: goal, hypotheses: [{ name: nameL, prop: scrutinee.left }], binders: [] },
                        { key: `${sid}_cr`, prop: goal, hypotheses: [{ name: nameR, prop: scrutinee.right }], binders: [] },
                    ],
                    build: ([l, r]) =>
                        `Or.elim ${ref.leanName} (fun ${nameL} => ${l}) (fun ${nameR} => ${r})`,
                    opensScope: true,
                },
            };
        }

        case 'apply': {
            if (!input.reference) return { ok: false, reason: 'Choose the rule or theorem to apply.' };
            const matched = matchApplication(input.reference.prop, goal);
            if (!matched.ok) return { ok: false, reason: matched.reason };
            const { antecedents, args } = matched;
            const ref = input.reference;
            return {
                ok: true,
                decomposition: {
                    ruleId,
                    obligations: antecedents.map((prop, i) => obligation(`${sid}_a${i}`, prop)),
                    build: (childTerms) =>
                        [ref.leanName, ...args.map((a) => paren(printTerm(a))), ...childTerms.map(paren)]
                            .join(' ')
                            .trim(),
                    opensScope: false,
                },
            };
        }
    }
}

function obligation(key: string, prop: PropositionIR): Obligation {
    return { key, prop, hypotheses: [], binders: [] };
}

/** Wraps a compound Lean term so it survives being used as an argument. */
function paren(term: string): string {
    return /^[A-Za-z_][A-Za-z0-9_.']*$/.test(term.trim()) ? term.trim() : `(${term})`;
}

// ── Matching a declaration against a goal ───────────────────────────────────

/** Peels leading `∀`s, returning the binders and the body underneath. */
export function stripForalls(prop: PropositionIR): { binders: Binder[]; body: PropositionIR } {
    const binders: Binder[] = [];
    let body = prop;
    while (body.kind === 'forall') {
        binders.push(body.binder);
        body = body.body;
    }
    return { binders, body };
}

/** Peels a chain of `→`, returning the antecedents and the final conclusion. */
export function stripImps(prop: PropositionIR): { antecedents: PropositionIR[]; conclusion: PropositionIR } {
    const antecedents: PropositionIR[] = [];
    let conclusion = prop;
    while (conclusion.kind === 'imp') {
        antecedents.push(conclusion.left);
        conclusion = conclusion.right;
    }
    return { antecedents, conclusion };
}

export type MatchResult =
    | { ok: true; antecedents: PropositionIR[]; args: TermIR[] }
    | { ok: false; reason: string };

/**
 * Works out what applying `declProp` to `goal` would leave to prove.
 *
 * Instantiates the declaration's `∀` binders by one-way matching its
 * conclusion against the goal, then returns the antecedents under that
 * instantiation as the obligations. This is what turns a four-premise moral
 * axiom into exactly four open child goals — mechanically, from the shape the
 * user already approved, with nothing invented.
 */
export function matchApplication(declProp: PropositionIR, goal: PropositionIR): MatchResult {
    const { binders, body } = stripForalls(declProp);
    const metas = new Set(binders.map((b) => b.name));
    const { antecedents, conclusion } = stripImps(body);
    const subst = new Map<string, TermIR>();
    if (!matchProp(conclusion, goal, metas, subst)) {
        return {
            ok: false,
            reason: `Its conclusion (${printProp(conclusion)}) does not match this goal.`,
        };
    }
    const missing = binders.filter((b) => !subst.has(b.name));
    if (missing.length) {
        // A binder the goal did not pin down would have to be guessed, and
        // guessing is exactly what this product does not do.
        return {
            ok: false,
            reason: `Matching left ${missing.map((b) => b.name).join(', ')} undetermined — this rule needs a more specific goal.`,
        };
    }
    const apply = (p: PropositionIR) =>
        binders.reduce((acc, b) => substProp(acc, b.name, subst.get(b.name)!), p);
    return {
        ok: true,
        antecedents: antecedents.map(apply),
        args: binders.map((b) => subst.get(b.name)!),
    };
}

/** One-way structural match: `pattern` may contain metavariables, `target` may not. */
function matchProp(
    pattern: PropositionIR,
    target: PropositionIR,
    metas: ReadonlySet<string>,
    subst: Map<string, TermIR>,
): boolean {
    if (pattern.kind !== target.kind) return false;
    switch (pattern.kind) {
        case 'true':
        case 'false':
            return true;
        case 'atom': {
            const t = target as Extract<PropositionIR, { kind: 'atom' }>;
            if (pattern.head !== t.head || pattern.args.length !== t.args.length) return false;
            return pattern.args.every((arg, i) => matchTerm(arg, t.args[i], metas, subst));
        }
        case 'not':
            return matchProp(pattern.inner, (target as Extract<PropositionIR, { kind: 'not' }>).inner, metas, subst);
        case 'and':
        case 'or':
        case 'imp':
        case 'iff': {
            const t = target as Extract<PropositionIR, { kind: 'and' }>;
            return matchProp(pattern.left, t.left, metas, subst) && matchProp(pattern.right, t.right, metas, subst);
        }
        case 'forall':
        case 'exists': {
            const t = target as Extract<PropositionIR, { kind: 'forall' }>;
            // Binders inside the pattern are not metavariables — align them by
            // renaming the target's to the pattern's before descending.
            const aligned = substProp(t.body, t.binder.name, { kind: 'var', name: pattern.binder.name });
            return matchProp(pattern.body, aligned, metas, subst);
        }
    }
}

function matchTerm(
    pattern: TermIR,
    target: TermIR,
    metas: ReadonlySet<string>,
    subst: Map<string, TermIR>,
): boolean {
    if (pattern.kind === 'var' && metas.has(pattern.name)) {
        const bound = subst.get(pattern.name);
        if (bound) return termsEqual(bound, target);
        subst.set(pattern.name, target);
        return true;
    }
    if (pattern.kind !== target.kind) return false;
    if (pattern.kind === 'app') {
        const t = target as Extract<TermIR, { kind: 'app' }>;
        return (
            matchTerm(pattern.head, t.head, metas, subst) &&
            pattern.args.length === t.args.length &&
            pattern.args.every((a, i) => matchTerm(a, t.args[i], metas, subst))
        );
    }
    return pattern.name === (target as { name: string }).name;
}

function termsEqual(a: TermIR, b: TermIR): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'app') {
        const other = b as Extract<TermIR, { kind: 'app' }>;
        return (
            termsEqual(a.head, other.head) &&
            a.args.length === other.args.length &&
            a.args.every((x, i) => termsEqual(x, other.args[i]))
        );
    }
    return a.name === (b as { name: string }).name;
}
