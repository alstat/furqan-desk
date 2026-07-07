// ─────────────────────────────────────────────────────────────────────────
// Drawing scene model + SVG renderer.
//
// A `Scene` is the editable source of truth for a drawing. It is stored (as
// JSON) on the DrawingNode, rendered to SVG for the in-document view and for
// "insert as SVG", and rasterized to PNG for docx export. Every consumer goes
// through `sceneToSvg` so the rendering is identical everywhere.
//
// This module is pure (no Svelte / DOM-write dependencies) so it can be unit
// tested and reused by the docx exporter.
// ─────────────────────────────────────────────────────────────────────────

export type DashStyle = 'solid' | 'dash' | 'dot';
export type PolygonKind = 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star';
export type TextAlign = 'left' | 'center' | 'right';
// How a line/arrow is routed between its two endpoints. 'straight' is a direct
// segment; 'elbow' bends orthogonally through a mid point; 'curved' is a smooth
// cubic through the same mid controls.
export type Connector = 'straight' | 'elbow' | 'curved';

// A line/arrow endpoint may be bound to an anchor on another shape so it
// follows that shape when it is moved or resized. Box shapes expose the four
// edge midpoints (top/right/bottom/left); polygons expose one anchor per edge
// (`e0`, `e1`, …) so a triangle offers its three sides, a hexagon its six, etc.
export type AnchorId = 'top' | 'right' | 'bottom' | 'left' | 'center' | `e${number}`;
export interface Connection {
    shapeId: string;
    anchor: AnchorId;
}

export interface CommonProps {
    id: string;
    fill: string; // may be 'none'
    stroke: string; // may be 'none'
    strokeWidth: number;
    strokeDash: DashStyle;
    opacity: number; // 0..1
    rotation: number; // degrees, about the shape's bounding-box centre
    // Group membership as a nesting stack, outermost first. e.g. [g2, g1] means
    // the shape is in inner group g1, which is nested inside outer group g2.
    // Shapes sharing the same outermost id select/move/resize together; one
    // "ungroup" peels the outermost level, preserving inner groups.
    groups?: string[];
}

export interface RectShape extends CommonProps {
    type: 'rect';
    x: number;
    y: number;
    w: number;
    h: number;
    rx: number; // corner radius (0 = sharp)
}

