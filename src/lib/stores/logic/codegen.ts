// Deterministic Lean generation, plus the line→node map diagnostics are read
// back through.
//
// Two rules shape everything here:
//
// 1. The output is a function of the graph alone. Same graph, same Lean, byte
//    for byte — no timestamps, no map iteration order, no random names. That
//    is what makes a golden test possible and what makes a content-addressed
//    cache correct.
// 2. An unproved goal becomes `sorry` and is *reported*, never hidden. The
//    module still compiles so the user keeps getting diagnostics on the parts
//    they have finished, but a component containing `sorry` can never be
//    badged Checked — see `GeneratedModule.openGoals` and the `#print axioms`
//    line, which makes Lean itself confirm what the proof actually rests on.
//
// Note on vocabulary: Lean 4 has no `constant` declaration, so every piece of
// user vocabulary is emitted as `axiom`. They are still tracked apart from
// real assumptions in the Theory model, so the trust report can say "six
// declarations, two assumptions" rather than lumping them into "eight axioms".

import { printBinder, printProp, tryParseProp, type PropositionIR } from './ir';
import {
    derivePorts,
    incomingOn,
    isLogicNode,
    nodeProp,
    obligationPortId,
    proverOf,
    ruleDecomposition,
    type LogicComponent,
    type LogicContext,
    type LogicNodeLike,
} from './graph';
import { shortId } from './rules';
import type { LogicTheory, TrustedDeclaration, VocabularyDeclaration } from './theory';

export interface SourceMapEntry {
    /** 1-based, matching Lean's own diagnostic line numbering. */
    line: number;
    nodeId: string;
}

export interface GeneratedModule {
    source: string;
    sourceMap: SourceMapEntry[];
    /** The theorem name the proof is bound to, for `#print axioms`. */
    theoremName: string;
    /** Goal nodes with nothing wired to prove them — each became a `sorry`. */
    openGoals: string[];
    /** Premise nodes that became theorem parameters, in emission order. */
    premiseIds: string[];
    /** Vocabulary and assumptions the module declared, for the trust report. */
    declared: { vocabulary: VocabularyDeclaration[]; assumptions: TrustedDeclaration[] };
}

/** Accumulates lines while keeping the source map in step. */
class Emitter {
    readonly lines: string[] = [];
    readonly map: SourceMapEntry[] = [];

    push(text = ''): void {
        this.lines.push(text);
    }

    /** Emits a `-- node:` marker so the next line maps back to this card. */
    mark(nodeId: string, indent = ''): void {
        this.lines.push(`${indent}-- node: ${nodeId}`);
        // The marker points at the line that follows it, which is the one Lean
        // will report a problem on.
        this.map.push({ line: this.lines.length + 1, nodeId });
    }

    get text(): string {
        return this.lines.join('\n');
    }
}

// ── Theory module ───────────────────────────────────────────────────────────

function emitTheory(theory: LogicTheory | null, out: Emitter): void {
    if (!theory) return;
    out.push(`-- Theory: ${theory.name} (revision ${theory.revision}, ${theory.contentHash})`);
    out.push('-- Vocabulary and assumptions below were declared by the author, not derived.');
    out.push();

    for (const v of theory.vocabulary) {
        out.mark(v.id);
        out.push(`axiom ${v.name} : ${v.kind === 'type' ? 'Type' : (v.signature ?? 'Prop')}`);
    }
    if (theory.vocabulary.length) out.push();

    for (const decl of theory.trustedDeclarations) {
        out.mark(decl.id);
        out.push(emitDeclaration(decl));
        out.push();
    }
}

function emitDeclaration(decl: TrustedDeclaration): string {
    const body = declarationBody(decl);
    if (decl.kind === 'definition') {
        const binders = decl.binders.map((b) => `(${printBinder(b)})`).join(' ');
        return `def ${decl.name}${binders ? ' ' + binders : ''} : ${decl.resultType ?? 'Prop'} := ${body}`;
    }
    // An axiom and a published theorem are both re-declared as `axiom` here.
    // A published theorem earned that status from a checked proof, but this
    // module does not re-run that proof, so within this file it is trusted the
    // same way — and the trust report says so rather than implying otherwise.
    const quantified = decl.binders.length
        ? `∀ ${decl.binders.map(printBinder).join(', ∀ ')}, ${body}`
        : body;
    return `axiom ${decl.name} : ${quantified}`;
}

function declarationBody(decl: TrustedDeclaration): string {
    // Round-tripped through the parser so what Lean sees is the normalised
    // form the rest of the app matched against, not the user's raw spacing.
    const parsed = tryParseProp(decl.source, decl.binders.map((b) => b.name));
    return parsed.ok ? printProp(parsed.prop) : decl.source.trim();
}

// ── Proof module ────────────────────────────────────────────────────────────

/**
 * Generates the full module for one proof component.
 *
 * The proof is emitted as a chain of `have` declarations in dependency order —
 * one per goal card, each preceded by its node marker — so a Lean error lands
 * on a line that maps to exactly one card. Goals underneath a scope-opening
 * rule (`→`/`¬`/`∀` introduction, case split) cannot be hoisted to their own
 * `have`, because they may mention a bound variable, so those are inlined into
 * their parent's term instead.
 */
