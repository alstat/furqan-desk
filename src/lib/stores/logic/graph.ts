// The logic dialect's view of the workbook graph: what a logic node is, what
// ports it has, which nodes form one proof component, and whether the wiring
// is valid.
//
// Ports are *derived*, never persisted (see `derivePorts`). A rule node's four
// premise ports exist because the rule the user chose, applied to the goal it
// feeds, produced four obligations — so the board cannot drift out of step
// with the logic, and a rule change re-shapes the ports immediately.
//
// This module never calls `resolveNodeOutputs` or `transformNode`. A proof has
// named premises, several simultaneous obligations, binders and scopes; the
// row pipeline has one unnamed upstream value. They share the board and the
// document and nothing else.

import { printProp, propEq, tryParseProp, type PropositionIR, type TermIR } from './ir';
import {
    decompose,
    shortId,
    stripForalls,
    type Decomposition,
    type Obligation,
    type RuleId,
    type RuleReference,
    type ScopedHypothesis,
} from './rules';
import {
    declarationProp,
    elaborateTheory,
    type LogicTheory,
    type TrustClass,
    type TrustedDeclaration,
} from './theory';

export type LogicRole =
    | 'theory-root'
    | 'proof-root'
    | 'goal'
    | 'premise'
    | 'rule'
    | 'evidence'
    | 'imported-theorem'
    | 'custom-lean';

/** The logic payload carried by a workbook node of `kind: "logic"`. */
export interface LogicNodePayload {
    role: LogicRole;
    /** The user's own wording, always shown above the formal text. */
    plainLanguage?: string;
    /** `proof-root`/`goal`/`premise`/`custom-lean`: the proposition in surface syntax. */
    source?: string;
    /** `theory-root`: which Theory revision this component is checked against. */
    theoryId?: string;
    theoryRevision?: number;
    theoryHash?: string;
    /** `rule`: the inference rule the user selected. */
    rule?: RuleId;
    /** `rule`: the declaration or hypothesis name it is applied to. */
    referenceName?: string;
    /** `rule`: the witness for `exists_intro`, in surface syntax. */
    witness?: string;
    /** `imported-theorem`: the Theory declaration it references. */
    declarationId?: string;
    /** `custom-lean`: the user's own Lean term. Advanced mode only. */
    leanOverride?: string;
    /** `evidence`: a citation, which Lean never verifies. */
    citation?: string;
    /** Set on a premise the user has explicitly accepted as assumed. */
    trustClass?: TrustClass;
}

export type LogicEdgeRole = 'data' | 'premise' | 'derives' | 'scope' | 'provenance' | 'reference';

/** A derived port. `id` is stable for a given node + rule + goal. */
export interface LogicPort {
    id: string;
    label: string;
    direction: 'in' | 'out';
    role: LogicEdgeRole;
    /** An `in` port on a rule: exactly the proposition that must arrive here. */
    expects?: PropositionIR;
    required: boolean;
}

/** The minimal node shape this module needs — kept structural so it can be fed either the workbook node or a test fixture. */
export interface LogicNodeLike {
    id: string;
    kind: string;
    title?: string;
    logic?: LogicNodePayload;
}

export interface LogicEdgeLike {
    id: string;
    from: string;
    to: string;
    fromPort?: string;
    toPort?: string;
    role?: LogicEdgeRole;
}

export function isLogicNode(node: LogicNodeLike): boolean {
    return node.kind === 'logic' && !!node.logic;
}

// ── Reading a node's proposition ────────────────────────────────────────────

/**
 * The proposition a node states, or null when it does not state one (evidence,
 * a theory root) or its source does not parse.
 *
 * `boundVars` come from the enclosing scope so a goal written under a `∀`
 * introduction can mention the arbitrary value by name.
 */
