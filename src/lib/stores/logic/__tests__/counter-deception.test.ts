// The vertical slice, end to end: a Theory the author declared, a proof they
// drove rule by rule, and the Lean module that comes out of it.
//
// The assertions worth reading are the ones about what the app *refuses* to
// do — it does not invent the witness, it does not close a goal nobody wired
// up, and an unfinished proof never reports as verified.

import { describe, expect, it } from 'vitest';
import { generateModule } from '../codegen';
import {
    findComponent,
    makeContext,
    derivePorts,
    canConnect,
    validateComponent,
    type LogicEdgeLike,
    type LogicNodeLike,
} from '../graph';
import { emptyTheory, theoryContentHash, elaborateTheory, publishRevision, type LogicTheory } from '../theory';
import { parseProp, printProp } from '../ir';
import { decompose, matchApplication } from '../rules';
import { childGoalEdge, planChildGoals } from '../authoring';
import { computeStatuses, explainConclusion, extractTrust, nodeForLine } from '../status';

// ── The Counter-Deception theory, as the author would build it ──────────────

function counterDeceptionTheory(): LogicTheory {
    const theory = emptyTheory('Counter-Deception');
    const vocab = (kind: 'type' | 'entity' | 'predicate', name: string, signature?: string) => ({
        id: `v-${name}`,
        kind,
        name,
        signature,
    });
    theory.vocabulary = [
        vocab('type', 'Act'),
        vocab('entity', 'rescue', 'Act'),
        vocab('predicate', 'Deceptive', 'Act → Prop'),
        vocab('predicate', 'DefeatsWrongfulPlot', 'Act → Prop'),
        vocab('predicate', 'ProtectsInnocents', 'Act → Prop'),
        vocab('predicate', 'Proportionate', 'Act → Prop'),
        vocab('predicate', 'Permissible', 'Act → Prop'),
        vocab('predicate', 'Wrong', 'Act → Prop'),
    ];
    theory.trustedDeclarations = [
        {
            id: 'd-justified',
            kind: 'axiom',
            name: 'justifiedCounterDeception',
            binders: [{ name: 'a', type: 'Act' }],
            source: 'Deceptive a → DefeatsWrongfulPlot a → ProtectsInnocents a → Proportionate a → Permissible a',
        },
        {
            id: 'd-notwrong',
            kind: 'axiom',
            name: 'permissibleNotWrong',
            binders: [{ name: 'a', type: 'Act' }],
            source: 'Permissible a → ¬ Wrong a',
        },
    ];
    theory.contentHash = theoryContentHash(theory);
    return theory;
}

// ── The proof graph the author builds by choosing rules ─────────────────────

const logicNode = (id: string, logic: LogicNodeLike['logic']): LogicNodeLike => ({ id, kind: 'logic', logic });

/**
 * The finished graph: conclusion ← permissibleNotWrong ← "permissible" goal
 * ← justifiedCounterDeception ← four premises.
 */
function counterDeceptionGraph(): { nodes: LogicNodeLike[]; edges: LogicEdgeLike[] } {
    const nodes: LogicNodeLike[] = [
        logicNode('theory', { role: 'theory-root', theoryId: 'x' }),
        logicNode('root', { role: 'proof-root', source: '¬ Wrong rescue', plainLanguage: 'The act is not wrong.' }),
        logicNode('r-notwrong', { role: 'rule', rule: 'apply', referenceName: 'permissibleNotWrong' }),
        logicNode('g-permissible', { role: 'goal', source: 'Permissible rescue' }),
        logicNode('r-justified', { role: 'rule', rule: 'apply', referenceName: 'justifiedCounterDeception' }),
        logicNode('p-deceptive', { role: 'premise', source: 'Deceptive rescue' }),
        logicNode('p-defeats', { role: 'premise', source: 'DefeatsWrongfulPlot rescue' }),
        logicNode('p-protects', { role: 'premise', source: 'ProtectsInnocents rescue' }),
        logicNode('p-proportionate', { role: 'premise', source: 'Proportionate rescue' }),
    ];
    const edges: LogicEdgeLike[] = [
        { id: 'e1', from: 'r-notwrong', to: 'root', fromPort: 'out', toPort: 'by', role: 'derives' },
        { id: 'e2', from: 'g-permissible', to: 'r-notwrong', fromPort: 'out', toPort: 'a0', role: 'premise' },
        { id: 'e3', from: 'r-justified', to: 'g-permissible', fromPort: 'out', toPort: 'by', role: 'derives' },
        { id: 'e4', from: 'p-deceptive', to: 'r-justified', fromPort: 'out', toPort: 'a0', role: 'premise' },
        { id: 'e5', from: 'p-defeats', to: 'r-justified', fromPort: 'out', toPort: 'a1', role: 'premise' },
        { id: 'e6', from: 'p-protects', to: 'r-justified', fromPort: 'out', toPort: 'a2', role: 'premise' },
        { id: 'e7', from: 'p-proportionate', to: 'r-justified', fromPort: 'out', toPort: 'a3', role: 'premise' },
    ];
    return { nodes, edges };
}

