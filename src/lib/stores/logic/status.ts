// Turning a Lean run into what the cards show — and, just as importantly,
// keeping two different kinds of confidence apart.
//
// The product must never collapse "Lean checked this inference" and "this
// premise is true" into one green tick. So a node's status here is not a
// single boolean: `Checked` means the kernel accepted the step, `Assumed`
// means the user supplied it without proof, and `ExternallySupported` means
// something is cited that Lean has no opinion about whatsoever. A conclusion
// can be Checked while every premise beneath it stays amber; that is the
// normal and correct outcome for most humanities arguments, not a defect.

import type { GeneratedModule, SourceMapEntry } from './codegen';
import { isLogicNode, type LogicComponent, type LogicContext } from './graph';

export type NodeStatus =
    | 'checked'
    | 'assumed'
    | 'externally-supported'
    | 'blocked'
    | 'invalid'
    | 'checking'
    | 'stale'
    | 'incomplete';

/** One Lean message, in the shape `lean_compile` returns it. */
export interface LeanDiagnostic {
    severity: string;
    line: number;
    column: number;
    end_line: number;
    end_column: number;
    message: string;
}

export interface LeanCompileResult {
    diagnostics: LeanDiagnostic[];
    raw: string;
    ok: boolean;
    elapsed_ms: number;
    cancelled: boolean;
    timed_out: boolean;
}

export interface NodeDiagnostic {
    nodeId: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    line: number;
}

/**
 * Maps a Lean line back to the card responsible for it.
 *
 * Markers are emitted directly above the line they describe, so the owning
 * card is the one with the greatest marker line at or below the diagnostic.
 */
export function nodeForLine(sourceMap: SourceMapEntry[], line: number): string | null {
    let best: SourceMapEntry | null = null;
    for (const entry of sourceMap) {
        if (entry.line <= line && (!best || entry.line > best.line)) best = entry;
    }
    return best?.nodeId ?? null;
}

export function mapDiagnostics(result: LeanCompileResult, module: GeneratedModule): NodeDiagnostic[] {
    const out: NodeDiagnostic[] = [];
    for (const diag of result.diagnostics) {
        // `#print axioms` output is a trust input, not a problem with a card.
        if (diag.message.includes('depends on axioms')) continue;
        const nodeId = nodeForLine(module.sourceMap, diag.line);
        if (!nodeId) continue;
        out.push({
            nodeId,
            severity: diag.severity === 'error' ? 'error' : diag.severity === 'warning' ? 'warning' : 'info',
            message: diag.message.trim(),
            line: diag.line,
        });
    }
    return out;
}

// ── Trust ───────────────────────────────────────────────────────────────────

export interface TrustReport {
    /** Axiom names Lean itself says the theorem depends on. */
    axioms: string[];
    /** True when Lean's own dependency list contains `sorryAx`. */
    usesSorry: boolean;
    /** Axioms beyond Lean's three standard ones — i.e. what the author added. */
    authorAxioms: string[];
    /** Local assumptions carried as theorem parameters. */
    premiseIds: string[];
    /** Goals with nothing wired to prove them. */
    openGoals: string[];
}

/**
 * Lean's own three foundational axioms. Anything else in the dependency list
 * was put there by the author and belongs in the visible trust report.
 */
const STANDARD_AXIOMS = new Set(['propext', 'Classical.choice', 'Quot.sound']);

/**
 * Reads `#print axioms` out of a run.
 *
 * This is the honest answer to "what does this proof actually rest on",
 * because it comes from the kernel rather than from our own bookkeeping — if
 * codegen ever emitted a `sorry` we failed to track, this still catches it.
 */
export function extractTrust(result: LeanCompileResult, module: GeneratedModule): TrustReport {
    const haystack = [result.raw, ...result.diagnostics.map((d) => d.message)].join('\n');
    const match = new RegExp(
        `'?${module.theoremName}'?\\s+depends on axioms:\\s*\\[([^\\]]*)\\]`,
    ).exec(haystack);
    const axioms = match
        ? match[1]
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean)
        : [];
    return {
        axioms,
        // Either signal counts: Lean's own report, or a `sorry` we emitted for
        // a goal nothing was wired into.
        usesSorry: axioms.includes('sorryAx') || module.openGoals.length > 0,
        authorAxioms: axioms.filter((a) => !STANDARD_AXIOMS.has(a) && a !== 'sorryAx'),
        premiseIds: module.premiseIds,
        openGoals: module.openGoals,
    };
}

// ── Node statuses ───────────────────────────────────────────────────────────

export interface StatusInput {
    component: LogicComponent;
    ctx: LogicContext;
    module: GeneratedModule;
    result: LeanCompileResult | null;
    trust: TrustReport | null;
    diagnostics: NodeDiagnostic[];
    /** True when the Theory moved since this proof last recorded its hash. */
    stale: boolean;
    checking: boolean;
}

/**
 * The status each card shows.
 *
 * The important asymmetry: an error anywhere makes a card Invalid, but a
 * clean run does *not* make every card Checked. A premise stays Assumed no
 * matter how green the proof around it is, and a conclusion resting on an
 * unwired goal stays Incomplete even though the module compiled — because it
 * compiled with a `sorry`.
 */