export function nodeProp(
    node: LogicNodeLike,
    ctx: LogicContext,
    boundVars: readonly string[] = [],
): PropositionIR | null {
    const logic = node.logic;
    if (!logic) return null;
    switch (logic.role) {
        case 'proof-root':
        case 'goal':
        case 'premise':
        case 'custom-lean': {
            if (!logic.source?.trim()) return null;
            const parsed = tryParseProp(logic.source, boundVars);
            return parsed.ok ? parsed.prop : null;
        }
        case 'imported-theorem': {
            const decl = ctx.declarationById.get(logic.declarationId ?? '');
            return decl ? declarationProp(decl) : null;
        }
        default:
            return null;
    }
}

/** The Lean name a node contributes when used as a reference by a rule. */
export function nodeLeanName(node: LogicNodeLike): string {
    const logic = node.logic;
    if (!logic) return `h${shortId(node.id)}`;
    if (logic.role === 'imported-theorem') return logic.referenceName || declNameFallback(node);
    return `h${shortId(node.id)}`;
}

function declNameFallback(node: LogicNodeLike): string {
    return `h${shortId(node.id)}`;
}

// ── Context ─────────────────────────────────────────────────────────────────

/** Everything port derivation and validation need besides the graph itself. */
export interface LogicContext {
    theory: LogicTheory | null;
    declarationById: Map<string, TrustedDeclaration>;
    nodeById: Map<string, LogicNodeLike>;
    edges: LogicEdgeLike[];
    /** Hypotheses in scope at each node, from the rules above it. */
    scopeByNode: Map<string, ScopedHypothesis[]>;
    /** Arbitrary values in scope at each node. */
    bindersByNode: Map<string, string[]>;
}

export function makeContext(
    nodes: LogicNodeLike[],
    edges: LogicEdgeLike[],
    theory: LogicTheory | null,
): LogicContext {
    const ctx: LogicContext = {
        theory,
        declarationById: new Map((theory?.trustedDeclarations ?? []).map((d) => [d.id, d])),
        nodeById: new Map(nodes.map((n) => [n.id, n])),
        edges,
        scopeByNode: new Map(),
        bindersByNode: new Map(),
    };
    computeScopes(ctx, nodes);
    return ctx;
}

/**
 * Propagates each rule's introduced hypotheses and binders down to the child
 * goals it created.
 *
 * Scope is derived from the rules, not from the visual groups — a card being
 * dragged inside a group frame must never change what it may assume.
 */
function computeScopes(ctx: LogicContext, nodes: LogicNodeLike[]): void {
    const roots = nodes.filter((n) => isLogicNode(n) && n.logic!.role === 'proof-root');
    const seen = new Set<string>();

    const visit = (goalId: string, hyps: ScopedHypothesis[], binders: string[]) => {
        if (seen.has(goalId)) return;
        seen.add(goalId);
        ctx.scopeByNode.set(goalId, hyps);
        ctx.bindersByNode.set(goalId, binders);

        const ruleNode = proverOf(ctx, goalId);
        if (!ruleNode || ruleNode.logic?.role !== 'rule') return;
        ctx.scopeByNode.set(ruleNode.id, hyps);
        ctx.bindersByNode.set(ruleNode.id, binders);

        const dec = ruleDecomposition(ruleNode, ctx);
        if (!dec.ok) return;
        for (const [i, ob] of dec.decomposition.obligations.entries()) {
            const child = incomingOn(ctx, ruleNode.id, obligationPortId(i));
            if (!child) continue;
            visit(
                child.from,
                [...hyps, ...ob.hypotheses],
                [...binders, ...ob.binders.map((b) => b.name)],
            );
        }
    };

    for (const root of roots) visit(root.id, [], []);
}

/** The node wired into a goal's `by` port — what claims to prove it. */
export function proverOf(ctx: LogicContext, goalId: string): LogicNodeLike | null {
    const edge = incomingOn(ctx, goalId, 'by');
    return edge ? ctx.nodeById.get(edge.from) ?? null : null;
}