function build(nodes: LogicNodeLike[], edges: LogicEdgeLike[], theory: LogicTheory) {
    const ctx = makeContext(nodes, edges, theory);
    const component = findComponent('root', ctx);
    return { ctx, component, module: generateModule(component, ctx, theory) };
}

// ── Theory ──────────────────────────────────────────────────────────────────

describe('theory', () => {
    it('elaborates cleanly and counts assumptions apart from vocabulary', () => {
        const e = elaborateTheory(counterDeceptionTheory());
        expect(e.problems.filter((p) => p.severity === 'error')).toEqual([]);
        expect(e.trust.vocabulary).toHaveLength(8);
        // The two moral rules are assumptions; the eight declarations are not.
        expect(e.trust.axioms.map((a) => a.name)).toEqual([
            'justifiedCounterDeception',
            'permissibleNotWrong',
        ]);
    });

    it('rejects a statement using undeclared vocabulary', () => {
        const theory = counterDeceptionTheory();
        theory.trustedDeclarations[0].source = 'Sneaky a → Permissible a';
        const e = elaborateTheory(theory);
        expect(e.ok).toBe(false);
        expect(e.problems.some((p) => p.message.includes('Sneaky'))).toBe(true);
    });

    it('mints a new revision only when something semantic changed', () => {
        const first = counterDeceptionTheory();
        const cosmetic = { ...first, name: 'Renamed' };
        expect(publishRevision(first, cosmetic).revision).toBe(first.revision);

        const edited = structuredClone(first);
        edited.trustedDeclarations[1].source = 'Permissible a → Wrong a';
        const next = publishRevision(first, edited);
        expect(next.revision).toBe(first.revision + 1);
        expect(next.contentHash).not.toBe(first.contentHash);
    });
});

// ── Decomposition: what a rule choice creates ───────────────────────────────