export interface EllipseShape extends CommonProps {
    type: 'ellipse';
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface PolygonShape extends CommonProps {
    type: 'polygon';
    x: number;
    y: number;
    w: number;
    h: number;
    kind: PolygonKind;
}

export interface CalloutShape extends CommonProps {
    type: 'callout';
    x: number;
    y: number;
    w: number;
    h: number;
    rx: number;
    // Tail tip, in absolute scene coordinates.
    tailX: number;
    tailY: number;
}

export interface LineShape extends CommonProps {
    type: 'line';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    startRef?: Connection | null; // bound anchor for (x1,y1)
    endRef?: Connection | null; // bound anchor for (x2,y2)
    connector?: Connector; // routing between endpoints (default 'straight')
    startArrow?: boolean; // arrowhead on the (x1,y1) end (default false)
    endArrow?: boolean; // arrowhead on the (x2,y2) end (default false)
    // Manual offset of an elbow's middle segment from its auto-centred position,
    // signed along `elbowMidAxis` ('x' → the vertical mid bar slides in x, 'y' →
    // the horizontal mid bar slides in y). Stored as a delta so it follows the
    // endpoints when the connector is moved. Ignored once the routing axis flips.
    elbowMid?: number;
    elbowMidAxis?: 'x' | 'y';
}

export interface ArrowShape extends CommonProps {
    type: 'arrow';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    startRef?: Connection | null;
    endRef?: Connection | null;
    connector?: Connector;
}

export interface PathShape extends CommonProps {
    type: 'path';
    // Flat list of absolute coordinates: [x0, y0, x1, y1, …].
    points: number[];
}

export interface TextShape extends CommonProps {
    type: 'text';
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    fontSize: number;
    fontFamily: string;
    align: TextAlign;
    bold: boolean;
    italic: boolean;
}

export interface ImageShape extends CommonProps {
    type: 'image';
    x: number;
    y: number;
    w: number;
    h: number;
    href: string; // data-URL
}

export type Shape =
    | RectShape
    | EllipseShape
    | PolygonShape
    | CalloutShape
    | LineShape
    | ArrowShape
    | PathShape
    | TextShape
    | ImageShape;

export interface Scene {
    width: number;
    height: number;
    background: string; // '#ffffff' or 'transparent'
    shapes: Shape[]; // array order === z-order (index 0 = back)
}

export interface Bounds {
    x: number;
    y: number;
    w: number;
    h: number;
}

// ── construction helpers ──────────────────────────────────────────────────

let idCounter = 0;
export function createId(): string {
    idCounter += 1;
    return `s${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function emptyScene(width = 640, height = 420): Scene {
    return { width, height, background: '#ffffff', shapes: [] };
}

/** Shapes that carry an axis-aligned x/y/w/h box. */
export type BoxShape =
    | RectShape
    | EllipseShape
    | PolygonShape
    | CalloutShape
    | TextShape
    | ImageShape;

export function isBoxShape(shape: Shape): shape is BoxShape {
    return (
        shape.type === 'rect' ||
        shape.type === 'ellipse' ||
        shape.type === 'polygon' ||
        shape.type === 'callout' ||
        shape.type === 'text' ||
        shape.type === 'image'
    );
}

// ── geometry ──────────────────────────────────────────────────────────────

export function shapeBounds(shape: Shape): Bounds {
    if (isBoxShape(shape)) {
        // Normalise negative extents so bounds are always positive-sized.
        const x = shape.w < 0 ? shape.x + shape.w : shape.x;
        const y = shape.h < 0 ? shape.y + shape.h : shape.y;
        return { x, y, w: Math.abs(shape.w), h: Math.abs(shape.h) };
    }
    if (shape.type === 'line' || shape.type === 'arrow') {
        const x = Math.min(shape.x1, shape.x2);
        const y = Math.min(shape.y1, shape.y2);
        return { x, y, w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) };
    }
    // path
    const pts = shape.points;
    if (pts.length < 2) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxY = Math.max(maxY, pts[i + 1]);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function shapeCenter(shape: Shape): { cx: number; cy: number } {
    const b = shapeBounds(shape);
    return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
}

export function sceneBounds(scene: Scene): Bounds {
    if (scene.shapes.length === 0) return { x: 0, y: 0, w: scene.width, h: scene.height };
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const s of scene.shapes) {
        const b = shapeBounds(s);
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Move a shape by (dx, dy), returning a new shape (immutably). */
export function translateShape<T extends Shape>(shape: T, dx: number, dy: number): T {
    if (isBoxShape(shape)) {
        const next = { ...shape, x: shape.x + dx, y: shape.y + dy } as T;
        if (next.type === 'callout') {
            (next as CalloutShape).tailX += dx;
            (next as CalloutShape).tailY += dy;
        }
        return next;
    }
    if (shape.type === 'line' || shape.type === 'arrow') {
        return {
            ...shape,
            x1: shape.x1 + dx,
            y1: shape.y1 + dy,
            x2: shape.x2 + dx,
            y2: shape.y2 + dy,
        } as T;
    }
    // path
    return {
        ...shape,
        points: shape.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)),
    } as T;
}

/**
 * Scale a shape as part of a group: map its geometry from the frame `prev`
 * (the group's old bounding box) into `next` (the new one), so several shapes
 * resize together as one. Unlike `resizeShape`, a box shape's own box is
 * translated + scaled within the frame rather than set equal to it.
 */
export function scaleShapeInFrame<T extends Shape>(shape: T, prev: Bounds, next: Bounds): T {
    const sx = prev.w === 0 ? 1 : next.w / prev.w;
    const sy = prev.h === 0 ? 1 : next.h / prev.h;
    const mapX = (x: number) => next.x + (x - prev.x) * sx;
    const mapY = (y: number) => next.y + (y - prev.y) * sy;

    if (isBoxShape(shape)) {
        const out = {
            ...shape,
            x: mapX(shape.x),
            y: mapY(shape.y),
            w: shape.w * sx,
            h: shape.h * sy,
        } as T;
        if (out.type === 'callout') {
            const c = out as CalloutShape;
            c.tailX = mapX((shape as CalloutShape).tailX);
            c.tailY = mapY((shape as CalloutShape).tailY);
        }
        if (out.type === 'text') {
            (out as TextShape).fontSize = Math.max(4, (shape as TextShape).fontSize * sy);
        }
        return out;
    }
    if (shape.type === 'line' || shape.type === 'arrow') {
        return {
            ...shape,
            x1: mapX(shape.x1),
            y1: mapY(shape.y1),
            x2: mapX(shape.x2),
            y2: mapY(shape.y2),
        } as T;
    }
    return {
        ...shape,
        points: shape.points.map((v, i) => (i % 2 === 0 ? mapX(v) : mapY(v))),
    } as T;
}

/**
 * Resize a shape so its bounding box becomes `next`, scaling geometry from the
 * `prev` box. `prev` is the shape's current bounds.
 */
export function resizeShape<T extends Shape>(shape: T, prev: Bounds, next: Bounds): T {
    const sx = prev.w === 0 ? 1 : next.w / prev.w;
    const sy = prev.h === 0 ? 1 : next.h / prev.h;
    const mapX = (x: number) => next.x + (x - prev.x) * sx;
    const mapY = (y: number) => next.y + (y - prev.y) * sy;

    if (isBoxShape(shape)) {
        const out = { ...shape, x: next.x, y: next.y, w: next.w, h: next.h } as T;
        if (out.type === 'callout') {
            const c = out as CalloutShape;
            c.tailX = mapX((shape as CalloutShape).tailX);
            c.tailY = mapY((shape as CalloutShape).tailY);
        }
        return out;
    }
    if (shape.type === 'line' || shape.type === 'arrow') {
        return {
            ...shape,
            x1: mapX(shape.x1),
            y1: mapY(shape.y1),
            x2: mapX(shape.x2),
            y2: mapY(shape.y2),
        } as T;
    }
    return {
        ...shape,
        points: shape.points.map((v, i) => (i % 2 === 0 ? mapX(v) : mapY(v))),
    } as T;
}

// ── connection anchors ────────────────────────────────────────────────────

// The edge midpoints offered as connection anchors (the "four sides").
export const ANCHOR_IDS: AnchorId[] = ['top', 'right', 'bottom', 'left'];

/** Only closed/box shapes can be connected to. */
export function isConnectable(shape: Shape): boolean {
    return isBoxShape(shape);
}

// Midpoints of each polygon edge, keyed `e0`, `e1`, … in vertex order.
function polygonEdgeAnchors(shape: PolygonShape): Array<{ id: AnchorId; x: number; y: number }> {
    const verts = polygonVertices(shape);
    return verts.map((v, i) => {
        const n = verts[(i + 1) % verts.length];
        return { id: `e${i}` as AnchorId, x: (v[0] + n[0]) / 2, y: (v[1] + n[1]) / 2 };
    });
}

/** World position of a named anchor on a shape. */
export function anchorPoint(shape: Shape, anchor: AnchorId): { x: number; y: number } {
    if (shape.type === 'polygon' && typeof anchor === 'string' && anchor[0] === 'e') {
        const i = parseInt(anchor.slice(1), 10);
        const verts = polygonVertices(shape);
        if (!Number.isNaN(i) && i < verts.length) {
            const a = verts[i];
            const n = verts[(i + 1) % verts.length];
            return { x: (a[0] + n[0]) / 2, y: (a[1] + n[1]) / 2 };
        }
    }
    const b = shapeBounds(shape);
    switch (anchor) {
        case 'top':
            return { x: b.x + b.w / 2, y: b.y };
        case 'right':
            return { x: b.x + b.w, y: b.y + b.h / 2 };
        case 'bottom':
            return { x: b.x + b.w / 2, y: b.y + b.h };
        case 'left':
            return { x: b.x, y: b.y + b.h / 2 };
        default:
            return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }
}

export function shapeAnchors(shape: Shape): Array<{ id: AnchorId; x: number; y: number }> {
    // Polygons anchor on their real edges; other box shapes on the four sides.
    if (shape.type === 'polygon') return polygonEdgeAnchors(shape);
    return ANCHOR_IDS.map((id) => ({ id, ...anchorPoint(shape, id) }));
}

/**
 * Re-derive every connected line/arrow endpoint from its bound shape's current
 * anchor position. Call after any mutation so connectors follow their shapes.
 * Dangling references (target deleted) are left untouched.
 */
export function syncConnections(scene: Scene): Scene {
    const byId = new Map(scene.shapes.map((s) => [s.id, s]));
    let changed = false;
    const shapes = scene.shapes.map((s) => {
        if (s.type !== 'line' && s.type !== 'arrow') return s;
        let ns = s;
        if (s.startRef) {
            const t = byId.get(s.startRef.shapeId);
            if (t && t.id !== s.id) {
                const p = anchorPoint(t, s.startRef.anchor);
                if (p.x !== ns.x1 || p.y !== ns.y1) {
                    ns = { ...ns, x1: p.x, y1: p.y };
                    changed = true;
                }
            }
        }
        if (s.endRef) {
            const t = byId.get(s.endRef.shapeId);
            if (t && t.id !== s.id) {
                const p = anchorPoint(t, s.endRef.anchor);
                if (p.x !== ns.x2 || p.y !== ns.y2) {
                    ns = { ...ns, x2: p.x, y2: p.y };
                    changed = true;
                }
            }
        }
        return ns;
    });
    return changed ? { ...scene, shapes } : scene;
}

// ── grouping (hierarchical) ─────────────────────────────────────────────────

/** Outermost group id of a shape, or a shape-unique token if ungrouped. */
export function topUnit(shape: Shape): string {
    return shape.groups?.[0] ?? `#${shape.id}`;
}

/** Grouping is possible only when the selection spans 2+ top-level units. */
export function canGroupSelection(shapes: Shape[], ids: string[]): boolean {
    if (ids.length < 2) return false;
    const sel = new Set(ids);
    const units = new Set<string>();
    for (const s of shapes) if (sel.has(s.id)) units.add(topUnit(s));
    return units.size >= 2;
}

/** Whether any selected shape belongs to a group (i.e. ungroup is possible). */
export function selectionHasGroup(shapes: Shape[], ids: string[]): boolean {
    const sel = new Set(ids);
    return shapes.some((s) => sel.has(s.id) && (s.groups?.length ?? 0) > 0);
}

/**
 * Expand a raw selection to include every shape that shares an outermost group
 * with any selected shape, so a top-level group always selects as a whole.
 */
export function expandSelection(shapes: Shape[], ids: string[]): string[] {
    const byId = new Map(shapes.map((s) => [s.id, s]));
    const outer = new Set<string>();
    for (const id of ids) {
        const g = byId.get(id)?.groups?.[0];
        if (g) outer.add(g);
    }
    if (!outer.size) return ids;
    const set = new Set(ids);
    for (const s of shapes) {
        const g = s.groups?.[0];
        if (g && outer.has(g)) set.add(s.id);
    }
    return [...set];
}

/** Wrap the selection in a new outermost group, preserving inner grouping. */
export function groupSelection(scene: Scene, ids: string[]): Scene {
    if (!canGroupSelection(scene.shapes, ids)) return scene;
    const gid = createId();
    const sel = new Set(ids);
    return {
        ...scene,
        shapes: scene.shapes.map((s) =>
            sel.has(s.id) ? { ...s, groups: [gid, ...(s.groups ?? [])] } : s,
        ),
    };
}

/**
 * Peel one (outermost) level of grouping from the selection, e.g.
 * ungroup(group(group(a,b), c)) → group(a,b) and c.
 */
export function ungroupSelection(scene: Scene, ids: string[]): Scene {
    const sel = new Set(ids);
    return {
        ...scene,
        shapes: scene.shapes.map((s) => {
            if (!sel.has(s.id) || !s.groups?.length) return s;
            const rest = s.groups.slice(1);
            const ns: Shape = { ...s };
            if (rest.length) ns.groups = rest;
            else delete ns.groups;
            return ns;
        }),
    };
}

// ── SVG rendering ─────────────────────────────────────────────────────────

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function dashArray(dash: DashStyle, w: number): string {
    const sw = Math.max(1, w);
    if (dash === 'dash') return `${sw * 3},${sw * 2}`;
    // Zero-length dashes + round caps render as true round dots (a non-zero
    // dash would look like a small capsule/dash instead).
    if (dash === 'dot') return `0,${sw * 2}`;
    return '';
}

function strokeAttrs(s: CommonProps): string {
    const parts: string[] = [];
    parts.push(`stroke="${escapeXml(s.stroke)}"`);
    parts.push(`stroke-width="${s.strokeWidth}"`);
    const da = dashArray(s.strokeDash, s.strokeWidth);
    if (da) parts.push(`stroke-dasharray="${da}"`);
    if (s.strokeDash === 'dot') parts.push('stroke-linecap="round"');
    return parts.join(' ');
}

// The polygon's vertices, in order — shared by SVG rendering and edge anchors
// so anchors sit exactly on the drawn sides.
export function polygonVertices(shape: PolygonShape): Array<[number, number]> {
    const { x, y, w, h, kind } = shape;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const pts: Array<[number, number]> = [];
    if (kind === 'triangle') {
        pts.push([cx, y], [x + w, y + h], [x, y + h]);
    } else if (kind === 'diamond') {
        pts.push([cx, y], [x + w, cy], [cx, y + h], [x, cy]);
    } else if (kind === 'star') {
        const spikes = 5;
        const outerR = Math.min(w, h) / 2;
        const innerR = outerR * 0.4;
        for (let i = 0; i < spikes * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const a = (Math.PI / spikes) * i - Math.PI / 2;
            pts.push([cx + (r * Math.cos(a) * w) / Math.min(w, h), cy + (r * Math.sin(a) * h) / Math.min(w, h)]);
        }
    } else {
        // pentagon / hexagon
        const sides = kind === 'pentagon' ? 5 : 6;
        for (let i = 0; i < sides; i++) {
            const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
            pts.push([cx + (Math.cos(a) * w) / 2, cy + (Math.sin(a) * h) / 2]);
        }
    }
    return pts;
}

function polygonPoints(shape: PolygonShape): string {
    return polygonVertices(shape)
        .map(([px, py]) => `${round(px)},${round(py)}`)
        .join(' ');
}

function round(n: number): number {
    return Math.round(n * 100) / 100;
}

// ── line/arrow connector routing ────────────────────────────────────────────

type Pt = [number, number];

// Fallback mid controls for an *unbound* connector: routed along the dominant
// axis so the shaft leaves each endpoint perpendicular to it.
function connectorBends(x1: number, y1: number, x2: number, y2: number): { c1: Pt; c2: Pt } {
    const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    if (horizontal) {
        const mx = (x1 + x2) / 2;
        return { c1: [mx, y1], c2: [mx, y2] };
    }
    const my = (y1 + y2) / 2;
    return { c1: [x1, my], c2: [x2, my] };
}

// Outward unit normal for a *named* box anchor (top/right/bottom/left). This is
// the direction the connector must leave/enter so it meets the edge at a right
// angle. Centre and polygon-edge anchors have no forced direction → [0, 0].
function anchorDir(anchor: AnchorId | null | undefined): Pt {
    switch (anchor) {
        case 'top':
            return [0, -1];
        case 'bottom':
            return [0, 1];
        case 'left':
            return [-1, 0];
        case 'right':
            return [1, 0];
        default:
            return [0, 0];
    }
}

const hasDir = (d: Pt) => d[0] !== 0 || d[1] !== 0;

// The exit directions at each endpoint, taken from the bound anchor (if any).
function connectorDirs(s: LineShape | ArrowShape): { dA: Pt; dB: Pt } {
    return {
        dA: s.startRef ? anchorDir(s.startRef.anchor) : [0, 0],
        dB: s.endRef ? anchorDir(s.endRef.anchor) : [0, 0],
    };
}

// Drop points that are duplicates or lie *between* their neighbours on a
// straight run (truly redundant). Reversal points (e.g. a perpendicular stub
// that doubles back) are extrema, not between, so they are kept.
function simplifyOrtho(pts: Pt[]): Pt[] {
    const eps = 1e-6;
    const dedup: Pt[] = [];
    for (const p of pts) {
        const last = dedup[dedup.length - 1];
        if (!last || Math.abs(last[0] - p[0]) > eps || Math.abs(last[1] - p[1]) > eps) dedup.push(p);
    }
    const out: Pt[] = [];
    for (let i = 0; i < dedup.length; i++) {
        if (i === 0 || i === dedup.length - 1) {
            out.push(dedup[i]);
            continue;
        }
        const a = out[out.length - 1];
        const b = dedup[i];
        const c = dedup[i + 1];
        const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const between =
            b[0] >= Math.min(a[0], c[0]) - eps &&
            b[0] <= Math.max(a[0], c[0]) + eps &&
            b[1] >= Math.min(a[1], c[1]) - eps &&
            b[1] <= Math.max(a[1], c[1]) + eps;
        if (Math.abs(cross) < eps && between) continue;
        out.push(b);
    }
    return out;
}

const samePt = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

// Orthogonal (elbow) route as corner points, plus a handle on its middle
// segment (when it has one) so it can be nudged to dodge overlaps. When an
// endpoint is bound to an anchor, a short perpendicular stub is pushed out first
// so the shaft meets the edge at a right angle (the "twist"). Same-axis ends
// produce a Z with an adjustable mid bar; crossed axes produce an L (no bar).
function computeElbow(s: LineShape | ArrowShape): {
    pts: Pt[];
    mid: { i: number; axis: 'x' | 'y'; auto: number } | null;
} {
    const { x1, y1, x2, y2 } = s;
    let overrideVal: number | undefined;
    let overrideAxis: 'x' | 'y' | undefined;
    if (s.type === 'line') {
        overrideVal = s.elbowMid;
        overrideAxis = s.elbowMidAxis;
    }
    const { dA, dB } = connectorDirs(s);
    const boundA = hasDir(dA);
    const boundB = hasDir(dB);

    let sA: Pt, sB: Pt, axisA: 'h' | 'v', axisB: 'h' | 'v';
    if (!boundA && !boundB) {
        axisA = axisB = Math.abs(x2 - x1) >= Math.abs(y2 - y1) ? 'h' : 'v';
        sA = [x1, y1];
        sB = [x2, y2];
    } else {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const stub = Math.min(24, Math.max(8, dist * 0.25));
        sA = boundA ? [x1 + dA[0] * stub, y1 + dA[1] * stub] : [x1, y1];
        sB = boundB ? [x2 + dB[0] * stub, y2 + dB[1] * stub] : [x2, y2];
        // Normal axis of each bound anchor ('h' for left/right, 'v' for top/bottom).
        const nAxisA = boundA ? (dA[0] !== 0 ? 'h' : 'v') : null;
        const nAxisB = boundB ? (dB[0] !== 0 ? 'h' : 'v') : null;
        const perp = (ax: 'h' | 'v') => (ax === 'h' ? 'v' : 'h');
        if (boundA && boundB && nAxisA === nAxisB) {
            // Anchors on the same normal axis (e.g. left→right): a Z straight
            // across that axis reads best.
            axisA = axisB = nAxisA!;
        } else {
            // Otherwise turn perpendicular at each bound stub, so the connector
            // rounds the OUTSIDE of the shape instead of cutting through its body
            // to reach the anchor. Free ends just complement the other end.
            axisA = nAxisA ? perp(nAxisA) : perp(perp(nAxisB!));
            axisB = nAxisB ? perp(nAxisB) : perp(perp(nAxisA!));
        }
    }

    const raw: Pt[] = [[x1, y1]];
    if (boundA) raw.push(sA);

    // Link the two stub ends. Crossed axes → single corner (L); same axis → two
    // bends around a middle bar, whose cross-axis position honours the override.
    let midInfo: { axis: 'x' | 'y'; auto: number; a: Pt; b: Pt } | null = null;
    if (axisA === 'h' && axisB === 'v') {
        raw.push([sB[0], sA[1]]);
    } else if (axisA === 'v' && axisB === 'h') {
        raw.push([sA[0], sB[1]]);
    } else if (axisA === 'h' && axisB === 'h') {
        const auto = (sA[0] + sB[0]) / 2;
        const mx = overrideAxis === 'x' && overrideVal !== undefined ? auto + overrideVal : auto;
        const a: Pt = [mx, sA[1]];
        const b: Pt = [mx, sB[1]];
        raw.push(a, b);
        midInfo = { axis: 'x', auto, a, b };
    } else {
        const auto = (sA[1] + sB[1]) / 2;
        const my = overrideAxis === 'y' && overrideVal !== undefined ? auto + overrideVal : auto;
        const a: Pt = [sA[0], my];
        const b: Pt = [sB[0], my];
        raw.push(a, b);
        midInfo = { axis: 'y', auto, a, b };
    }

    if (boundB) raw.push(sB);
    raw.push([x2, y2]);

    const pts = simplifyOrtho(raw);
    let mid: { i: number; axis: 'x' | 'y'; auto: number } | null = null;
    if (midInfo) {
        for (let i = 0; i < pts.length - 1; i++) {
            if (samePt(pts[i], midInfo.a) && samePt(pts[i + 1], midInfo.b)) {
                mid = { i, axis: midInfo.axis, auto: midInfo.auto };
                break;
            }
        }
    }
    return { pts, mid };
}

function elbowRoute(s: LineShape | ArrowShape): Pt[] {
    return computeElbow(s).pts;
}

/**
 * The draggable middle segment of an elbow connector: its two endpoints, the
 * axis it slides along ('x'/'y'), and its auto-centred coordinate (used to turn
 * a pointer position into the stored `elbowMid` delta). Null when the route has
 * no adjustable mid bar (straight/curved, or an L-shaped elbow).
 */
export function elbowMidSegment(
    s: LineShape,
): { a: Pt; b: Pt; axis: 'x' | 'y'; auto: number } | null {
    if ((s.connector ?? 'straight') !== 'elbow') return null;
    const { pts, mid } = computeElbow(s);
    if (!mid) return null;
    return { a: pts[mid.i], b: pts[mid.i + 1], axis: mid.axis, auto: mid.auto };
}

// Cubic control points for a curved connector. Bound endpoints pull the curve
// out perpendicular to their edge; free ends fall back to the dominant-axis mid.
function curvedControls(s: LineShape | ArrowShape): { c1: Pt; c2: Pt } {
    const { x1, y1, x2, y2 } = s;
    const { dA, dB } = connectorDirs(s);
    const fallback = connectorBends(x1, y1, x2, y2);
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const handle = Math.max(16, Math.min(dist * 0.45, 90));
    return {
        c1: hasDir(dA) ? [x1 + dA[0] * handle, y1 + dA[1] * handle] : fallback.c1,
        c2: hasDir(dB) ? [x2 + dB[0] * handle, y2 + dB[1] * handle] : fallback.c2,
    };
}

/**
 * Polyline approximation of a connector in scene coordinates, as a flat list
 * [x0, y0, x1, y1, …]. Straight → the two endpoints; elbow → its corner
 * vertices; curved → the cubic sampled into short segments (for hit-testing).
 */
export function connectorPolyline(s: LineShape | ArrowShape): number[] {
    const { x1, y1, x2, y2 } = s;
    const connector = s.connector ?? 'straight';
    if (connector === 'straight') return [x1, y1, x2, y2];
    if (connector === 'elbow') return elbowRoute(s).flat();
    // curved — sample the cubic Bézier
    const { c1, c2 } = curvedControls(s);
    const out: number[] = [];
    const STEPS = 18;
    for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const mt = 1 - t;
        const a = mt * mt * mt;
        const b = 3 * mt * mt * t;
        const cc = 3 * mt * t * t;
        const d = t * t * t;
        out.push(
            a * x1 + b * c1[0] + cc * c2[0] + d * x2,
            a * y1 + b * c1[1] + cc * c2[1] + d * y2,
        );
    }
    return out;
}