export function incomingOn(ctx: LogicContext, nodeId: string, portId: string): LogicEdgeLike | null {
    return ctx.edges.find((e) => e.to === nodeId && (e.toPort ?? 'in') === portId) ?? null;
}

export const obligationPortId = (index: number) => `a${index}`;

// ── Rule decomposition in graph terms ───────────────────────────────────────

/** The goal a rule node is wired to prove — the target of its `out` edge. */
export function ruleGoalNode(ruleNode: LogicNodeLike, ctx: LogicContext): LogicNodeLike | null {
    const edge = ctx.edges.find((e) => e.from === ruleNode.id && (e.fromPort ?? 'out') === 'out');
    return edge ? ctx.nodeById.get(edge.to) ?? null : null;
}

/**
 * Runs the rule a rule node carries against the goal it feeds.
 *
 * A rule that is not yet wired to a goal, has no rule selected, or whose
 * reference does not resolve produces a failure with a readable reason — which
 * becomes the card's Blocked explanation rather than a silent empty state.
 */
export function ruleDecomposition(
    ruleNode: LogicNodeLike,
    ctx: LogicContext,
): { ok: true; decomposition: Decomposition } | { ok: false; reason: string } {
    const logic = ruleNode.logic;
    if (!logic || logic.role !== 'rule') return { ok: false, reason: 'Not a rule node.' };
    if (!logic.rule) return { ok: false, reason: 'Choose an inference rule.' };

    const goalNode = ruleGoalNode(ruleNode, ctx);
    if (!goalNode) return { ok: false, reason: 'Wire this rule to the goal it proves.' };

    const binders = ctx.bindersByNode.get(goalNode.id) ?? [];
    const goal = nodeProp(goalNode, ctx, binders);
    if (!goal) return { ok: false, reason: 'That goal has no readable proposition yet.' };

    let reference: RuleReference | undefined;
    if (logic.referenceName) {
        const found = resolveReference(logic.referenceName, ruleNode.id, ctx);
        if (!found) return { ok: false, reason: `"${logic.referenceName}" is not in scope here.` };
        reference = found;
    }

    let witness: TermIR | undefined;
    if (logic.witness?.trim()) {
        // A witness is a term, but the parser reads propositions; an atom with
        // no arguments is exactly a bare term, so this reuses it safely.
        const parsed = tryParseProp(logic.witness, binders);
        if (!parsed.ok) return { ok: false, reason: `The witness does not parse: ${parsed.error}` };
        if (parsed.prop.kind !== 'atom') return { ok: false, reason: 'The witness must be a term.' };
        witness =
            parsed.prop.args.length === 0
                ? { kind: binders.includes(parsed.prop.head) ? 'var' : 'const', name: parsed.prop.head }
                : { kind: 'app', head: { kind: 'const', name: parsed.prop.head }, args: parsed.prop.args };
    }

    const result = decompose({ goal, ruleId: logic.rule, nodeId: ruleNode.id, reference, witness });
    return result.ok ? { ok: true, decomposition: result.decomposition } : { ok: false, reason: result.reason };
}

/** Everything a rule at this node may point at: Theory declarations, hypotheses in scope, and wired premises. */
export function availableReferences(nodeId: string, ctx: LogicContext): RuleReference[] {
    const out: RuleReference[] = [];
    for (const decl of ctx.theory?.trustedDeclarations ?? []) {
        const prop = declarationProp(decl);
        if (prop) out.push({ leanName: decl.name, prop });
    }
    for (const hyp of ctx.scopeByNode.get(nodeId) ?? []) {
        out.push({ leanName: hyp.name, prop: hyp.prop });
    }
    // Premises and imported theorems anywhere in the same component are usable
    // as theorem parameters, so they are offered too.
    for (const node of ctx.nodeById.values()) {
        if (!isLogicNode(node)) continue;
        const role = node.logic!.role;
        if (role !== 'premise' && role !== 'imported-theorem') continue;
        const prop = nodeProp(node, ctx);
        if (prop) out.push({ leanName: nodeLeanName(node), prop });
    }
    return out;
}

