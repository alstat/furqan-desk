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
}

export interface ArrowShape extends CommonProps {
    type: 'arrow';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    startRef?: Connection | null;
    endRef?: Connection | null;
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
    if (dash === 'dot') return `${sw},${sw * 2}`;
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
            body = `<line x1="${round(shape.x1)}" y1="${round(shape.y1)}" x2="${round(
                shape.x2,
            )}" y2="${round(shape.y2)}" ${strokeAttrs(shape)} stroke-linecap="round" />`;
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
};

export type DrawTool =
    | 'select'
    | 'pan'
    | 'rect'
    | 'roundRect'
    | 'ellipse'
    | 'line'
    | 'arrow'
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
            return { ...c, type: 'line', fill: 'none', x1: x, y1: y, x2: x + w, y2: y + h };
        case 'arrow':
            return { ...c, type: 'arrow', fill: 'none', x1: x, y1: y, x2: x + w, y2: y + h };
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
