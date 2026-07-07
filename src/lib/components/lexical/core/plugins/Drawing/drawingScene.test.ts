import { describe, expect, test } from 'vitest';
import {
    emptyScene,
    createShapeFromBox,
    createPathShape,
    shapeBounds,
    translateShape,
    resizeShape,
    scaleShapeInFrame,
    sceneToSvg,
    sceneToDataUrl,
    parseScene,
    anchorPoint,
    shapeAnchors,
    syncConnections,
    isConnectable,
    canGroupSelection,
    selectionHasGroup,
    expandSelection,
    groupSelection,
    ungroupSelection,
    DEFAULT_STYLE,
    type Scene,
    type Shape,
    type ArrowShape
} from './drawingScene';

const box = { x: 10, y: 20, w: 100, h: 50 };

function rectScene(ids: string[]): Scene {
    const shapes = ids.map((id) => ({
        ...createShapeFromBox('rect', DEFAULT_STYLE, box)!,
        id
    })) as Shape[];
    return { ...emptyScene(), shapes };
}
const groupIds = (s: Scene, id: string) => s.shapes.find((x) => x.id === id)!.groups;

describe('createShapeFromBox', () => {
    test('rect carries the box and default style', () => {
        const s = createShapeFromBox('rect', DEFAULT_STYLE, box);
        expect(s).not.toBeNull();
        expect(s!.type).toBe('rect');
        expect(shapeBounds(s!)).toEqual(box);
    });

    test('line maps the box to endpoints', () => {
        const s = createShapeFromBox('line', DEFAULT_STYLE, box) as any;
        expect(s.type).toBe('line');
        expect([s.x1, s.y1, s.x2, s.y2]).toEqual([10, 20, 110, 70]);
    });

    test('polygon tools resolve to polygon kinds', () => {
        const s = createShapeFromBox('hexagon', DEFAULT_STYLE, box) as any;
        expect(s.type).toBe('polygon');
        expect(s.kind).toBe('hexagon');
    });
});

describe('geometry', () => {
    test('translateShape moves bounds', () => {
        const s = createShapeFromBox('ellipse', DEFAULT_STYLE, box)!;
        const moved = translateShape(s, 5, -7);
        expect(shapeBounds(moved)).toEqual({ x: 15, y: 13, w: 100, h: 50 });
    });

    test('resizeShape scales a path proportionally', () => {
        const path = createPathShape(DEFAULT_STYLE, [0, 0, 10, 10]);
        const prev = shapeBounds(path); // 0,0,10,10
        const next = { x: 0, y: 0, w: 20, h: 20 };
        const resized = resizeShape(path, prev, next) as any;
        expect(resized.points).toEqual([0, 0, 20, 20]);
    });

    test('scaleShapeInFrame scales a shape within a group frame', () => {
        // A shape occupying the right half of a 100×100 frame; double the frame
        // width → the shape stays in the (new) right half.
        const s = createShapeFromBox('rect', DEFAULT_STYLE, { x: 50, y: 0, w: 50, h: 100 })!;
        const prev = { x: 0, y: 0, w: 100, h: 100 };
        const next = { x: 0, y: 0, w: 200, h: 100 };
        const out = scaleShapeInFrame(s, prev, next);
        expect(shapeBounds(out)).toEqual({ x: 100, y: 0, w: 100, h: 100 });
    });

    test('shapeBounds normalises negative extents', () => {
        const s = createShapeFromBox('rect', DEFAULT_STYLE, { x: 100, y: 100, w: -40, h: -20 })!;
        expect(shapeBounds(s)).toEqual({ x: 60, y: 80, w: 40, h: 20 });
    });
});