export function generateModule(
    component: LogicComponent,
    ctx: LogicContext,
    theory: LogicTheory | null,
): GeneratedModule {
    const out = new Emitter();
    const openGoals: string[] = [];

    out.push('-- Generated by AyahLab from a Lean Logic Pipeline. Do not edit by hand.');
    out.push('-- Every declaration below came from the author; nothing here was inferred.');
    out.push();

    emitTheory(theory, out);

    const rootNode = ctx.nodeById.get(component.rootId);
    const rootProp = rootNode ? nodeProp(rootNode, ctx, ctx.bindersByNode.get(component.rootId) ?? []) : null;

    // Premises become theorem parameters rather than global axioms: a local
    // assumption must not change the trusted foundation of the environment.
    const premiseNodes = component.nodeIds
        .map((id) => ctx.nodeById.get(id))
        .filter((n): n is LogicNodeLike => !!n && isLogicNode(n) && n.logic!.role === 'premise')
        .sort((a, b) => a.id.localeCompare(b.id));

    const params = premiseNodes
        .map((n) => {
            const prop = nodeProp(n, ctx);
            return prop ? `(h${shortId(n.id)} : ${printProp(prop)})` : null;
        })
        .filter((p): p is string => !!p);

    const theoremName = `proof_${shortId(component.rootId)}`;
    const hoisted: { nodeId: string; text: string }[] = [];

    /** Emits the proof term for a goal card, hoisting where scope allows. */
    const emitGoal = (goalId: string, inScope: boolean, isRoot: boolean): string => {
        const goalNode = ctx.nodeById.get(goalId);
        if (!goalNode || !isLogicNode(goalNode)) return 'sorry';

        // A rule's obligation port may be fed directly by something that
        // *supplies* a proposition rather than something that needs proving —
        // a premise, an imported theorem, a custom term. Those close the
        // obligation on their own; only a goal card needs a prover behind it.
        const ownRole = goalNode.logic?.role;
        if (ownRole === 'premise') return `h${shortId(goalNode.id)}`;
        if (ownRole === 'imported-theorem') {
            const decl = ctx.declarationById.get(goalNode.logic?.declarationId ?? '');
            return decl?.name ?? `h${shortId(goalNode.id)}`;
        }
        if (ownRole === 'custom-lean') {
            const override = goalNode.logic?.leanOverride?.trim();
            if (override) return `(${override})`;
            openGoals.push(goalId);
            return 'sorry';
        }

        const prover = proverOf(ctx, goalId);
        if (!prover) {
            openGoals.push(goalId);
            return 'sorry';
        }

        const role = prover.logic?.role;
        if (role === 'premise') return `h${shortId(prover.id)}`;
        if (role === 'imported-theorem') {
            const decl = ctx.declarationById.get(prover.logic?.declarationId ?? '');
            return decl?.name ?? `h${shortId(prover.id)}`;
        }
        if (role === 'custom-lean') {
            const override = prover.logic?.leanOverride?.trim();
            if (!override) {
                openGoals.push(goalId);
                return 'sorry';
            }
            return `(${override})`;
        }
        if (role !== 'rule') {
            openGoals.push(goalId);
            return 'sorry';
        }

        const dec = ruleDecomposition(prover, ctx);
        if (!dec.ok) {
            openGoals.push(goalId);
            return 'sorry';
        }

        const childScope = inScope || dec.decomposition.opensScope;
        const childTerms = dec.decomposition.obligations.map((_, i) => {
            const edge = incomingOn(ctx, prover.id, obligationPortId(i));
            if (!edge) {
                openGoals.push(prover.id);
                return 'sorry';
            }
            return emitGoal(edge.from, childScope, false);
        });

        const term = dec.decomposition.build(childTerms);

        // Only a scope-free, non-root goal earns its own `have` line — that is
        // what keeps one Lean error on one card.
        if (!inScope && !isRoot) {
            const prop = nodeProp(goalNode, ctx, ctx.bindersByNode.get(goalId) ?? []);
            const name = `h${shortId(goalId)}`;
            if (prop) {
                hoisted.push({ nodeId: goalId, text: `have ${name} : ${printProp(prop)} := ${term}` });
                return name;
            }
        }
        return term;
    };

    const rootTerm = rootProp ? emitGoal(component.rootId, false, true) : 'sorry';
    if (!rootProp) openGoals.push(component.rootId);

    out.mark(component.rootId);
    out.push(
        `theorem ${theoremName}${params.length ? ' ' + params.join(' ') : ''} : ${
            rootProp ? printProp(rootProp) : 'True'
        } := by`,
    );
    for (const have of hoisted) {
        out.mark(have.nodeId, '  ');
        out.push(`  ${have.text}`);
    }
    out.mark(component.rootId, '  ');
    out.push(`  exact ${rootTerm}`);
    out.push();
    // Lean's own answer to "what does this actually rest on". Anything the
    // graph failed to justify shows up here as `sorryAx`, which the status
    // reducer treats as disqualifying rather than cosmetic.
    out.push(`#print axioms ${theoremName}`);
    out.push();

    return {
        source: out.text,
        sourceMap: out.map,
        theoremName,
        openGoals: [...new Set(openGoals)],
        premiseIds: premiseNodes.map((n) => n.id),
        declared: {
            vocabulary: theory?.vocabulary ?? [],
            assumptions: (theory?.trustedDeclarations ?? []).filter((d) => d.kind !== 'definition'),
        },
    };
}

/** The goal cards a rule created but nothing has been wired into yet. */
export function openObligations(component: LogicComponent, ctx: LogicContext): { nodeId: string; portId: string; prop: PropositionIR }[] {
    const out: { nodeId: string; portId: string; prop: PropositionIR }[] = [];
    for (const id of component.nodeIds) {
        const node = ctx.nodeById.get(id);
        if (!node || node.logic?.role !== 'rule') continue;
        for (const port of derivePorts(node, ctx)) {
            if (port.direction !== 'in' || !port.expects) continue;
            if (!incomingOn(ctx, id, port.id)) out.push({ nodeId: id, portId: port.id, prop: port.expects });
        }
    }
    return out;
}