/** SVG path `d` for a line/arrow shaft, honouring its connector routing. */
function connectorPathD(s: LineShape | ArrowShape): string {
    const { x1, y1, x2, y2 } = s;
    const connector = s.connector ?? 'straight';
    if (connector === 'straight') {
        return `M ${round(x1)} ${round(y1)} L ${round(x2)} ${round(y2)}`;
    }
    if (connector === 'elbow') {
        const [head, ...rest] = elbowRoute(s);
        return (
            `M ${round(head[0])} ${round(head[1])} ` +
            rest.map((p) => `L ${round(p[0])} ${round(p[1])}`).join(' ')
        );
    }
    const { c1, c2 } = curvedControls(s);
    return (
        `M ${round(x1)} ${round(y1)} C ${round(c1[0])} ${round(c1[1])} ` +
        `${round(c2[0])} ${round(c2[1])} ${round(x2)} ${round(y2)}`
    );
}

function norm(dx: number, dy: number): Pt {
    const len = Math.hypot(dx, dy);
    return len < 1e-9 ? [0, 0] : [dx / len, dy / len];
}

// Outward tangent at each endpoint — the direction an arrowhead points — matching
// however the shaft is actually drawn (straight/elbow segments or the cubic).
function connectorEndDirs(s: LineShape): { startDir: Pt; endDir: Pt } {
    const { x1, y1, x2, y2 } = s;
    const connector = s.connector ?? 'straight';
    const straight = { startDir: norm(x1 - x2, y1 - y2), endDir: norm(x2 - x1, y2 - y1) };
    if (connector === 'curved') {
        const { c1, c2 } = curvedControls(s);
        const sd = norm(x1 - c1[0], y1 - c1[1]);
        const ed = norm(x2 - c2[0], y2 - c2[1]);
        return {
            startDir: hasDir(sd) ? sd : straight.startDir,
            endDir: hasDir(ed) ? ed : straight.endDir,
        };
    }
    if (connector === 'elbow') {
        const p = elbowRoute(s);
        const n = p.length;
        const sd = norm(p[0][0] - p[1][0], p[0][1] - p[1][1]);
        const ed = norm(p[n - 1][0] - p[n - 2][0], p[n - 1][1] - p[n - 2][1]);
        return {
            startDir: hasDir(sd) ? sd : straight.startDir,
            endDir: hasDir(ed) ? ed : straight.endDir,
        };
    }
    return straight;
}

