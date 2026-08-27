import { describe, expect, test } from 'vitest';
import {
    emptyScene,
    createShapeFromBox,
    createPathShape,
    shapeBounds,
    fitTextShapeToContent,
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
    connectorPolyline,
    elbowMidSegment,
    DEFAULT_STYLE,
    type Scene,
    type Shape,
    type ArrowShape,
    type LineShape
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

    test('text bounds grow to match rendered content', () => {
        const text = createShapeFromBox('text', DEFAULT_STYLE, {
            x: 10,
            y: 20,
            w: 40,
            h: 28
        }) as Extract<Shape, { type: 'text' }>;
        text.text = 'A substantially longer line';

        const bounds = shapeBounds(text);
        expect(bounds.x).toBe(10);
        expect(bounds.w).toBeGreaterThan(40);
        expect(bounds.h).toBe(DEFAULT_STYLE.fontSize * 1.25);
    });

    test('fitting multiline centred text preserves its anchor', () => {
        const text = createShapeFromBox('text', { ...DEFAULT_STYLE, align: 'center' }, {
            x: 10,
            y: 20,
            w: 100,
            h: 28
        }) as Extract<Shape, { type: 'text' }>;
        const fitted = fitTextShapeToContent(text, 'first line\nsecond line');

        expect(fitted.x + fitted.w / 2).toBeCloseTo(60);
        expect(fitted.h).toBe(DEFAULT_STYLE.fontSize * 2.5);
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

describe('connectors', () => {
    // A wide-and-short box → horizontal-dominant routing.
    const wide = { x: 0, y: 0, w: 100, h: 40 };

    test('elbow / curved tools build lines with a connector', () => {
        const elbow = createShapeFromBox('elbow', DEFAULT_STYLE, wide)! as LineShape;
        expect(elbow.type).toBe('line');
        expect(elbow.connector).toBe('elbow');
        expect([elbow.x1, elbow.y1, elbow.x2, elbow.y2]).toEqual([0, 0, 100, 40]);

        const curved = createShapeFromBox('curved', DEFAULT_STYLE, wide)! as LineShape;
        expect(curved.type).toBe('line');
        expect(curved.connector).toBe('curved');
    });

    test('connectorPolyline: straight is just the endpoints', () => {
        const line = createShapeFromBox('line', DEFAULT_STYLE, wide)! as LineShape;
        expect(connectorPolyline(line)).toEqual([0, 0, 100, 40]);
    });

    test('connectorPolyline: elbow bends through the mid on the dominant axis', () => {
        const elbow = createShapeFromBox('elbow', DEFAULT_STYLE, wide)! as LineShape;
        // Horizontal-dominant → bends at midX (50) on each endpoint's row.
        expect(connectorPolyline(elbow)).toEqual([0, 0, 50, 0, 50, 40, 100, 40]);
    });

    test('connectorPolyline: curved samples the cubic between the endpoints', () => {
        const curved = createShapeFromBox('curved', DEFAULT_STYLE, wide)! as LineShape;
        const pts = connectorPolyline(curved);
        // Starts and ends exactly on the endpoints, with sampled points between.
        expect(pts.slice(0, 2)).toEqual([0, 0]);
        expect(pts.slice(-2)).toEqual([100, 40]);
        expect(pts.length).toBeGreaterThan(8);
    });

    test('elbow twists so a bound end meets its anchor perpendicular to the edge', () => {
        // Circle left anchor → square top anchor (the reported scenario).
        const line = createShapeFromBox('elbow', DEFAULT_STYLE, box)! as LineShape;
        line.x1 = 100;
        line.y1 = 100;
        line.x2 = 200;
        line.y2 = 200;
        line.startRef = { shapeId: 'a', anchor: 'left' };
        line.endRef = { shapeId: 'b', anchor: 'top' };

        const pts = connectorPolyline(line);
        const n = pts.length;
        // Final segment is vertical → perpendicular to the square's top edge,
        // not flat/parallel to it.
        expect(pts[n - 4]).toBe(pts[n - 2]); // same x
        expect(pts[n - 3]).not.toBe(pts[n - 1]); // y changes
        // First segment leaves the 'left' anchor going left — an added stub, so
        // the shaft exits perpendicular rather than heading straight across.
        expect(pts[1]).toBe(pts[3]); // horizontal (same y)
        expect(pts[2]).toBeLessThan(pts[0]); // x decreased → exits leftward
        // The twist means more than the 2 bends of an unbound elbow.
        expect(n).toBeGreaterThan(6);
    });

    test('line segments default to no tail arrowheads', () => {
        const line = createShapeFromBox('line', DEFAULT_STYLE, box)! as LineShape;
        expect(line.startArrow).toBe(false);
        expect(line.endArrow).toBe(false);
        const scene = emptyScene();
        scene.shapes.push(line);
        expect(sceneToSvg(scene)).not.toContain('<polygon');
    });

    test('tail arrowheads render as polygons on the chosen end(s)', () => {
        const endOnly = { ...DEFAULT_STYLE, endArrow: true };
        const line = createShapeFromBox('line', endOnly, box)! as LineShape;
        expect(line.endArrow).toBe(true);
        const scene = emptyScene();
        scene.shapes.push(line);
        const svg = sceneToSvg(scene);
        expect(svg).toContain('<line'); // shaft
        expect((svg.match(/<polygon/g) ?? []).length).toBe(1); // one head

        // Both ends → two heads.
        const both = createShapeFromBox('line', { ...DEFAULT_STYLE, startArrow: true, endArrow: true }, box)!;
        const scene2 = emptyScene();
        scene2.shapes.push(both);
        expect((sceneToSvg(scene2).match(/<polygon/g) ?? []).length).toBe(2);
    });

    test('elbow/curved connectors also carry tail arrowheads', () => {
        for (const tool of ['elbow', 'curved'] as const) {
            const shape = createShapeFromBox(tool, { ...DEFAULT_STYLE, endArrow: true }, box)!;
            const scene = emptyScene();
            scene.shapes.push(shape);
            const svg = sceneToSvg(scene);
            expect(svg).toContain('<path'); // routed shaft
            expect(svg).toContain('<polygon'); // arrowhead
        }
    });

    test('elbow exposes an adjustable middle segment centred by default', () => {
        const elbow = createShapeFromBox('elbow', DEFAULT_STYLE, wide)! as LineShape;
        const seg = elbowMidSegment(elbow);
        expect(seg).not.toBeNull();
        expect(seg!.axis).toBe('x'); // horizontal-dominant → vertical mid bar slides in x
        expect(seg!.auto).toBe(50); // auto-centred at midX
        // Straight/curved have no adjustable mid bar.
        expect(elbowMidSegment(createShapeFromBox('line', DEFAULT_STYLE, wide)! as LineShape)).toBeNull();
        expect(elbowMidSegment(createShapeFromBox('curved', DEFAULT_STYLE, wide)! as LineShape)).toBeNull();
    });

    test('elbowMid offsets the middle segment from its auto centre', () => {
        const elbow = createShapeFromBox('elbow', DEFAULT_STYLE, wide)! as LineShape;
        elbow.elbowMid = 20;
        elbow.elbowMidAxis = 'x';
        // Mid bar shifts from x=50 to x=70; endpoints unchanged.
        expect(connectorPolyline(elbow)).toEqual([0, 0, 70, 0, 70, 40, 100, 40]);
        // A stored offset for the *other* axis is ignored (routing axis is 'x').
        elbow.elbowMidAxis = 'y';
        expect(connectorPolyline(elbow)).toEqual([0, 0, 50, 0, 50, 40, 100, 40]);
    });

    test('elbow rounds the OUTSIDE of a shape when anchors are on different axes', () => {
        // circle left anchor → square top anchor: the connector must leave left,
        // turn beside the source, run above the target, then drop into the top —
        // never cutting up through the target's body to reach the anchor.
        const line = createShapeFromBox('elbow', DEFAULT_STYLE, box)! as LineShape;
        line.x1 = 100;
        line.y1 = 100;
        line.x2 = 200;
        line.y2 = 200;
        line.startRef = { shapeId: 'a', anchor: 'left' };
        line.endRef = { shapeId: 'b', anchor: 'top' };
        // stub = 24 → sA=(76,100), sB=(200,176); the mid turn sits at x=76 (beside
        // the source) and the cross-run at y=176 (above the target).
        expect(connectorPolyline(line)).toEqual([100, 100, 76, 100, 76, 176, 200, 176, 200, 200]);
    });

    test('same-axis anchors still route straight across (Z), not around', () => {
        // left anchor → right anchor: a vertical mid bar between them, no detour.
        const line = createShapeFromBox('elbow', DEFAULT_STYLE, box)! as LineShape;
        line.x1 = 0;
        line.y1 = 0;
        line.x2 = 200;
        line.y2 = 80;
        line.startRef = { shapeId: 'a', anchor: 'left' };
        line.endRef = { shapeId: 'b', anchor: 'right' };
        const pts = connectorPolyline(line);
        // First and last segments are horizontal (leave/enter along the shared
        // normal axis), with a single vertical mid bar.
        expect(pts[1]).toBe(pts[3]); // first segment horizontal
        expect(pts[pts.length - 3]).toBe(pts[pts.length - 1]); // last segment horizontal
    });

    test('sceneToSvg renders straight as <line>, elbow/curved as <path>', () => {
        const straight = emptyScene();
        straight.shapes.push(createShapeFromBox('line', DEFAULT_STYLE, wide)!);
        expect(sceneToSvg(straight)).toContain('<line');

        const elbow = emptyScene();
        elbow.shapes.push(createShapeFromBox('elbow', DEFAULT_STYLE, wide)!);
        const elbowSvg = sceneToSvg(elbow);
        expect(elbowSvg).toContain('<path');
        expect(elbowSvg).toContain(' L '); // orthogonal bends

        const curved = emptyScene();
        curved.shapes.push(createShapeFromBox('curved', DEFAULT_STYLE, wide)!);
        const curvedSvg = sceneToSvg(curved);
        expect(curvedSvg).toContain('<path');
        expect(curvedSvg).toContain(' C '); // cubic Bézier
    });
});