export function computeStatuses(input: StatusInput): Map<string, NodeStatus> {
    const { component, ctx, module, result, trust, diagnostics, stale, checking } = input;
    const statuses = new Map<string, NodeStatus>();
    const errored = new Set(diagnostics.filter((d) => d.severity === 'error').map((d) => d.nodeId));
    const openGoals = new Set(module.openGoals);

    for (const id of component.nodeIds) {
        const node = ctx.nodeById.get(id);
        if (!node || !isLogicNode(node)) continue;
        const role = node.logic!.role;

        if (checking) {
            statuses.set(id, 'checking');
            continue;
        }
        if (errored.has(id)) {
            statuses.set(id, 'invalid');
            continue;
        }
        if (stale) {
            statuses.set(id, 'stale');
            continue;
        }

        switch (role) {
            case 'evidence':
                // Never anything else. A citation is not a proof step, and no
                // amount of successful checking upgrades it.
                statuses.set(id, 'externally-supported');
                break;
            case 'premise':
                // Also never anything else: the whole point is that the user
                // asserted this, so Lean's opinion of the surrounding proof is
                // irrelevant to its trust class.
                statuses.set(id, 'assumed');
                break;
            case 'theory-root':
                statuses.set(id, result?.ok ? 'checked' : 'incomplete');
                break;
            case 'goal':
            case 'proof-root':
                if (openGoals.has(id)) statuses.set(id, 'blocked');
                else if (!result) statuses.set(id, 'incomplete');
                else if (!result.ok) statuses.set(id, 'invalid');
                else if (trust?.usesSorry) statuses.set(id, 'incomplete');
                else statuses.set(id, 'checked');
                break;
            case 'rule':
                if (openGoals.has(id)) statuses.set(id, 'blocked');
                else if (!result) statuses.set(id, 'incomplete');
                else statuses.set(id, result.ok && !trust?.usesSorry ? 'checked' : 'invalid');
                break;
            case 'imported-theorem':
                statuses.set(id, result?.ok ? 'checked' : 'incomplete');
                break;
            case 'custom-lean':
                // An escape hatch is only as good as the run that accepted it,
                // and it is flagged `unsafe`-adjacent in the inspector.
                statuses.set(id, result?.ok ? 'checked' : 'invalid');
                break;
        }
    }
    return statuses;
}

/** The colour family each status paints with, shared by card, port and wire. */
export const STATUS_TONE: Record<NodeStatus, 'green' | 'amber' | 'blue' | 'red' | 'grey'> = {
    checked: 'green',
    assumed: 'amber',
    'externally-supported': 'blue',
    blocked: 'grey',
    invalid: 'red',
    checking: 'grey',
    stale: 'amber',
    incomplete: 'grey',
};

/**
 * The plain-language sentence shown under a selected conclusion.
 *
 * Deliberately says two things in one breath, because the single most common
 * misreading of a proof tool is "green means true".
 */
export function explainConclusion(trust: TrustReport | null, premiseCount: number, ok: boolean): string {
    if (!trust) return 'Not checked yet.';
    if (trust.openGoals.length) {
        return `${trust.openGoals.length} goal${trust.openGoals.length === 1 ? '' : 's'} still have nothing proving them, so this is not verified yet.`;
    }
    if (!ok) return 'Lean rejected this proof — see the cards marked in red.';
    if (trust.usesSorry) return 'This proof still contains a gap, so it is not verified.';
    if (premiseCount === 0) {
        return 'Lean verified this conclusion from the theory’s own declarations.';
    }
    return `This conclusion is logically verified if the ${premiseCount} amber premise${
        premiseCount === 1 ? '' : 's'
    } are accepted. Lean checked the inference, but it did not establish those premises.`;
}

// ── "Necessary" is several different claims ─────────────────────────────────

export type NecessityLabel =
    | 'used-by-this-proof'
    | 'structurally-required'
    | 'redundant-in-this-proof'
    | 'generated-obligation'
    | 'necessity-unknown';

/**
 * Which precise claim we can make about a card's role.
 *
 * Never returns "logically necessary": that would mean certifying that
 * removing the card makes the conclusion underivable, which is not decidable
 * in general Lean. Dependency closure is reliable; global minimality is not,
 * and the UI must not blur the two.
 */
export function necessityOf(nodeId: string, module: GeneratedModule, ctx: LogicContext): NecessityLabel {
    const node = ctx.nodeById.get(nodeId);
    const role = node?.logic?.role;
    if (role === 'goal' && module.openGoals.includes(nodeId)) return 'generated-obligation';
    // A premise that never made it into the generated term is connected but
    // unused — worth saying plainly rather than leaving it looking load-bearing.
    if (role === 'premise') {
        const name = `h${nodeId.replace(/-/g, '').slice(0, 8)}`;
        return module.source.includes(name) ? 'used-by-this-proof' : 'redundant-in-this-proof';
    }
    if (role === 'rule' || role === 'proof-root') return 'structurally-required';
    return 'necessity-unknown';
}