function resolveReference(name: string, nodeId: string, ctx: LogicContext): RuleReference | null {
    return availableReferences(nodeId, ctx).find((r) => r.leanName === name) ?? null;
}

// ── Ports ───────────────────────────────────────────────────────────────────

/**
 * The ports a logic node has right now.
 *
 * Derived every time from the node's role, its selected rule and the goal it
 * feeds — so a four-premise axiom yields four separately wireable ports, and
 * changing the rule immediately changes them.
 */
export function derivePorts(node: LogicNodeLike, ctx: LogicContext): LogicPort[] {
    const logic = node.logic;
    if (!logic) return [];
    switch (logic.role) {
        case 'theory-root':
            return [{ id: 'out', label: 'Theory', direction: 'out', role: 'reference', required: false }];

        case 'proof-root':
        case 'goal':
            return [
                { id: 'by', label: 'Proved by', direction: 'in', role: 'derives', required: true },
                { id: 'out', label: 'Result', direction: 'out', role: 'derives', required: false },
            ];

        case 'premise':
            return [
                // Evidence attaches here and nowhere else. This is the only
                // cross-dialect connection: an ayah/translation/tafsir card may
                // land on it, and it never satisfies a logical obligation.
                { id: 'evidence', label: 'Evidence', direction: 'in', role: 'provenance', required: false },
                { id: 'out', label: 'Assumption', direction: 'out', role: 'premise', required: false },
            ];

        case 'evidence':
            return [{ id: 'out', label: 'Citation', direction: 'out', role: 'provenance', required: false }];

        case 'imported-theorem':
            return [{ id: 'out', label: 'Theorem', direction: 'out', role: 'premise', required: false }];

        case 'custom-lean':
            return [{ id: 'out', label: 'Term', direction: 'out', role: 'derives', required: false }];

        case 'rule': {
            const ports: LogicPort[] = [
                { id: 'out', label: 'Derives', direction: 'out', role: 'derives', required: true },
            ];
            const dec = ruleDecomposition(node, ctx);
            if (!dec.ok) return ports;
            for (const [i, ob] of dec.decomposition.obligations.entries()) {
                ports.push({
                    id: obligationPortId(i),
                    label: obligationLabel(ob, i),
                    direction: 'in',
                    role: 'premise',
                    expects: ob.prop,
                    required: true,
                });
            }
            return ports;
        }
    }
}

function obligationLabel(ob: Obligation, index: number): string {
    const text = printProp(ob.prop);
    return text.length <= 32 ? text : `Obligation ${index + 1}`;
}

export function portById(node: LogicNodeLike, ctx: LogicContext, portId: string): LogicPort | null {
    return derivePorts(node, ctx).find((p) => p.id === portId) ?? null;
}

// ── Connection validation ───────────────────────────────────────────────────

export type ConnectionCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a wire from one port to another may exist.
 *
 * Rejects rather than coerces: a mismatched drop leaves the graph exactly as
 * it was and the reason is shown. In particular a data card (an ayah, a
 * translation) can only ever reach a premise's evidence port — cited source
 * material must never satisfy a formal obligation.
 */
