// Drives the full authoring loop the way a user would, then writes the Lean
// out so it can be compiled by the real toolchain.
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateModule } from '../codegen';
import { findComponent, makeContext, type LogicEdgeLike, type LogicNodeLike } from '../graph';
import { childGoalEdge, planChildGoals } from '../authoring';
import { emptyTheory, theoryContentHash, type LogicTheory } from '../theory';

const SIZE = { width: 300, height: 176 };

function theory(): LogicTheory {
    const t = emptyTheory('Counter-Deception');
    t.vocabulary = [
        { id: 'v1', kind: 'type', name: 'Act' },
        { id: 'v2', kind: 'entity', name: 'rescue', signature: 'Act' },
        { id: 'v3', kind: 'predicate', name: 'Deceptive', signature: 'Act → Prop' },
        { id: 'v4', kind: 'predicate', name: 'DefeatsWrongfulPlot', signature: 'Act → Prop' },
        { id: 'v5', kind: 'predicate', name: 'ProtectsInnocents', signature: 'Act → Prop' },
        { id: 'v6', kind: 'predicate', name: 'Proportionate', signature: 'Act → Prop' },
        { id: 'v7', kind: 'predicate', name: 'Permissible', signature: 'Act → Prop' },
        { id: 'v8', kind: 'predicate', name: 'Wrong', signature: 'Act → Prop' },
    ];
    t.trustedDeclarations = [
        { id: 'd1', kind: 'axiom', name: 'justifiedCounterDeception', binders: [{ name: 'a', type: 'Act' }],
          source: 'Deceptive a → DefeatsWrongfulPlot a → ProtectsInnocents a → Proportionate a → Permissible a' },
        { id: 'd2', kind: 'axiom', name: 'permissibleNotWrong', binders: [{ name: 'a', type: 'Act' }],
          source: 'Permissible a → ¬ Wrong a' },
    ];
    t.contentHash = theoryContentHash(t);
    return t;
}

const n = (id: string, logic: LogicNodeLike['logic']): LogicNodeLike => ({ id, kind: 'logic', logic });
const box = (id: string, x: number, y: number) => ({ id, x, y, ...SIZE });

describe('authoring round trip', () => {
    it('builds the whole proof by choosing rules, then compiles', () => {
        const t = theory();

        // 1. The author states the conclusion and points a rule at it.
        let nodes: LogicNodeLike[] = [
            n('root', { role: 'proof-root', source: '¬ Wrong rescue' }),
            n('r1', { role: 'rule', rule: 'apply', referenceName: 'permissibleNotWrong' }),
        ];
        let edges: LogicEdgeLike[] = [
            { id: 'e1', from: 'r1', to: 'root', fromPort: 'out', toPort: 'by', role: 'derives' },
        ];
        let boxes = [box('root', 1200, 400), box('r1', 800, 400)];

        // 2. "Create the open goals" — the app writes the obligation the rule
        //    produced. Exactly one, and it is open.
        let plan = planChildGoals(box('r1', 800, 400), makeContext(nodes, edges, t), boxes, SIZE);
        expect(plan.goals.map((g) => g.source)).toEqual(['Permissible rescue']);
        nodes = [...nodes, n('g1', { role: 'goal', source: plan.goals[0].source })];
        edges = [...edges, childGoalEdge('g1', 'r1', plan.goals[0].portId)];
        boxes = [...boxes, box('g1', plan.goals[0].x, plan.goals[0].y)];

        // 3. The author points the second rule at that new goal.
        nodes = [...nodes, n('r2', { role: 'rule', rule: 'apply', referenceName: 'justifiedCounterDeception' })];
        edges = [...edges, { id: 'e2', from: 'r2', to: 'g1', fromPort: 'out', toPort: 'by', role: 'derives' }];
        boxes = [...boxes, box('r2', plan.goals[0].x - 400, plan.goals[0].y)];

        // 4. Create again — four obligations this time, straight from the axiom.
        plan = planChildGoals(box('r2', plan.goals[0].x - 400, plan.goals[0].y), makeContext(nodes, edges, t), boxes, SIZE);
        expect(plan.goals.map((g) => g.source)).toEqual([
            'Deceptive rescue',
            'DefeatsWrongfulPlot rescue',
            'ProtectsInnocents rescue',
            'Proportionate rescue',
        ]);

        // 5. The author declares each as a local premise — their decision, and
        //    the app never makes it for them.
        for (const [i, goal] of plan.goals.entries()) {
            nodes = [...nodes, n(`p${i}`, { role: 'premise', source: goal.source })];
            edges = [...edges, childGoalEdge(`p${i}`, 'r2', goal.portId)];
        }

        const ctx = makeContext(nodes, edges, t);
        const module = generateModule(findComponent('root', ctx), ctx, t);
        expect(module.openGoals).toEqual([]);
        expect(module.source).not.toContain('sorry');
        if (process.env.OUT_DIR) writeFileSync(`${process.env.OUT_DIR}/roundtrip.lean`, module.source);
    });
});
