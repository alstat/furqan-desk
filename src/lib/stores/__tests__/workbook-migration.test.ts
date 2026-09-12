// The legacy guarantee: a workbook saved by a version-1 build must open with
// nothing lost and behave exactly as it did.
//
// The SVG *is* the save format, so these fixtures are what a real saved file
// looks like — metadata inside the document, XML-escaped. If this suite ever
// fails, someone's saved work is at risk, which is why it asserts on the whole
// round trip rather than on the migration function alone.

import { describe, expect, it } from 'vitest';
import {
    workbookFromSvg,
    workbookToSvg,
    emptyWorkbook,
    makeNode,
    resolveNodeOutputs,
    transformNode,
    DATA_NODE_KINDS,
    WORKBOOK_SCHEMA_VERSION,
} from '../workbook.store';
import { logicToolbarVisibleFor } from '../logic/flag';

/** Builds an SVG in exactly the shape a version-1 build wrote. */
function v1Svg(doc: unknown): string {
    const json = JSON.stringify(doc)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
<title>Legacy</title>
<metadata id="ayahlab-workbook">${json}</metadata>
</svg>`;
}

const V1_DOC = {
    version: 1,
    title: 'Legacy board',
    viewport: { x: -120, y: 44, zoom: 1.25 },
    nodes: [
        { id: 'a', kind: 'ayah', x: 0, y: 0, width: 260, height: 150, refs: ['2:255'] },
        { id: 't', kind: 'translation', x: 320, y: 0, width: 260, height: 150, translatorId: 20 },
        { id: 'f', kind: 'filter', x: 640, y: 0, width: 260, height: 150, query: 'mercy' },
        { id: 'v', kind: 'view', x: 960, y: 0, width: 260, height: 150, layout: 'list' },
        { id: 'n', kind: 'note', x: 0, y: 220, width: 260, height: 150, text: 'A note' },
    ],
    edges: [
        { id: 'e1', from: 'a', to: 't' },
        { id: 'e2', from: 't', to: 'f' },
        { id: 'e3', from: 'f', to: 'v' },
    ],
    groups: [{ id: 'g1', name: 'Mercy chain', nodeIds: ['a', 't', 'f', 'v'] }],
};

describe('version-1 compatibility', () => {
    it('loads a version-1 SVG without losing anything', () => {
        const doc = workbookFromSvg(v1Svg(V1_DOC));
        expect(doc).not.toBeNull();
        if (!doc) return;
        expect(doc.title).toBe('Legacy board');
        expect(doc.nodes).toHaveLength(5);
        expect(doc.edges).toHaveLength(3);
        expect(doc.groups).toHaveLength(1);
        expect(doc.viewport).toEqual({ x: -120, y: 44, zoom: 1.25 });
        // Node-level fields survive untouched.
        expect(doc.nodes.find((n) => n.id === 'a')?.refs).toEqual(['2:255']);
        expect(doc.nodes.find((n) => n.id === 't')?.translatorId).toBe(20);
        expect(doc.nodes.find((n) => n.id === 'f')?.query).toBe('mercy');
        expect(doc.nodes.find((n) => n.id === 'n')?.text).toBe('A note');
        expect(doc.groups[0].nodeIds).toEqual(['a', 't', 'f', 'v']);
    });

    it('reads a version-1 edge as the implicit out → in data connection', () => {
        const doc = workbookFromSvg(v1Svg(V1_DOC))!;
        for (const edge of doc.edges) {
            expect(edge.fromPort).toBe('out');
            expect(edge.toPort).toBe('in');
            expect(edge.role).toBe('data');
        }
        // Endpoints are unchanged — the pipeline still resolves as before.
        expect(doc.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['a>t', 't>f', 'f>v']);
    });

    it('upgrades the version and adds no logic state to a legacy board', () => {
        const doc = workbookFromSvg(v1Svg(V1_DOC))!;
        expect(doc.version).toBe(WORKBOOK_SCHEMA_VERSION);
        expect(doc.logic).toBeUndefined();
    });

    it('round-trips through save and reopen', () => {
        const first = workbookFromSvg(v1Svg(V1_DOC))!;
        const reopened = workbookFromSvg(workbookToSvg(first))!;
        expect(reopened.nodes).toEqual(first.nodes);
        expect(reopened.edges).toEqual(first.edges);
        expect(reopened.groups).toEqual(first.groups);
        expect(reopened.viewport).toEqual(first.viewport);
        expect(reopened.title).toBe(first.title);
    });

    it('still migrates the pre-generalisation `pipeline` node', () => {
        const legacy = {
            ...V1_DOC,
            nodes: [
                {
                    id: 'p',
                    kind: 'pipeline',
                    x: 10,
                    y: 10,
                    width: 400,
                    height: 300,
                    title: 'Old pipeline',
                    steps: [
                        { id: 's1', kind: 'ayah', x: 0, y: 0, refs: ['1:1'] },
                        { id: 's2', kind: 'view', x: 200, y: 0, layout: 'list' },
                    ],
                },
            ],
            edges: [],
            groups: [],
        };
        const doc = workbookFromSvg(v1Svg(legacy))!;
        expect(doc.nodes.map((n) => n.kind).sort()).toEqual(['ayah', 'view']);
        expect(doc.edges).toHaveLength(1);
        expect(doc.groups[0].name).toBe('Old pipeline');
        // Migrated edges are ported too, so both migrations compose.
        expect(doc.edges[0].role).toBe('data');
    });

    it('writes new documents at the current version', () => {
        const doc = emptyWorkbook('Fresh');
        expect(doc.version).toBe(WORKBOOK_SCHEMA_VERSION);
    });

    it('gives a logic card a payload and keeps it out of the row pipeline', () => {
        const node = makeNode('logic', 0, 0, 'premise');
        expect(node.logic?.role).toBe('premise');
        const doc = { ...emptyWorkbook('L'), nodes: [node] };
        const reopened = workbookFromSvg(workbookToSvg(doc))!;
        expect(reopened.nodes[0].logic?.role).toBe('premise');
    });
});

// ── The two dialects stay separate ──────────────────────────────────────────
//
// A proof must never be handed to the row pipeline: `transformNode` assumes
// one unnamed upstream value producing rows, which a proof is not. This is
// guarded twice — by the kind list and by the switch's default — and both are
// asserted here, because a regression in either would be silent.

describe('dialect separation', () => {
    it('keeps `logic` out of the row pipeline kinds', () => {
        expect(DATA_NODE_KINDS).not.toContain('logic');
    });

    it('resolves no rows for a board of proof cards', async () => {
        const doc = {
            ...emptyWorkbook('Proof only'),
            nodes: [makeNode('logic', 0, 0, 'proof-root'), makeNode('logic', 300, 0, 'premise')],
        };
        const outputs = await resolveNodeOutputs(doc);
        expect(outputs.size).toBe(0);
    });

    it('returns nothing if a logic card ever reaches transformNode', async () => {
        const node = makeNode('logic', 0, 0, 'goal');
        expect(await transformNode(node, [])).toEqual([]);
    });
});

// ── The feature flag ────────────────────────────────────────────────────────

describe('logic pipeline flag', () => {
    it('hides the Logic toolbar on an ordinary board when off', () => {
        const nodes = [makeNode('ayah', 0, 0), makeNode('view', 300, 0)];
        expect(logicToolbarVisibleFor(false, nodes)).toBe(false);
        expect(logicToolbarVisibleFor(true, nodes)).toBe(true);
    });

    it('keeps the toolbar for a board that already holds proof cards', () => {
        // The property worth protecting: turning the flag off must never
        // strand an existing proof on screen with no way to extend it.
        const nodes = [makeNode('ayah', 0, 0), makeNode('logic', 300, 0, 'proof-root')];
        expect(logicToolbarVisibleFor(false, nodes)).toBe(true);
    });

    it('leaves an empty board following the flag', () => {
        expect(logicToolbarVisibleFor(false, [])).toBe(false);
        expect(logicToolbarVisibleFor(true, [])).toBe(true);
    });
});