export function canConnect(
    from: LogicNodeLike,
    fromPortId: string,
    to: LogicNodeLike,
    toPortId: string,
    ctx: LogicContext,
): ConnectionCheck {
    if (from.id === to.id) return { ok: false, reason: 'A card cannot feed itself.' };

    const toIsLogic = isLogicNode(to);
    const fromIsLogic = isLogicNode(from);

    if (!toIsLogic) {
        // Logic never feeds the row pipeline: a proof produces a proof, not rows.
        if (fromIsLogic) return { ok: false, reason: 'A logic card cannot feed a data card.' };
        return { ok: true };
    }

    const toPort = portById(to, ctx, toPortId);
    if (!toPort) return { ok: false, reason: 'That port no longer exists.' };
    if (toPort.direction !== 'in') return { ok: false, reason: 'That is an output port.' };

    if (!fromIsLogic) {
        if (toPort.role !== 'provenance') {
            return {
                ok: false,
                reason: 'A data card can only attach as evidence — it cannot satisfy a logical obligation.',
            };
        }
        return { ok: true };
    }

    const fromPort = portById(from, ctx, fromPortId);
    if (!fromPort) return { ok: false, reason: 'That port no longer exists.' };
    if (fromPort.direction !== 'out') return { ok: false, reason: 'That is an input port.' };

    if (toPort.role === 'provenance' && fromPort.role !== 'provenance') {
        return { ok: false, reason: 'Only an evidence card belongs on an evidence port.' };
    }
    if (toPort.role !== 'provenance' && fromPort.role === 'provenance') {
        return { ok: false, reason: 'Evidence does not prove anything — attach it to an evidence port.' };
    }

    // A rule's premise port names the exact proposition it needs.
    if (toPort.expects) {
        const binders = ctx.bindersByNode.get(from.id) ?? [];
        const supplied = nodeProp(from, ctx, binders);
        if (!supplied) return { ok: false, reason: 'That card does not state a proposition yet.' };
        if (!propEq(supplied, toPort.expects) && !propEq(stripForalls(supplied).body, toPort.expects)) {
            return {
                ok: false,
                reason: `This port needs ${printProp(toPort.expects)}.`,
            };
        }
    }

    return { ok: true };
}

// ── Component discovery ─────────────────────────────────────────────────────

export interface LogicComponent {
    rootId: string;
    theoryRootId?: string;
    /** Every logic node reachable from the root through logical edges. */
    nodeIds: string[];
}

/**
 * The nodes belonging to one proof, found from its root by following logical
 * edges — never from a visual group, which stays presentation-only.
 */
export function findComponent(rootId: string, ctx: LogicContext): LogicComponent {
    const nodeIds: string[] = [];
    const seen = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const node = ctx.nodeById.get(id);
        if (!node || !isLogicNode(node)) continue;
        nodeIds.push(id);
        for (const edge of ctx.edges) {
            if (edge.to === id && edge.role !== 'provenance') stack.push(edge.from);
        }
    }
    const theoryRootId = nodeIds.find((id) => ctx.nodeById.get(id)?.logic?.role === 'theory-root');
    return { rootId, theoryRootId, nodeIds };
}

/**
 * A hash of everything that could change what Lean is asked to check —
 * propositions, rule choices, references, witnesses, logical wiring, the
 * pinned Theory, and the toolchain. Geometry, titles, selection, panel state
 * and visual groups are all excluded, exactly as `pipelineNodeKey` excludes
 * them for the row pipeline, so dragging a proof around never re-verifies it.
 */
export function logicComponentKey(
    component: LogicComponent,
    ctx: LogicContext,
    leanVersion = '',
    projectFingerprint = '',
): string {
    const nodes = [...component.nodeIds]
        .sort()
        .map((id) => {
            const logic = ctx.nodeById.get(id)?.logic;
            if (!logic) return id;
            const { role, source, rule, referenceName, witness, declarationId, leanOverride } = logic;
            return JSON.stringify({ id, role, source, rule, referenceName, witness, declarationId, leanOverride });
        });
    const edges = ctx.edges
        .filter((e) => component.nodeIds.includes(e.to) && e.role !== 'provenance')
        .map((e) => `${e.from}:${e.fromPort ?? 'out'}>${e.to}:${e.toPort ?? 'in'}`)
        .sort();
    const theory = ctx.theory ? `${ctx.theory.id}@${ctx.theory.revision}#${ctx.theory.contentHash}` : 'none';
    return [theory, leanVersion, projectFingerprint, ...nodes, ...edges].join('|');
}

