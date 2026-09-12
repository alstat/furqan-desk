// Orchestration: from a board full of cards to per-card statuses.
//
// Kept out of WorkbookBoard.svelte so the board keeps owning gestures and
// geometry while this owns "which proofs are on this board, what Lean says
// about them, and what each card should therefore show".

import { generateModule, type GeneratedModule } from './codegen';
import { leanEngine, type VerificationCertificate } from './engine';
import {
    componentTheory,
    findComponent,
    isLogicNode,
    logicComponentKey,
    makeContext,
    validateComponent,
    type LogicComponent,
    type LogicContext,
    type LogicEdgeLike,
    type LogicNodeLike,
    type LogicProblem,
} from './graph';
import {
    computeStatuses,
    type NodeDiagnostic,
    type NodeStatus,
    type TrustReport,
} from './status';
import type { LogicTheory } from './theory';

export interface ProofOutcome {
    rootId: string;
    component: LogicComponent;
    module: GeneratedModule;
    statuses: Map<string, NodeStatus>;
    diagnostics: NodeDiagnostic[];
    problems: LogicProblem[];
    trust: TrustReport | null;
    ok: boolean;
    stale: boolean;
    /** The semantic hash this outcome describes — compare before re-running. */
    key: string;
}

export interface BoardLogicState {
    ctx: LogicContext;
    components: LogicComponent[];
    outcomes: Map<string, ProofOutcome>;
    /** Card id → status, merged across every proof on the board. */
    statuses: Map<string, NodeStatus>;
    /** Card id → the messages that card should show. */
    messages: Map<string, string[]>;
}

/** The Theory a board is currently working against. */
export function activeTheory(logic: { theories?: LogicTheory[]; activeTheoryId?: string } | undefined): LogicTheory | null {
    if (!logic?.theories?.length) return null;
    return logic.theories.find((t) => t.id === logic.activeTheoryId) ?? logic.theories[logic.theories.length - 1];
}

/** Every proof root on the board, in document order. */
export function proofRoots(nodes: LogicNodeLike[]): LogicNodeLike[] {
    return nodes.filter((n) => isLogicNode(n) && n.logic!.role === 'proof-root');
}

/**
 * The structural pass: context, components, and everything knowable without
 * running Lean. Cheap enough to run on every edit, and it is what fills the
 * board in before the first compile returns.
 */
export function analyseBoard(
    nodes: LogicNodeLike[],
    edges: LogicEdgeLike[],
    theory: LogicTheory | null,
): BoardLogicState {
    const ctx = makeContext(nodes, edges, theory);
    const components = proofRoots(nodes).map((root) => findComponent(root.id, ctx));
    const statuses = new Map<string, NodeStatus>();
    const messages = new Map<string, string[]>();

    for (const component of components) {
        for (const problem of validateComponent(component, ctx)) {
            pushMessage(messages, problem.nodeId, problem.message);
            if (problem.severity === 'error') statuses.set(problem.nodeId, 'invalid');
        }
    }

    return { ctx, components, outcomes: new Map(), statuses, messages };
}

function pushMessage(map: Map<string, string[]>, id: string, message: string): void {
    const list = map.get(id);
    if (list) list.push(message);
    else map.set(id, [message]);
}

/**
 * Runs one proof through Lean and reduces the answer to card statuses.
 *
 * `final` skips the debounce and asks for a fresh batch compile — the only
 * thing a shareable certificate may be built from. An incremental check is
 * for feedback while editing, never for a verdict.
 */
export async function verifyProof(
    component: LogicComponent,
    ctx: LogicContext,
    options: { final?: boolean; leanVersion?: string; projectFingerprint?: string } = {},
): Promise<{ outcome: ProofOutcome; certificate: VerificationCertificate | null }> {
    const { theory, stale } = componentTheory(component, ctx);
    const module = generateModule(component, ctx, theory);
    const key = logicComponentKey(component, ctx, options.leanVersion, options.projectFingerprint);
    const problems = validateComponent(component, ctx);

    const engine = leanEngine();
    const session = await engine.openSession({ rootId: component.rootId });

    let diagnostics: NodeDiagnostic[] = [];
    let trust: TrustReport | null = null;
    let result = null as Parameters<typeof computeStatuses>[0]['result'];
    let certificate: VerificationCertificate | null = null;

    if (options.final) {
        certificate = await engine.verifyFinal(session, { module, graphHash: key });
        diagnostics = certificate.diagnostics;
        trust = certificate.trust;
        result = {
            diagnostics: [],
            raw: '',
            ok: certificate.ok || !certificate.diagnostics.some((d) => d.severity === 'error'),
            elapsed_ms: certificate.elapsedMs,
            cancelled: false,
            timed_out: false,
        };
    } else {
        // The subscription is the only way a debounced run reports back, so it
        // is awaited here rather than fired and forgotten.
        result = await new Promise<Parameters<typeof computeStatuses>[0]['result']>((resolve) => {
            const stop = engine.subscribe(session, (event) => {
                if (event.type === 'result') {
                    diagnostics = event.diagnostics;
                    trust = event.trust;
                    stop();
                    resolve(event.result);
                } else if (event.type === 'error' || event.type === 'cancelled') {
                    stop();
                    resolve(null);
                }
            });
            void engine.updateGraph(session, { module, graphHash: key });
        });
    }

    const statuses = computeStatuses({
        component,
        ctx,
        module,
        result,
        trust,
        diagnostics,
        stale,
        checking: false,
    });

    for (const problem of problems) {
        if (problem.severity === 'error') statuses.set(problem.nodeId, 'invalid');
    }

    const outcome: ProofOutcome = {
        rootId: component.rootId,
        component,
        module,
        statuses,
        diagnostics,
        problems,
        trust,
        ok: !!result?.ok && !trust?.usesSorry,
        stale,
        key,
    };
    return { outcome, certificate };
}

/** Folds a finished proof's statuses and messages into the board-wide maps. */
export function mergeOutcome(state: BoardLogicState, outcome: ProofOutcome): BoardLogicState {
    const statuses = new Map(state.statuses);
    const messages = new Map(state.messages);
    for (const [id, status] of outcome.statuses) statuses.set(id, status);
    for (const diag of outcome.diagnostics) pushMessage(messages, diag.nodeId, diag.message);
    const outcomes = new Map(state.outcomes);
    outcomes.set(outcome.rootId, outcome);
    return { ...state, statuses, messages, outcomes };
}