describe('goal decomposition', () => {
    it('turns a four-premise axiom into exactly four obligations', () => {
        const decl = parseProp(
            '∀ a : Act, Deceptive a → DefeatsWrongfulPlot a → ProtectsInnocents a → Proportionate a → Permissible a',
        );
        const goal = parseProp('Permissible rescue');
        const matched = matchApplication(decl, goal);
        expect(matched.ok).toBe(true);
        if (!matched.ok) return;
        expect(matched.antecedents.map((p) => printProp(p))).toEqual([
            'Deceptive rescue',
            'DefeatsWrongfulPlot rescue',
            'ProtectsInnocents rescue',
            'Proportionate rescue',
        ]);
    });

    it('refuses to guess an existential witness', () => {
        const goal = parseProp('∃ a : Act, Deceptive a');
        const result = decompose({ goal, ruleId: 'exists_intro', nodeId: 'n1' });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/will not choose/i);
    });

    it('accepts the witness once the user supplies it', () => {
        const goal = parseProp('∃ a : Act, Deceptive a');
        const result = decompose({
            goal,
            ruleId: 'exists_intro',
            nodeId: 'n1',
            witness: { kind: 'const', name: 'rescue' },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(printProp(result.decomposition.obligations[0].prop)).toBe('Deceptive rescue');
    });

    it('does not apply a rule whose conclusion does not match the goal', () => {
        const decl = parseProp('∀ a : Act, Permissible a → ¬ Wrong a');
        expect(matchApplication(decl, parseProp('Deceptive rescue')).ok).toBe(false);
    });
});

// ── Ports ───────────────────────────────────────────────────────────────────

describe('typed ports', () => {
    it('derives one premise port per obligation', () => {
        const { nodes, edges } = counterDeceptionGraph();
        const ctx = makeContext(nodes, edges, counterDeceptionTheory());
        const ports = derivePorts(nodes.find((n) => n.id === 'r-justified')!, ctx);
        expect(ports.filter((p) => p.direction === 'in')).toHaveLength(4);
        expect(ports.filter((p) => p.direction === 'in').map((p) => p.id)).toEqual(['a0', 'a1', 'a2', 'a3']);
    });

    it('rejects a premise whose proposition is not what the port needs', () => {
        const { nodes, edges } = counterDeceptionGraph();
        const ctx = makeContext(nodes, edges, counterDeceptionTheory());
        const wrong = logicNode('p-wrong', { role: 'premise', source: 'Wrong rescue' });
        const check = canConnect(wrong, 'out', nodes.find((n) => n.id === 'r-justified')!, 'a0', ctx);
        expect(check.ok).toBe(false);
    });

    it('lets a data card attach only as evidence, never as a premise', () => {
        const { nodes, edges } = counterDeceptionGraph();
        const ctx = makeContext(nodes, edges, counterDeceptionTheory());
        const ayah: LogicNodeLike = { id: 'ayah1', kind: 'ayah' };
        const premise = nodes.find((n) => n.id === 'p-deceptive')!;
        expect(canConnect(ayah, 'out', premise, 'evidence', ctx).ok).toBe(true);
        const rule = nodes.find((n) => n.id === 'r-justified')!;
        const blocked = canConnect(ayah, 'out', rule, 'a0', ctx);
        expect(blocked.ok).toBe(false);
        if (blocked.ok) return;
        expect(blocked.reason).toMatch(/evidence/i);
    });
});

// ── Code generation ─────────────────────────────────────────────────────────

describe('generated module', () => {
    it('emits the premises as theorem parameters and no open goals', () => {
        const theory = counterDeceptionTheory();
        const { nodes, edges } = counterDeceptionGraph();
        const { module } = build(nodes, edges, theory);
        expect(module.openGoals).toEqual([]);
        expect(module.premiseIds).toHaveLength(4);
        expect(module.source).not.toContain('sorry');
        expect(module.source).toContain('axiom justifiedCounterDeception');
        expect(module.source).toContain('#print axioms');
    });

    it('is deterministic', () => {
        const theory = counterDeceptionTheory();
        const a = build(...Object.values(counterDeceptionGraph()) as [LogicNodeLike[], LogicEdgeLike[]], theory);
        const b = build(...Object.values(counterDeceptionGraph()) as [LogicNodeLike[], LogicEdgeLike[]], theory);
        expect(a.module.source).toBe(b.module.source);
    });

    it('leaves an unwired obligation as a reported open goal, not a silent one', () => {
        const theory = counterDeceptionTheory();
        const { nodes, edges } = counterDeceptionGraph();
        // Pull out the fourth premise the author has not yet supplied.
        const trimmed = edges.filter((e) => e.id !== 'e7');
        const { module, ctx, component } = build(nodes, trimmed, theory);
        expect(module.openGoals.length).toBeGreaterThan(0);
        expect(module.source).toContain('sorry');
        const problems = validateComponent(component, ctx);
        expect(problems.some((p) => p.message.includes('Nothing supplies'))).toBe(true);
    });

    it('maps every node marker to a real line', () => {
        const theory = counterDeceptionTheory();
        const { nodes, edges } = counterDeceptionGraph();
        const { module } = build(nodes, edges, theory);
        const lines = module.source.split('\n');
        for (const entry of module.sourceMap) {
            expect(entry.line).toBeGreaterThan(0);
            expect(entry.line).toBeLessThanOrEqual(lines.length + 1);
        }
    });
});

// ── The row pipeline is untouched ───────────────────────────────────────────

describe('dialect separation', () => {
    it('never lets a logic card feed a data card', () => {
        const { nodes, edges } = counterDeceptionGraph();
        const ctx = makeContext(nodes, edges, counterDeceptionTheory());
        const view: LogicNodeLike = { id: 'view1', kind: 'view' };
        const check = canConnect(nodes.find((n) => n.id === 'root')!, 'out', view, 'in', ctx);
        expect(check.ok).toBe(false);
    });
});

// ── Trust, read from real Lean output ───────────────────────────────────────
//
// The strings below are literal `#print axioms` output from Lean 4.33.1 for
// the generated module (complete) and for the same graph with one obligation
// left unwired. Parsing real output rather than a hand-written approximation
// is the point: Lean wraps long axiom lists across lines, and a reducer that
// only ever saw single-line output would quietly report no axioms at all.

const COMPLETE_OUTPUT = `'proof_root' depends on axioms: [Act,
 Deceptive,
 DefeatsWrongfulPlot,
 Permissible,
 Proportionate,
 ProtectsInnocents,
 Wrong,
 justifiedCounterDeception,
 permissibleNotWrong,
 rescue]`;

const INCOMPLETE_OUTPUT = `'proof_root' depends on axioms: [Act,
 Deceptive,
 DefeatsWrongfulPlot,
 Permissible,
 Proportionate,
 ProtectsInnocents,
 Wrong,
 justifiedCounterDeception,
 permissibleNotWrong,
 rescue,
 sorryAx]`;

function fakeResult(raw: string) {
    return { diagnostics: [], raw, ok: true, elapsed_ms: 1, cancelled: false, timed_out: false };
}

describe('trust report', () => {
    it('reads a multi-line axiom list and separates the author’s axioms', () => {
        const theory = counterDeceptionTheory();
        const { nodes, edges } = counterDeceptionGraph();
        const { module } = build(nodes, edges, theory);
        const trust = extractTrust(fakeResult(COMPLETE_OUTPUT), module);
        expect(trust.usesSorry).toBe(false);
        expect(trust.authorAxioms).toContain('justifiedCounterDeception');
        expect(trust.authorAxioms).toContain('permissibleNotWrong');
        // Lean's own three are not the author's problem and must not be listed.
        expect(trust.authorAxioms).not.toContain('propext');
    });

    it('treats sorryAx as disqualifying', () => {
        const theory = counterDeceptionTheory();
        const { nodes, edges } = counterDeceptionGraph();
        const { module } = build(nodes, edges, theory);
        const trust = extractTrust(fakeResult(INCOMPLETE_OUTPUT), module);
        expect(trust.usesSorry).toBe(true);
    });

    it('never reports a proof containing sorry as checked', () => {
        const theory = counterDeceptionTheory();
        const { nodes, edges } = counterDeceptionGraph();
        const trimmed = edges.filter((e) => e.id !== 'e7');
        const { module, ctx, component } = build(nodes, trimmed, theory);
        const trust = extractTrust(fakeResult(INCOMPLETE_OUTPUT), module);
        const statuses = computeStatuses({
            component,
            ctx,
            module,
            // Lean itself was happy — it compiled. That must not be enough.
            result: fakeResult(INCOMPLETE_OUTPUT),
            trust,
            diagnostics: [],
            stale: false,
            checking: false,
        });
        expect(statuses.get('root')).not.toBe('checked');
        expect(statuses.get('root')).toBe('incomplete');
    });

    it('keeps a premise amber however green the proof around it is', () => {
        const theory = counterDeceptionTheory();
        const { nodes, edges } = counterDeceptionGraph();
        const { module, ctx, component } = build(nodes, edges, theory);
        const trust = extractTrust(fakeResult(COMPLETE_OUTPUT), module);
        const statuses = computeStatuses({
            component,
            ctx,
            module,
            result: fakeResult(COMPLETE_OUTPUT),
            trust,
            diagnostics: [],
            stale: false,
            checking: false,
        });
        expect(statuses.get('root')).toBe('checked');
        // The whole product promise in one assertion.
        expect(statuses.get('p-deceptive')).toBe('assumed');
        expect(explainConclusion(trust, 4, true)).toMatch(/did not establish those premises/);
    });

    it('maps a Lean line back to the card that owns it', () => {
        const theory = counterDeceptionTheory();
        const { nodes, edges } = counterDeceptionGraph();
        const { module } = build(nodes, edges, theory);
        // The `have` line for the intermediate goal belongs to that goal card.
        const haveLine = module.source.split('\n').findIndex((l) => l.includes('have hg')) + 1;
        expect(nodeForLine(module.sourceMap, haveLine)).toBe('g-permissible');
    });
});

// ── Creating the obligations the user's rule choice produced ────────────────

describe('child goal creation', () => {
    const SIZE = { width: 300, height: 176 };
    const placeable = (id: string, x: number, y: number) => ({ id, x, y, width: 300, height: 176 });
    /** The rule card as the board would hand it over: geometry plus its id. */
    const ruleAt = (x: number, y: number) => placeable('r', x, y);

    /** The rule chosen, but none of its four obligations wired up yet. */
    function bareRule() {
        const nodes: LogicNodeLike[] = [
            logicNode('root', { role: 'proof-root', source: 'Permissible rescue' }),
            logicNode('r', { role: 'rule', rule: 'apply', referenceName: 'justifiedCounterDeception' }),
        ];
        const edges: LogicEdgeLike[] = [
            { id: 'e1', from: 'r', to: 'root', fromPort: 'out', toPort: 'by', role: 'derives' },
        ];
        return { nodes, edges, ctx: makeContext(nodes, edges, counterDeceptionTheory()) };
    }

    it('plans exactly the obligations the chosen rule created', () => {
        const { ctx } = bareRule();
        const rule = ruleAt(800, 400);
        const plan = planChildGoals(rule, ctx, [placeable('r', 800, 400)], SIZE);
        expect(plan.goals.map((g) => g.source)).toEqual([
            'Deceptive rescue',
            'DefeatsWrongfulPlot rescue',
            'ProtectsInnocents rescue',
            'Proportionate rescue',
        ]);
        expect(plan.goals.map((g) => g.portId)).toEqual(['a0', 'a1', 'a2', 'a3']);
    });

    it('places them upstream of the rule, stacked and centred', () => {
        const { ctx } = bareRule();
        const rule = ruleAt(800, 400);
        const plan = planChildGoals(rule, ctx, [placeable('r', 800, 400)], SIZE);
        // Left of the rule, because obligations feed into it.
        expect(plan.goals.every((g) => g.x + SIZE.width < 800)).toBe(true);
        expect(new Set(plan.goals.map((g) => g.x)).size).toBe(1);
        const ys = plan.goals.map((g) => g.y);
        expect(ys).toEqual([...ys].sort((a, b) => a - b));
        // Vertically centred on the rule card.
        const mid = (ys[0] + ys[ys.length - 1] + SIZE.height) / 2;
        expect(Math.abs(mid - (400 + SIZE.height / 2))).toBeLessThan(2);
    });

    it('steps the whole column aside rather than landing on existing cards', () => {
        const { ctx } = bareRule();
        const rule = ruleAt(800, 400);
        const clear = planChildGoals(rule, ctx, [placeable('r', 800, 400)], SIZE);
        const blocker = placeable('blocker', clear.goals[0].x, clear.goals[0].y);
        const shifted = planChildGoals(rule, ctx, [placeable('r', 800, 400), blocker], SIZE);
        expect(shifted.goals[0].x).toBeLessThan(clear.goals[0].x);
        expect(new Set(shifted.goals.map((g) => g.x)).size).toBe(1);
    });

    it('only ever fills empty ports, so running it twice is harmless', () => {
        const { nodes, edges } = bareRule();
        // Two of the four already supplied by the user.
        const withSome = [
            ...nodes,
            logicNode('p1', { role: 'premise', source: 'Deceptive rescue' }),
            logicNode('p2', { role: 'premise', source: 'DefeatsWrongfulPlot rescue' }),
        ];
        const wired: LogicEdgeLike[] = [
            ...edges,
            { id: 'x1', from: 'p1', to: 'r', fromPort: 'out', toPort: 'a0', role: 'premise' },
            { id: 'x2', from: 'p2', to: 'r', fromPort: 'out', toPort: 'a1', role: 'premise' },
        ];
        const ctx = makeContext(withSome, wired, counterDeceptionTheory());
        const rule = ruleAt(800, 400);
        const plan = planChildGoals(rule, ctx, [placeable('r', 800, 400)], SIZE);
        expect(plan.goals.map((g) => g.portId)).toEqual(['a2', 'a3']);
    });

    it('plans nothing when no rule has been chosen', () => {
        const nodes: LogicNodeLike[] = [
            logicNode('root', { role: 'proof-root', source: 'Permissible rescue' }),
            logicNode('r', { role: 'rule' }),
        ];
        const edges: LogicEdgeLike[] = [
            { id: 'e1', from: 'r', to: 'root', fromPort: 'out', toPort: 'by', role: 'derives' },
        ];
        const ctx = makeContext(nodes, edges, counterDeceptionTheory());
        const rule = ruleAt(800, 400);
        expect(planChildGoals(rule, ctx, [], SIZE).goals).toEqual([]);
    });

    it('creates goals that prove nothing until the user acts', () => {
        // The created cards must be open goals — the app exposing obligations,
        // never satisfying them.
        const { ctx, nodes, edges } = bareRule();
        const rule = ruleAt(800, 400);
        const plan = planChildGoals(rule, ctx, [], SIZE);
        const created = plan.goals.map((g, i) => logicNode(`c${i}`, { role: 'goal', source: g.source }));
        const wired = [
            ...edges,
            ...plan.goals.map((g, i) => childGoalEdge(`c${i}`, 'r', g.portId)),
        ];
        const ctx2 = makeContext([...nodes, ...created], wired, counterDeceptionTheory());
        const module = generateModule(findComponent('root', ctx2), ctx2, counterDeceptionTheory());
        // Every new card is still open, so the module is honestly incomplete.
        expect(module.openGoals).toHaveLength(4);
        expect(module.source).toContain('sorry');
    });
});