// ── Structural validation ───────────────────────────────────────────────────

export interface LogicProblem {
    nodeId: string;
    portId?: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
}

/**
 * Structural checks before any Lean is generated: unparseable propositions,
 * unfilled required ports, unresolvable rules, and cycles.
 *
 * Unlike the row pipeline — which tolerates a cycle by returning no rows — a
 * logical cycle is an error. "A because B because A" is not a proof, and
 * silently returning nothing would let it look merely unfinished.
 */
export function validateComponent(component: LogicComponent, ctx: LogicContext): LogicProblem[] {
    const problems: LogicProblem[] = [];

    for (const id of component.nodeIds) {
        const node = ctx.nodeById.get(id);
        if (!node?.logic) continue;
        const logic = node.logic;
        const binders = ctx.bindersByNode.get(id) ?? [];

        if (logic.role === 'goal' || logic.role === 'proof-root' || logic.role === 'premise') {
            if (!logic.source?.trim()) {
                problems.push({ nodeId: id, severity: 'error', message: 'This card has no proposition yet.' });
            } else {
                const parsed = tryParseProp(logic.source, binders);
                if (!parsed.ok) {
                    problems.push({ nodeId: id, severity: 'error', message: `Does not parse: ${parsed.error}` });
                }
            }
        }

        if (logic.role === 'rule') {
            const dec = ruleDecomposition(node, ctx);
            if (!dec.ok) {
                problems.push({ nodeId: id, severity: 'error', message: dec.reason });
            }
        }

        for (const port of derivePorts(node, ctx)) {
            if (port.direction !== 'in' || !port.required) continue;
            if (!incomingOn(ctx, id, port.id)) {
                problems.push({
                    nodeId: id,
                    portId: port.id,
                    severity: 'info',
                    message:
                        port.role === 'derives'
                            ? 'Open goal — nothing proves this yet.'
                            : `Nothing supplies ${port.label} yet.`,
                });
            }
        }
    }

    for (const cycle of findCycles(component, ctx)) {
        problems.push({
            nodeId: cycle,
            severity: 'error',
            message: 'This card takes part in a circular argument.',
        });
    }

    return problems;
}

/** Node ids that sit on a logical cycle. */
function findCycles(component: LogicComponent, ctx: LogicContext): string[] {
    const onCycle = new Set<string>();
    const state = new Map<string, 'visiting' | 'done'>();
    const walk = (id: string, path: string[]): void => {
        const seen = state.get(id);
        if (seen === 'done') return;
        if (seen === 'visiting') {
            const start = path.indexOf(id);
            path.slice(start >= 0 ? start : 0).forEach((n) => onCycle.add(n));
            return;
        }
        state.set(id, 'visiting');
        for (const edge of ctx.edges) {
            if (edge.to !== id || edge.role === 'provenance') continue;
            if (!component.nodeIds.includes(edge.from)) continue;
            walk(edge.from, [...path, id]);
        }
        state.set(id, 'done');
    };
    component.nodeIds.forEach((id) => walk(id, []));
    return [...onCycle];
}

/** The Theory a component pins, resolved from its theory-root card. */
export function componentTheory(
    component: LogicComponent,
    ctx: LogicContext,
): { theory: LogicTheory | null; stale: boolean } {
    const rootNode = component.theoryRootId ? ctx.nodeById.get(component.theoryRootId) : null;
    const pinnedHash = rootNode?.logic?.theoryHash;
    const theory = ctx.theory;
    if (!theory) return { theory: null, stale: false };
    // A Theory edited since this proof last recorded its hash is stale: the
    // proof may still be right, but it has not been checked against what the
    // Theory says now.
    return { theory, stale: !!pinnedHash && pinnedHash !== theory.contentHash };
}

export function theoryTrustSummary(theory: LogicTheory | null): ReturnType<typeof elaborateTheory> | null {
    return theory ? elaborateTheory(theory) : null;
}