// A filled triangular arrowhead whose tip is at (tx,ty), opening back along -dir.
function arrowHeadMarkup(tx: number, ty: number, dir: Pt, s: CommonProps): string {
    const headLen = 8 + s.strokeWidth * 2.5;
    const headW = 5 + s.strokeWidth * 2;
    const bx = tx - dir[0] * headLen;
    const by = ty - dir[1] * headLen;
    const px = -dir[1];
    const py = dir[0];
    return (
        `<polygon points="${round(tx)},${round(ty)} ` +
        `${round(bx + px * headW)},${round(by + py * headW)} ` +
        `${round(bx - px * headW)},${round(by - py * headW)}" ` +
        `fill="${escapeXml(s.stroke)}" stroke="none" />`
    );
}

/**
 * A line/arrow-tail line segment (straight/elbow/curved) with optional
 * arrowheads on either end. The shaft is pulled back at each capped end so it
 * meets the arrowhead's base rather than poking through its tip.
 */
function lineMarkup(s: LineShape): string {
    const startArrow = !!s.startArrow;
    const endArrow = !!s.endArrow;
    const connector = s.connector ?? 'straight';

    // No heads → the plain shaft (unchanged rendering).
    if (!startArrow && !endArrow) {
        if (connector === 'straight') {
            return `<line x1="${round(s.x1)}" y1="${round(s.y1)}" x2="${round(
                s.x2,
            )}" y2="${round(s.y2)}" ${strokeAttrs(s)} stroke-linecap="round" />`;
        }
        return `<path d="${connectorPathD(s)}" fill="none" ${strokeAttrs(
            s,
        )} stroke-linecap="round" stroke-linejoin="round" />`;
    }

    const { startDir, endDir } = connectorEndDirs(s);
    const trim = (8 + s.strokeWidth * 2.5) * 0.9; // ≈ arrowhead length

    let shaft: string;
    if (connector === 'curved') {
        const { c1, c2 } = curvedControls(s);
        const sx = startArrow ? s.x1 - startDir[0] * trim : s.x1;
        const sy = startArrow ? s.y1 - startDir[1] * trim : s.y1;
        const ex = endArrow ? s.x2 - endDir[0] * trim : s.x2;
        const ey = endArrow ? s.y2 - endDir[1] * trim : s.y2;
        shaft =
            `<path d="M ${round(sx)} ${round(sy)} C ${round(c1[0])} ${round(c1[1])} ` +
            `${round(c2[0])} ${round(c2[1])} ${round(ex)} ${round(ey)}" fill="none" ${strokeAttrs(
                s,
            )} stroke-linecap="round" stroke-linejoin="round" />`;
    } else if (connector === 'elbow') {
        const pts = elbowRoute(s);
        const n = pts.length;
        if (startArrow) {
            const seg = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
            const t = Math.min(trim, seg * 0.9);
            pts[0] = [pts[0][0] - startDir[0] * t, pts[0][1] - startDir[1] * t];
        }
        if (endArrow) {
            const seg = Math.hypot(pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]);
            const t = Math.min(trim, seg * 0.9);
            pts[n - 1] = [pts[n - 1][0] - endDir[0] * t, pts[n - 1][1] - endDir[1] * t];
        }
        const d =
            `M ${round(pts[0][0])} ${round(pts[0][1])} ` +
            pts
                .slice(1)
                .map((p) => `L ${round(p[0])} ${round(p[1])}`)
                .join(' ');
        shaft = `<path d="${d}" fill="none" ${strokeAttrs(
            s,
        )} stroke-linecap="round" stroke-linejoin="round" />`;
    } else {
        const sx = startArrow ? s.x1 - startDir[0] * trim : s.x1;
        const sy = startArrow ? s.y1 - startDir[1] * trim : s.y1;
        const ex = endArrow ? s.x2 - endDir[0] * trim : s.x2;
        const ey = endArrow ? s.y2 - endDir[1] * trim : s.y2;
        shaft = `<line x1="${round(sx)}" y1="${round(sy)}" x2="${round(ex)}" y2="${round(
            ey,
        )}" ${strokeAttrs(s)} stroke-linecap="round" />`;
    }

    let heads = '';
    if (startArrow) heads += arrowHeadMarkup(s.x1, s.y1, startDir, s);
    if (endArrow) heads += arrowHeadMarkup(s.x2, s.y2, endDir, s);
    return shaft + heads;
}