describe('connections', () => {
    test('anchorPoint returns the four edge midpoints', () => {
        const rect = createShapeFromBox('rect', DEFAULT_STYLE, { x: 0, y: 0, w: 100, h: 60 })!;
        expect(anchorPoint(rect, 'top')).toEqual({ x: 50, y: 0 });
        expect(anchorPoint(rect, 'right')).toEqual({ x: 100, y: 30 });
        expect(anchorPoint(rect, 'bottom')).toEqual({ x: 50, y: 60 });
        expect(anchorPoint(rect, 'left')).toEqual({ x: 0, y: 30 });
    });

    test('a triangle exposes three edge anchors on its sides', () => {
        const tri = createShapeFromBox('triangle', DEFAULT_STYLE, { x: 0, y: 0, w: 100, h: 90 })!;
        const anchors = shapeAnchors(tri);
        expect(anchors.map((a) => a.id)).toEqual(['e0', 'e1', 'e2']);
        // vertices: apex (50,0), bottom-right (100,90), bottom-left (0,90)
        // bottom edge midpoint (e1 → br..bl) is centred at the base
        expect(anchorPoint(tri, 'e1')).toEqual({ x: 50, y: 90 });
        // left edge (e2 → bl..apex) midpoint
        expect(anchorPoint(tri, 'e2')).toEqual({ x: 25, y: 45 });
    });

    test('polygon edge counts match their sides', () => {
        expect(shapeAnchors(createShapeFromBox('hexagon', DEFAULT_STYLE, box)!)).toHaveLength(6);
        expect(shapeAnchors(createShapeFromBox('diamond', DEFAULT_STYLE, box)!)).toHaveLength(4);
    });

    test('only box shapes are connectable', () => {
        expect(isConnectable(createShapeFromBox('rect', DEFAULT_STYLE, box)!)).toBe(true);
        expect(isConnectable(createShapeFromBox('arrow', DEFAULT_STYLE, box)!)).toBe(false);
        expect(shapeAnchors(createShapeFromBox('ellipse', DEFAULT_STYLE, box)!)).toHaveLength(4);
    });

    test('syncConnections moves a bound arrow endpoint when its shape moves', () => {
        const rect = createShapeFromBox('rect', DEFAULT_STYLE, { x: 0, y: 0, w: 100, h: 60 })!;
        const arrow = createShapeFromBox('arrow', DEFAULT_STYLE, { x: 200, y: 200, w: 0, h: 0 }) as ArrowShape;
        arrow.endRef = { shapeId: rect.id, anchor: 'left' };
        let scene: Scene = { ...emptyScene(400, 400), shapes: [rect, arrow] };

        scene = syncConnections(scene);
        let a = scene.shapes[1] as ArrowShape;
        expect([a.x2, a.y2]).toEqual([0, 30]); // left anchor of rect

        // Move the rect; the arrow endpoint follows on next sync.
        scene = {
            ...scene,
            shapes: scene.shapes.map((s) => (s.id === rect.id ? translateShape(s, 40, 10) : s))
        };
        scene = syncConnections(scene);
        a = scene.shapes[1] as ArrowShape;
        expect([a.x2, a.y2]).toEqual([40, 40]); // left anchor now at (0+40, 30+10)
    });

    test('dangling refs are left untouched', () => {
        const arrow = createShapeFromBox('arrow', DEFAULT_STYLE, { x: 10, y: 10, w: 50, h: 0 }) as ArrowShape;
        arrow.endRef = { shapeId: 'missing', anchor: 'top' };
        const scene: Scene = { ...emptyScene(), shapes: [arrow] };
        const out = syncConnections(scene).shapes[0] as ArrowShape;
        expect([out.x2, out.y2]).toEqual([60, 10]);
    });
});

describe('hierarchical grouping', () => {
    test('grouping requires 2+ independent top-level units', () => {
        const s = rectScene(['a', 'b', 'c']);
        expect(canGroupSelection(s.shapes, ['a'])).toBe(false); // single shape
        expect(canGroupSelection(s.shapes, ['a', 'b'])).toBe(true);

        // Once a,b are one group, re-selecting just them cannot be re-grouped.
        const g1 = groupSelection(s, ['a', 'b']);
        expect(canGroupSelection(g1.shapes, ['a', 'b'])).toBe(false);
        expect(selectionHasGroup(g1.shapes, ['a', 'b'])).toBe(true);
        // …but the group + a loose shape can (Group active, Ungroup active).
        expect(canGroupSelection(g1.shapes, ['a', 'b', 'c'])).toBe(true);
        expect(selectionHasGroup(g1.shapes, ['a', 'b', 'c'])).toBe(true);
    });

    test('clicking one member expands to the whole outer group', () => {
        const g1 = groupSelection(rectScene(['a', 'b', 'c']), ['a', 'b']);
        expect(expandSelection(g1.shapes, ['a']).sort()).toEqual(['a', 'b']);
        expect(expandSelection(g1.shapes, ['c'])).toEqual(['c']); // loose
    });

    test('ungroup peels only the outermost level', () => {
        // group(group(a,b), c)
        const g1 = groupSelection(rectScene(['a', 'b', 'c']), ['a', 'b']);
        const g2 = groupSelection(g1, ['a', 'b', 'c']);
        expect(groupIds(g2, 'a')!.length).toBe(2); // [outer, inner]
        expect(groupIds(g2, 'c')!.length).toBe(1);
        // outer ids match across the group
        expect(groupIds(g2, 'a')![0]).toBe(groupIds(g2, 'c')![0]);

        const un = ungroupSelection(g2, ['a', 'b', 'c']);
        // a,b remain grouped together (inner group preserved); c is now loose.
        expect(groupIds(un, 'a')).toEqual(groupIds(un, 'b'));
        expect(groupIds(un, 'a')!.length).toBe(1);
        expect(groupIds(un, 'c')).toBeUndefined();
        // The preserved inner group can still be re-grouped with c.
        expect(canGroupSelection(un.shapes, ['a', 'b', 'c'])).toBe(true);
    });
});

describe('sceneToSvg', () => {
    test('emits a standalone svg with a shape', () => {
        const scene: Scene = emptyScene(200, 120);
        scene.shapes.push(createShapeFromBox('rect', DEFAULT_STYLE, box)!);
        const svg = sceneToSvg(scene);
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain('<rect');
        expect(svg).toContain('width="200"');
    });

    test('escapes text content', () => {
        const scene = emptyScene();
        const text = createShapeFromBox('text', DEFAULT_STYLE, box)! as any;
        text.text = 'a & b <c>';
        scene.shapes.push(text);
        const svg = sceneToSvg(scene);
        expect(svg).toContain('a &amp; b &lt;c&gt;');
        expect(svg).not.toContain('<c>');
    });

    test('sceneToDataUrl round-trips through parseScene', () => {
        const scene = emptyScene(300, 300);
        scene.shapes.push(createShapeFromBox('arrow', DEFAULT_STYLE, box)!);
        const url = sceneToDataUrl(scene);
        expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
        const parsed = parseScene(JSON.stringify(scene));
        expect(parsed.shapes.length).toBe(1);
        expect(parsed.width).toBe(300);
    });
});