/** Line + a filled triangular head drawn manually (robust when rasterized). */
function arrowMarkup(shape: ArrowShape): string {
    const { x1, y1, x2, y2, strokeWidth } = shape;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 8 + strokeWidth * 2.5;
    const headW = 5 + strokeWidth * 2;
    // Pull the line back so it doesn't poke through the head tip.
    const bx = x2 - Math.cos(angle) * headLen * 0.8;
    const by = y2 - Math.sin(angle) * headLen * 0.8;
    const leftX = x2 - Math.cos(angle) * headLen - Math.sin(angle) * headW;
    const leftY = y2 - Math.sin(angle) * headLen + Math.cos(angle) * headW;
    const rightX = x2 - Math.cos(angle) * headLen + Math.sin(angle) * headW;
    const rightY = y2 - Math.sin(angle) * headLen - Math.cos(angle) * headW;
    const line = `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(bx)}" y2="${round(
        by,
    )}" ${strokeAttrs(shape)} fill="none" />`;
    const head = `<polygon points="${round(x2)},${round(y2)} ${round(leftX)},${round(leftY)} ${round(
        rightX,
    )},${round(rightY)}" fill="${escapeXml(shape.stroke)}" stroke="none" />`;
    return line + head;
}

function calloutPath(shape: CalloutShape): string {
    const { x, y, w, h, rx, tailX, tailY } = shape;
    const r = Math.max(0, Math.min(rx, w / 2, h / 2));
    // Rounded-rect body with a triangular tail on the nearest edge.
    // Tail base sits on the bottom edge by default, centred under the tip's x.
    const baseHalf = Math.max(6, Math.min(w / 4, 14));
    let baseCx = Math.max(x + r + baseHalf, Math.min(tailX, x + w - r - baseHalf));
    const path: string[] = [];
    path.push(`M ${round(x + r)} ${round(y)}`);
    path.push(`H ${round(x + w - r)}`);
    path.push(`Q ${round(x + w)} ${round(y)} ${round(x + w)} ${round(y + r)}`);
    path.push(`V ${round(y + h - r)}`);
    path.push(`Q ${round(x + w)} ${round(y + h)} ${round(x + w - r)} ${round(y + h)}`);
    // bottom edge with tail
    path.push(`H ${round(baseCx + baseHalf)}`);
    path.push(`L ${round(tailX)} ${round(tailY)}`);
    path.push(`L ${round(baseCx - baseHalf)} ${round(y + h)}`);
    path.push(`H ${round(x + r)}`);
    path.push(`Q ${round(x)} ${round(y + h)} ${round(x)} ${round(y + h - r)}`);
    path.push(`V ${round(y + r)}`);
    path.push(`Q ${round(x)} ${round(y)} ${round(x + r)} ${round(y)}`);
    path.push('Z');
    return path.join(' ');
}

function pathData(points: number[]): string {
    if (points.length < 2) return '';
    let d = `M ${round(points[0])} ${round(points[1])}`;
    for (let i = 2; i < points.length; i += 2) {
        d += ` L ${round(points[i])} ${round(points[i + 1])}`;
    }
    return d;
}

function textMarkup(shape: TextShape): string {
    const { x, y, w, fontSize, fontFamily, align, bold, italic, fill } = shape;
    const lineHeight = fontSize * 1.25;
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    const lines = shape.text.split('\n');
    const tspans = lines
        .map(
            (ln, i) =>
                `<tspan x="${round(tx)}" dy="${i === 0 ? 0 : round(lineHeight)}">${escapeXml(
                    ln || ' ',
                )}</tspan>`,
        )
        .join('');
    const weight = bold ? ' font-weight="bold"' : '';
    const style = italic ? ' font-style="italic"' : '';
    return `<text x="${round(tx)}" y="${round(y + fontSize)}" font-family="${escapeXml(
        fontFamily,
    )}" font-size="${fontSize}" fill="${escapeXml(
        fill === 'none' ? '#000000' : fill,
    )}" text-anchor="${anchor}"${weight}${style} xml:space="preserve">${tspans}</text>`;
}

export function shapeToSvg(shape: Shape): string {
    let body = '';
    switch (shape.type) {
        case 'rect':
            body = `<rect x="${round(shape.x)}" y="${round(shape.y)}" width="${round(
                shape.w,
            )}" height="${round(shape.h)}" rx="${round(shape.rx)}" ry="${round(
                shape.rx,
            )}" fill="${escapeXml(shape.fill)}" ${strokeAttrs(shape)} />`;
            break;
        case 'ellipse':
            body = `<ellipse cx="${round(shape.x + shape.w / 2)}" cy="${round(
                shape.y + shape.h / 2,
            )}" rx="${round(Math.abs(shape.w) / 2)}" ry="${round(
                Math.abs(shape.h) / 2,
            )}" fill="${escapeXml(shape.fill)}" ${strokeAttrs(shape)} />`;
            break;
        case 'polygon':
            body = `<polygon points="${polygonPoints(shape)}" fill="${escapeXml(
                shape.fill,
            )}" ${strokeAttrs(shape)} stroke-linejoin="round" />`;
            break;
        case 'callout':
            body = `<path d="${calloutPath(shape)}" fill="${escapeXml(shape.fill)}" ${strokeAttrs(
                shape,
            )} stroke-linejoin="round" />`;
            break;
        case 'line':
            body = lineMarkup(shape);
            break;
        case 'arrow':
            body = arrowMarkup(shape);
            break;
        case 'path':
            body = `<path d="${pathData(shape.points)}" fill="none" ${strokeAttrs(
                shape,
            )} stroke-linecap="round" stroke-linejoin="round" />`;
            break;
        case 'image':
            body = `<image x="${round(shape.x)}" y="${round(shape.y)}" width="${round(
                shape.w,
            )}" height="${round(
                shape.h,
            )}" preserveAspectRatio="none" href="${escapeXml(shape.href)}" />`;
            break;
        case 'text':
            body = textMarkup(shape);
            break;
    }

    let attrs = '';
    if (shape.opacity !== 1) attrs += ` opacity="${shape.opacity}"`;
    if (shape.rotation) {
        const { cx, cy } = shapeCenter(shape);
        attrs += ` transform="rotate(${round(shape.rotation)} ${round(cx)} ${round(cy)})"`;
    }
    if (!attrs) return body;
    return `<g${attrs}>${body}</g>`;
}

/** Serialize a scene to a standalone SVG document string. */
export function sceneToSvg(scene: Scene): string {
    const bg =
        scene.background && scene.background !== 'transparent'
            ? `<rect x="0" y="0" width="${scene.width}" height="${scene.height}" fill="${escapeXml(
                  scene.background,
              )}" />`
            : '';
    const body = scene.shapes.map(shapeToSvg).join('');
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" ` +
        `viewBox="0 0 ${scene.width} ${scene.height}">${bg}${body}</svg>`
    );
}

/** Base64 `data:image/svg+xml` URL for the scene. */
export function sceneToDataUrl(scene: Scene): string {
    const svg = sceneToSvg(scene);
    const b64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${b64}`;
}

// ── shape construction ────────────────────────────────────────────────────

export interface StyleDefaults {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeDash: DashStyle;
    opacity: number;
    fontSize: number;
    fontFamily: string;
    align: TextAlign;
    bold: boolean;
    italic: boolean;
    startArrow: boolean; // default tail cap for new line segments
    endArrow: boolean;
}

export const DEFAULT_STYLE: StyleDefaults = {
    fill: '#dbe6ff',
    stroke: '#2f4b7c',
    strokeWidth: 2,
    strokeDash: 'solid',
    opacity: 1,
    fontSize: 20,
    fontFamily: 'EB Garamond, Georgia, serif',
    align: 'left',
    bold: false,
    italic: false,
    startArrow: false,
    endArrow: false,
};

export type DrawTool =
    | 'select'
    | 'pan'
    | 'rect'
    | 'roundRect'
    | 'ellipse'
    | 'line'
    | 'arrow'
    | 'elbow'
    | 'curved'
    | 'triangle'
    | 'diamond'
    | 'pentagon'
    | 'hexagon'
    | 'star'
    | 'callout'
    | 'pen'
    | 'text';

const POLYGON_TOOLS: Record<string, PolygonKind> = {
    triangle: 'triangle',
    diamond: 'diamond',
    pentagon: 'pentagon',
    hexagon: 'hexagon',
    star: 'star',
};

function common(style: StyleDefaults): CommonProps {
    return {
        id: createId(),
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeDash: style.strokeDash,
        opacity: style.opacity,
        rotation: 0,
    };
}

/** Build a shape for a drawing tool from a (normalised) drag box. */
export function createShapeFromBox(
    tool: DrawTool,
    style: StyleDefaults,
    box: Bounds,
): Shape | null {
    const c = common(style);
    const { x, y, w, h } = box;
    switch (tool) {
        case 'rect':
            return { ...c, type: 'rect', x, y, w, h, rx: 0 };
        case 'roundRect':
            return { ...c, type: 'rect', x, y, w, h, rx: Math.min(w, h) * 0.15 };
        case 'ellipse':
            return { ...c, type: 'ellipse', x, y, w, h };
        case 'line':
            return {
                ...c,
                type: 'line',
                fill: 'none',
                x1: x,
                y1: y,
                x2: x + w,
                y2: y + h,
                startArrow: style.startArrow,
                endArrow: style.endArrow,
            };
        case 'arrow':
            return { ...c, type: 'arrow', fill: 'none', x1: x, y1: y, x2: x + w, y2: y + h };
        case 'elbow':
            return {
                ...c,
                type: 'line',
                fill: 'none',
                x1: x,
                y1: y,
                x2: x + w,
                y2: y + h,
                connector: 'elbow',
                startArrow: style.startArrow,
                endArrow: style.endArrow,
            };
        case 'curved':
            return {
                ...c,
                type: 'line',
                fill: 'none',
                x1: x,
                y1: y,
                x2: x + w,
                y2: y + h,
                connector: 'curved',
                startArrow: style.startArrow,
                endArrow: style.endArrow,
            };
        case 'callout':
            return {
                ...c,
                type: 'callout',
                x,
                y,
                w,
                h,
                rx: Math.min(w, h) * 0.12,
                tailX: x + w * 0.25,
                tailY: y + h + Math.max(24, h * 0.4),
            };
        case 'text':
            return {
                ...c,
                type: 'text',
                fill: style.stroke,
                stroke: 'none',
                x,
                y,
                w: Math.max(w, 40),
                h: Math.max(h, style.fontSize * 1.4),
                text: '',
                fontSize: style.fontSize,
                fontFamily: style.fontFamily,
                align: style.align,
                bold: style.bold,
                italic: style.italic,
            };
        default: {
            const kind = POLYGON_TOOLS[tool];
            if (kind) return { ...c, type: 'polygon', x, y, w, h, kind };
            return null;
        }
    }
}

export function createImageShape(
    style: StyleDefaults,
    box: Bounds,
    href: string,
): ImageShape {
    return { ...common(style), type: 'image', fill: 'none', stroke: 'none', x: box.x, y: box.y, w: box.w, h: box.h, href };
}

export function createPathShape(style: StyleDefaults, points: number[]): PathShape {
    return { ...common(style), type: 'path', fill: 'none', points };
}

/** Safely parse a serialized scene, falling back to an empty one. */
export function parseScene(json: string | Scene | null | undefined): Scene {
    if (!json) return emptyScene();
    try {
        const obj = typeof json === 'string' ? JSON.parse(json) : json;
        if (obj && Array.isArray(obj.shapes) && typeof obj.width === 'number') {
            return {
                width: obj.width,
                height: obj.height,
                background: obj.background ?? '#ffffff',
                shapes: obj.shapes,
            };
        }
    } catch {
        // fall through
    }
    return emptyScene();
}
