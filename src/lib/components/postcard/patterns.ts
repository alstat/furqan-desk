/**
 * Backgrounds for the Qur'an postcard editor.
 *
 * Two independent layers live here: repeating geometric tiles drawn in the
 * Islamic tradition, and the gradient overlays painted on top of whatever
 * background is in use.
 *
 * ## How a tile stays seamless
 *
 * Two constructions are used, and every pattern picks one:
 *
 * - **Motifs on the corner lattice.** `CORNERS` places a motif at the four
 *   corners *and* the centre of the square. Any motif symmetric about its own
 *   centre then tiles seamlessly at that spacing without per-pattern edge
 *   bookkeeping — the quarter drawn past one edge is exactly the quarter
 *   missing at the opposite one.
 * - **Rows and columns on a divisor grid.** Line fields (lattice, chevron,
 *   weave), arcades and vegetal scrolls repeat on a step that divides the tile
 *   an integer number of times, and are drawn one cell past each edge so the
 *   run continues across the seam. Where a motif alternates (a pinwheel
 *   rotation, an offset row) the alternation period also divides the tile.
 *
 * ## Layers
 *
 * A pattern is a list of `PatternLayer`s rather than a single path. The first
 * layer carries the motif at the user's line weight; the later ones add the
 * finer tracery — inner rings, struts, buds — at a fraction of that weight and
 * often at reduced alpha. That is what separates a drawing from a diagram:
 * real tilework is hierarchical, one bold armature with delicate infill.
 *
 * ## Why these are drawn, not SVG
 *
 * An earlier version emitted each tile as an SVG data URL and loaded it into an
 * `<img>`. That reads well but cannot be exported: WebKit — which backs the
 * webview Tauri uses on macOS — never marks an `SVGImage` as origin-clean,
 * because SVG can pull in external subresources. Drawing one onto a canvas
 * taints it, and every read-back from that canvas (`toBlob`, `toDataURL`,
 * `getImageData`) then throws `SecurityError`. Painting the tile with the
 * Canvas2D API instead keeps the card exportable, and the sidebar swatches are
 * generated from the very same tile so there is still one source of truth for
 * the geometry.
 */

/** Families the picker groups the swatches under. */
export const PATTERN_GROUPS = [
    "star",
    "tessellation",
    "screen",
    "vegetal",
    "texture",
] as const;

export type PatternGroup = (typeof PATTERN_GROUPS)[number];

export interface PatternLayer {
    /**
     * Append this layer's geometry to the context's current path. The caller
     * owns the styling and issues the single stroke or fill.
     */
    draw: (ctx: CanvasRenderingContext2D, tile: number) => void;
    /** Motif outlines read better stroked; dot fields need fill instead. */
    filled?: boolean;
    /** Multiplier on the user's line weight — tracery layers sit below 1. */
    weight?: number;
    /** Layer alpha, multiplied into the pattern opacity by the caller. */
    alpha?: number;
}

export interface PatternDef {
    id: string;
    group: PatternGroup;
    /** Tile edge, in the units the `draw` callbacks work in. */
    tile: number;
    layers: PatternLayer[];
}

const TAU = Math.PI * 2;

const CORNERS = (tile: number): Array<[number, number]> => [
    [0, 0],
    [tile, 0],
    [0, tile],
    [tile, tile],
    [tile / 2, tile / 2],
];

/** The four dual points of the corner lattice — where its motifs leave a hole. */
const INTERSTICES = (tile: number): Array<[number, number]> => [
    [tile / 4, tile / 4],
    [(3 * tile) / 4, tile / 4],
    [tile / 4, (3 * tile) / 4],
    [(3 * tile) / 4, (3 * tile) / 4],
];

/**
 * A square centred on (cx, cy), optionally rotated.
 *
 * Path points are baked through the transform as they are added, so restoring
 * the context afterwards leaves the geometry in place while resetting the CTM
 * for whatever is appended next.
 */
function square(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    rot = 0,
) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.rect(-r, -r, r * 2, r * 2);
    ctx.restore();
}

function circle(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
) {
    // `arc` joins from the current point, so open a fresh subpath first.
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, TAU);
}

function line(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
}

function polygon(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    sides: number,
    rot = 0,
) {
    for (let i = 0; i < sides; i++) {
        const a = rot + (i * TAU) / sides;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

/**
 * A star polygon: `points` outer vertices at `r` alternating with inner ones
 * at `rInner`. The inner ratios used below are the ones the classical
 * constructions give — cos(3π/n) / cos(π/n) for an {n/3} star.
 */
function starPoly(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    rInner: number,
    points: number,
    rot = 0,
) {
    for (let i = 0; i < points * 2; i++) {
        const rad = i % 2 === 0 ? r : rInner;
        const a = rot + (i * Math.PI) / points;
        const x = cx + rad * Math.cos(a);
        const y = cy + rad * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

/** The Greek cross that fills the void between stars in a star-and-cross field. */
function crossPoly(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    w: number,
    rot = 0,
) {
    const pts: Array<[number, number]> = [
        [-w, -r],
        [w, -r],
        [w, -w],
        [r, -w],
        [r, w],
        [w, w],
        [w, r],
        [-w, r],
        [-w, w],
        [-r, w],
        [-r, -w],
        [-w, -w],
    ];
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    pts.forEach(([x, y], i) => {
        const px = cx + x * cos - y * sin;
        const py = cy + x * sin + y * cos;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.closePath();
}

/** `n` spokes between two radii — the ribs of a rosette or the rays of a sun. */
function rays(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r0: number,
    r1: number,
    n: number,
    rot = 0,
) {
    for (let i = 0; i < n; i++) {
        const a = rot + (i * TAU) / n;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        line(ctx, cx + r0 * cos, cy + r0 * sin, cx + r1 * cos, cy + r1 * sin);
    }
}

/** `n` touching circles centred on a ring — the petal edge of a rosette. */
function petalRing(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    n: number,
    rot = 0,
) {
    const pr = r * Math.sin(Math.PI / n);
    for (let i = 0; i < n; i++) {
        const a = rot + (i * TAU) / n;
        circle(ctx, cx + r * Math.cos(a), cy + r * Math.sin(a), pr);
    }
}

/** Two concentric squares, one rotated 45° — the classic khātim eight-point star. */
function star8(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
) {
    square(ctx, cx, cy, r);
    square(ctx, cx, cy, r, Math.PI / 4);
}

function rosette(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    petals: number,
) {
    circle(ctx, cx, cy, r);
    circle(ctx, cx, cy, r * 0.5);
    rays(ctx, cx, cy, r * 0.5, r, petals);
}

function quatrefoil(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
) {
    const o = r * 0.5;
    circle(ctx, cx - o, cy, o);
    circle(ctx, cx + o, cy, o);
    circle(ctx, cx, cy - o, o);
    circle(ctx, cx, cy + o, o);
}

/**
 * One muqarnas cell: a pointed niche on its base line, the unit those vaults
 * are corbelled from. Tiers stack half a cell out of step, so each apex meets
 * the springing of the two cells above it.
 */
function niche(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
) {
    const base = y + h;
    line(ctx, x, base, x + w, base);
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x, y + h * 0.16, x + w / 2, y);
    ctx.quadraticCurveTo(x + w, y + h * 0.16, x + w, base);
}

/**
 * The onion cell of an ogival lattice: points at top and bottom, widest at the
 * waist, with the S-curve flanks that give the ogee its name.
 */
function ogeeCell(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    w: number,
    h: number,
) {
    const hw = w / 2;
    const hh = h / 2;
    ctx.moveTo(cx, cy - hh);
    ctx.bezierCurveTo(cx + hw * 0.2, cy - hh * 0.84, cx + hw, cy - hh * 0.56, cx + hw, cy);
    ctx.bezierCurveTo(cx + hw, cy + hh * 0.56, cx + hw * 0.2, cy + hh * 0.84, cx, cy + hh);
    ctx.bezierCurveTo(cx - hw * 0.2, cy + hh * 0.84, cx - hw, cy + hh * 0.56, cx - hw, cy);
    ctx.bezierCurveTo(cx - hw, cy - hh * 0.56, cx - hw * 0.2, cy - hh * 0.84, cx, cy - hh);
    ctx.closePath();
}

/**
 * One bay of an arcade: two jambs rising to a spring line, then the two curves
 * of a pointed arch meeting at the apex.
 */
function archBay(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    inset: number,
) {
    const left = x + inset;
    const right = x + w - inset;
    const mid = x + w / 2;
    const base = y + h;
    const spring = y + h * 0.62 + inset * 0.4;
    const apex = y + h * 0.06 + inset;
    line(ctx, left, base, left, spring);
    line(ctx, right, base, right, spring);
    ctx.moveTo(left, spring);
    ctx.quadraticCurveTo(left, apex + (spring - apex) * 0.18, mid, apex);
    ctx.quadraticCurveTo(right, apex + (spring - apex) * 0.18, right, spring);
}

/**
 * One period of the vegetal scroll: a stem that leaves and re-enters at the
 * same height with matching slope, so consecutive periods read as one vine.
 */
function vineRun(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    p: number,
    amp: number,
) {
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + p * 0.25, y - amp * 2, x + p * 0.5, y);
    ctx.quadraticCurveTo(x + p * 0.75, y + amp * 2, x + p, y);
}

export const PATTERNS: PatternDef[] = [
    // ── Stars ────────────────────────────────────────────────────────────────
    {
        id: "star8",
        group: "star",
        tile: 140,
        layers: [
            {
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t)) star8(ctx, cx, cy, t * 0.24);
                },
            },
            {
                weight: 0.5,
                alpha: 0.8,
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t))
                        polygon(ctx, cx, cy, t * 0.135, 8, Math.PI / 8);
                    for (const [cx, cy] of INTERSTICES(t))
                        square(ctx, cx, cy, t * 0.06, Math.PI / 4);
                },
            },
        ],
    },
    {
        id: "starcross",
        group: "star",
        tile: 150,
        layers: [
            {
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t))
                        starPoly(ctx, cx, cy, t * 0.26, t * 0.26 * 0.414, 8, -Math.PI / 8);
                    for (const [cx, cy] of INTERSTICES(t))
                        crossPoly(ctx, cx, cy, t * 0.13, t * 0.052, Math.PI / 4);
                },
            },
            {
                weight: 0.5,
                alpha: 0.75,
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t))
                        polygon(ctx, cx, cy, t * 0.1, 8, Math.PI / 8);
                },
            },
        ],
    },
    {
        id: "tenpoint",
        group: "star",
        tile: 160,
        layers: [
            {
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t))
                        starPoly(ctx, cx, cy, t * 0.28, t * 0.28 * 0.618, 10, -Math.PI / 2);
                },
            },
            {
                weight: 0.5,
                alpha: 0.8,
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t)) {
                        polygon(ctx, cx, cy, t * 0.115, 10, -Math.PI / 2);
                        rays(ctx, cx, cy, t * 0.115, t * 0.173, 10, -Math.PI / 2);
                    }
                },
            },
        ],
    },
    {
        id: "shamsa",
        group: "star",
        tile: 150,
        layers: [
            {
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t)) {
                        circle(ctx, cx, cy, t * 0.27);
                        circle(ctx, cx, cy, t * 0.155);
                        rays(ctx, cx, cy, t * 0.155, t * 0.27, 16);
                    }
                },
            },
            {
                weight: 0.5,
                alpha: 0.7,
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t)) {
                        circle(ctx, cx, cy, t * 0.08);
                        rays(ctx, cx, cy, t * 0.29, t * 0.335, 16, Math.PI / 16);
                    }
                },
            },
        ],
    },
    {
        id: "rosette",
        group: "star",
        tile: 160,
        layers: [
            {
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t)) rosette(ctx, cx, cy, t * 0.26, 12);
                },
            },
            {
                weight: 0.5,
                alpha: 0.75,
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t)) {
                        petalRing(ctx, cx, cy, t * 0.26, 12);
                        circle(ctx, cx, cy, t * 0.05);
                    }
                },
            },
        ],
    },

    // ── Tessellations ────────────────────────────────────────────────────────
    {
        id: "girih",
        group: "tessellation",
        tile: 150,
        layers: [
            {
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t)) {
                        // Two hexagons 30° apart read as a twelve-point girih star.
                        polygon(ctx, cx, cy, t * 0.3, 6, Math.PI / 6);
                        polygon(ctx, cx, cy, t * 0.3, 6, Math.PI / 3);
                        polygon(ctx, cx, cy, t * 0.14, 6, Math.PI / 6);
                    }
                },
            },
            {
                weight: 0.5,
                alpha: 0.75,
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t))
                        rays(ctx, cx, cy, t * 0.14, t * 0.26, 12, Math.PI / 6);
                },
            },
        ],
    },
    {
        id: "octagon",
        group: "tessellation",
        tile: 130,
        layers: [
            {
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t)) {
                        polygon(ctx, cx, cy, t * 0.28, 8, Math.PI / 8);
                        polygon(ctx, cx, cy, t * 0.16, 4, Math.PI / 4);
                    }
                },
            },
            {
                weight: 0.5,
                alpha: 0.8,
                draw: (ctx, t) => {
                    for (const [cx, cy] of INTERSTICES(t))
                        polygon(ctx, cx, cy, t * 0.085, 8, Math.PI / 8);
                },
            },
        ],
    },
    {
        id: "honeycomb",
        group: "tessellation",
        tile: 132,
        layers: [
            {
                draw: (ctx, t) => {
                    // Pointy-top hexagons on a two-by-two cell, stretched
                    // vertically so the hex rhythm lands exactly on the tile.
                    const s = t / (2 * Math.sqrt(3));
                    const stretch = t / (2 * 1.5 * s);
                    ctx.save();
                    ctx.scale(1, stretch);
                    for (let j = -1; j <= 3; j++) {
                        for (let i = -1; i <= 3; i++) {
                            const cx = i * Math.sqrt(3) * s + (j % 2 ? (Math.sqrt(3) * s) / 2 : 0);
                            polygon(ctx, cx, j * 1.5 * s, s, 6, Math.PI / 2);
                        }
                    }
                    ctx.restore();
                },
            },
            {
                weight: 0.5,
                alpha: 0.65,
                draw: (ctx, t) => {
                    const s = t / (2 * Math.sqrt(3));
                    const stretch = t / (2 * 1.5 * s);
                    ctx.save();
                    ctx.scale(1, stretch);
                    for (let j = -1; j <= 3; j++) {
                        for (let i = -1; i <= 3; i++) {
                            const cx = i * Math.sqrt(3) * s + (j % 2 ? (Math.sqrt(3) * s) / 2 : 0);
                            polygon(ctx, cx, j * 1.5 * s, s * 0.42, 6, Math.PI / 2);
                        }
                    }
                    ctx.restore();
                },
            },
        ],
    },

    {
        id: "muqarnas",
        group: "tessellation",
        tile: 132,
        layers: [
            {
                draw: (ctx, t) => {
                    const w = t / 4;
                    const h = t / 6;
                    for (let j = -1; j <= 6; j++) {
                        const off = (((j % 2) + 2) % 2 ? w / 2 : 0) - w;
                        for (let i = 0; i <= 5; i++)
                            niche(ctx, i * w + off, j * h, w, h);
                    }
                },
            },
            {
                weight: 0.5,
                alpha: 0.7,
                draw: (ctx, t) => {
                    const w = t / 4;
                    const h = t / 6;
                    const ix = w * 0.22;
                    const iy = h * 0.26;
                    for (let j = -1; j <= 6; j++) {
                        const off = (((j % 2) + 2) % 2 ? w / 2 : 0) - w;
                        for (let i = 0; i <= 5; i++) {
                            const x = i * w + off + ix;
                            const y = j * h + iy;
                            ctx.moveTo(x, j * h + h);
                            ctx.quadraticCurveTo(
                                x,
                                y + (h - iy) * 0.32,
                                x + (w - ix * 2) / 2,
                                y,
                            );
                            ctx.quadraticCurveTo(
                                x + (w - ix * 2),
                                y + (h - iy) * 0.32,
                                x + (w - ix * 2),
                                j * h + h,
                            );
                        }
                    }
                },
            },
        ],
    },

    // ── Screens ──────────────────────────────────────────────────────────────
    {
        id: "lattice",
        group: "screen",
        tile: 120,
        layers: [
            {
                draw: (ctx, t) => {
                    ctx.moveTo(t / 2, 0);
                    ctx.lineTo(t, t / 2);
                    ctx.lineTo(t / 2, t);
                    ctx.lineTo(0, t / 2);
                    ctx.closePath();
                    line(ctx, 0, 0, t, t);
                    line(ctx, t, 0, 0, t);
                    circle(ctx, t / 2, t / 2, t * 0.14);
                },
            },
            {
                weight: 0.5,
                alpha: 0.75,
                draw: (ctx, t) => {
                    square(ctx, t / 2, t / 2, t * 0.22, Math.PI / 4);
                    for (const [cx, cy] of CORNERS(t).slice(0, 4))
                        circle(ctx, cx, cy, t * 0.07);
                },
            },
        ],
    },
    {
        id: "mashrabiya",
        group: "screen",
        tile: 140,
        layers: [
            {
                draw: (ctx, t) => {
                    // Overlapping circles on a half-tile grid: the turned-wood
                    // screen, where every pair of circles cuts a pointed oval.
                    const p = t / 2;
                    for (let j = -1; j <= 3; j++)
                        for (let i = -1; i <= 3; i++)
                            circle(ctx, i * p, j * p, t * 0.35);
                },
            },
            {
                weight: 0.5,
                alpha: 0.8,
                draw: (ctx, t) => {
                    const p = t / 2;
                    for (let j = -1; j <= 3; j++)
                        for (let i = -1; i <= 3; i++)
                            circle(ctx, i * p, j * p, t * 0.07);
                },
            },
        ],
    },
    {
        id: "ogee",
        group: "screen",
        tile: 160,
        layers: [
            {
                draw: (ctx, t) => {
                    const p = t / 2;
                    for (let j = -1; j <= 2; j++)
                        for (let i = -1; i <= 3; i++)
                            ogeeCell(
                                ctx,
                                i * p + (((j % 2) + 2) % 2 ? p / 2 : 0),
                                j * p + p / 2,
                                p,
                                p,
                            );
                },
            },
            {
                weight: 0.5,
                alpha: 0.7,
                draw: (ctx, t) => {
                    const p = t / 2;
                    for (let j = -1; j <= 2; j++)
                        for (let i = -1; i <= 3; i++)
                            ogeeCell(
                                ctx,
                                i * p + (((j % 2) + 2) % 2 ? p / 2 : 0),
                                j * p + p / 2,
                                p * 0.42,
                                p * 0.42,
                            );
                },
            },
        ],
    },
    {
        id: "arches",
        group: "screen",
        tile: 150,
        layers: [
            {
                draw: (ctx, t) => {
                    const p = t / 2;
                    for (let j = -1; j <= 2; j++)
                        for (let i = -1; i <= 2; i++) archBay(ctx, i * p, j * p, p, p, 0);
                },
            },
            {
                weight: 0.5,
                alpha: 0.7,
                draw: (ctx, t) => {
                    const p = t / 2;
                    for (let j = -1; j <= 2; j++)
                        for (let i = -1; i <= 2; i++)
                            archBay(ctx, i * p, j * p, p, p, p * 0.13);
                },
            },
        ],
    },
    {
        id: "quatrefoil",
        group: "screen",
        tile: 120,
        layers: [
            {
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t)) quatrefoil(ctx, cx, cy, t * 0.3);
                },
            },
            {
                weight: 0.5,
                alpha: 0.8,
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t)) {
                        square(ctx, cx, cy, t * 0.15, Math.PI / 4);
                        circle(ctx, cx, cy, t * 0.05);
                    }
                },
            },
        ],
    },

    // ── Vegetal ──────────────────────────────────────────────────────────────
    {
        id: "arabesque",
        group: "vegetal",
        tile: 140,
        layers: [
            {
                draw: (ctx, t) => {
                    const p = t / 2;
                    const amp = t * 0.075;
                    for (let j = -1; j <= 2; j++) {
                        const y = j * p + p / 2;
                        const off = (((j % 2) + 2) % 2 ? p / 2 : 0) - p;
                        for (let i = 0; i <= 3; i++) vineRun(ctx, i * p + off, y, p, amp);
                    }
                },
            },
            {
                weight: 0.5,
                alpha: 0.6,
                draw: (ctx, t) => {
                    // A counter-vine half a period out of phase: the two stems
                    // cross twice each run and enclose the leaf-shaped voids
                    // that islimi scrollwork is built from.
                    const p = t / 2;
                    const amp = t * 0.075;
                    for (let j = -1; j <= 2; j++) {
                        const y = j * p + p / 2;
                        const off = (((j % 2) + 2) % 2 ? p / 2 : 0) - p / 2;
                        for (let i = -1; i <= 3; i++) vineRun(ctx, i * p + off, y, p, amp);
                    }
                },
            },
            {
                weight: 0.5,
                alpha: 0.85,
                draw: (ctx, t) => {
                    const p = t / 2;
                    const amp = t * 0.075;
                    for (let j = -1; j <= 2; j++) {
                        const y = j * p + p / 2;
                        const off = (((j % 2) + 2) % 2 ? p / 2 : 0) - p;
                        for (let i = 0; i <= 3; i++) {
                            const x = i * p + off;
                            // A bud at each crest and trough, on the outside of
                            // the curl, the way an islimi leaf sits on its stem.
                            circle(ctx, x + p * 0.25, y - amp - t * 0.03, t * 0.03);
                            circle(ctx, x + p * 0.75, y + amp + t * 0.03, t * 0.03);
                        }
                    }
                },
            },
        ],
    },
    {
        id: "scallop",
        group: "vegetal",
        tile: 128,
        layers: [
            {
                draw: (ctx, t) => {
                    const r = t / 4;
                    for (let j = -1; j <= 5; j++)
                        for (let i = -1; i <= 3; i++) {
                            const cx = i * 2 * r + (((j % 2) + 2) % 2 ? r : 0);
                            const cy = j * r;
                            ctx.moveTo(cx - r, cy);
                            ctx.arc(cx, cy, r, Math.PI, TAU);
                        }
                },
            },
            {
                weight: 0.5,
                alpha: 0.65,
                draw: (ctx, t) => {
                    const r = t / 4;
                    for (let j = -1; j <= 5; j++)
                        for (let i = -1; i <= 3; i++) {
                            const cx = i * 2 * r + (((j % 2) + 2) % 2 ? r : 0);
                            const cy = j * r;
                            ctx.moveTo(cx - r * 0.55, cy);
                            ctx.arc(cx, cy, r * 0.55, Math.PI, TAU);
                        }
                },
            },
        ],
    },

    // ── Textures ─────────────────────────────────────────────────────────────
    {
        id: "chevron",
        group: "texture",
        tile: 120,
        layers: [
            {
                draw: (ctx, t) => {
                    const amp = t / 8;
                    const q = t / 4;
                    for (let i = 0; i <= 4; i++) {
                        const y = (i * t) / 4;
                        ctx.moveTo(0, y);
                        ctx.lineTo(q, y - amp);
                        ctx.lineTo(t / 2, y);
                        ctx.lineTo(3 * q, y - amp);
                        ctx.lineTo(t, y);
                    }
                },
            },
            {
                weight: 0.45,
                alpha: 0.6,
                draw: (ctx, t) => {
                    const amp = t / 8;
                    const q = t / 4;
                    for (let i = -1; i <= 4; i++) {
                        const y = (i * t) / 4 + t / 8;
                        ctx.moveTo(0, y);
                        ctx.lineTo(q, y - amp);
                        ctx.lineTo(t / 2, y);
                        ctx.lineTo(3 * q, y - amp);
                        ctx.lineTo(t, y);
                    }
                },
            },
        ],
    },
    {
        id: "crosshatch",
        group: "texture",
        tile: 120,
        layers: [
            {
                draw: (ctx, t) => {
                    const step = t / 6;
                    for (let k = -t; k <= t * 2; k += step) {
                        line(ctx, k, 0, k + t, t);
                        line(ctx, k, 0, k - t, t);
                    }
                },
            },
            {
                weight: 0.4,
                alpha: 0.4,
                draw: (ctx, t) => {
                    const step = t / 6;
                    for (let k = -t + step / 2; k <= t * 2; k += step) {
                        line(ctx, k, 0, k + t, t);
                        line(ctx, k, 0, k - t, t);
                    }
                },
            },
        ],
    },
    {
        id: "weave",
        group: "texture",
        tile: 128,
        layers: [
            {
                draw: (ctx, t) => {
                    // Strapwork: at every crossing one band runs over and the
                    // other breaks, so the field reads as woven rather than
                    // gridded. Parity has period two, the tile holds four cells.
                    const p = t / 4;
                    const w = p * 0.3;
                    const gap = w * 1.6;
                    for (let i = -1; i <= 4; i++) {
                        const yc = i * p + p / 2;
                        for (let j = -1; j <= 4; j++) {
                            const x0 = j * p;
                            const xc = x0 + p / 2;
                            const over = (((i + j) % 2) + 2) % 2 === 0;
                            for (const y of [yc - w, yc + w]) {
                                if (over) {
                                    line(ctx, x0, y, x0 + p, y);
                                } else {
                                    line(ctx, x0, y, xc - gap, y);
                                    line(ctx, xc + gap, y, x0 + p, y);
                                }
                            }
                        }
                    }
                    for (let j = -1; j <= 4; j++) {
                        const xc = j * p + p / 2;
                        for (let i = -1; i <= 4; i++) {
                            const y0 = i * p;
                            const yc = y0 + p / 2;
                            const over = (((i + j) % 2) + 2) % 2 === 1;
                            for (const x of [xc - w, xc + w]) {
                                if (over) {
                                    line(ctx, x, y0, x, y0 + p);
                                } else {
                                    line(ctx, x, y0, x, yc - gap);
                                    line(ctx, x, yc + gap, x, y0 + p);
                                }
                            }
                        }
                    }
                },
            },
        ],
    },
    {
        id: "kufic",
        group: "texture",
        tile: 120,
        layers: [
            {
                draw: (ctx, t) => {
                    // Banna'i brickwork: one stepped glyph, pinwheeled through
                    // four orientations across a two-by-two cell.
                    const p = t / 2;
                    for (let j = 0; j <= 1; j++)
                        for (let i = 0; i <= 1; i++) {
                            ctx.save();
                            ctx.translate(i * p + p / 2, j * p + p / 2);
                            ctx.rotate(((i * 2 + j) * Math.PI) / 2);
                            const u = p / 2;
                            ctx.moveTo(-u * 0.64, -u * 0.64);
                            ctx.lineTo(u * 0.64, -u * 0.64);
                            ctx.lineTo(u * 0.64, 0);
                            ctx.lineTo(0, 0);
                            ctx.lineTo(0, u * 0.64);
                            ctx.lineTo(-u * 0.64, u * 0.64);
                            ctx.closePath();
                            ctx.restore();
                        }
                },
            },
            {
                weight: 0.5,
                alpha: 0.7,
                draw: (ctx, t) => {
                    const p = t / 2;
                    for (let j = 0; j <= 1; j++)
                        for (let i = 0; i <= 1; i++) {
                            ctx.save();
                            ctx.translate(i * p + p / 2, j * p + p / 2);
                            ctx.rotate(((i * 2 + j) * Math.PI) / 2);
                            const u = p / 2;
                            ctx.rect(u * 0.16, u * 0.16, u * 0.32, u * 0.32);
                            ctx.restore();
                        }
                },
            },
        ],
    },
    {
        id: "dots",
        group: "texture",
        tile: 90,
        layers: [
            {
                filled: true,
                draw: (ctx, t) => {
                    for (const [cx, cy] of CORNERS(t)) circle(ctx, cx, cy, t * 0.06);
                },
            },
            {
                filled: true,
                alpha: 0.55,
                draw: (ctx, t) => {
                    const pts: Array<[number, number]> = [
                        [t / 2, 0],
                        [t / 2, t],
                        [0, t / 2],
                        [t, t / 2],
                    ];
                    for (const [cx, cy] of pts) circle(ctx, cx, cy, t * 0.032);
                },
            },
        ],
    },
];

/** The line weight the sidebar swatches draw at — dot fields need a thin one. */
export function swatchWeight(def: PatternDef): number {
    return def.layers.every((l) => l.filled) ? 1 : 3;
}

/**
 * Paint one tile onto its own canvas, ready for `createPattern`.
 *
 * `scale` grows the rendered tile without touching the geometry, so a pattern
 * stays crisp on a 1080px card at any density the user picks. Motifs that run
 * past the tile edge are clipped by the canvas bounds and completed by the
 * neighbouring tile, which is what makes the repeat seamless.
 */
export function patternTile(
    def: PatternDef,
    color: string,
    strokeWidth: number,
    scale: number,
): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    const size = Math.max(1, Math.round(def.tile * scale));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.scale(size / def.tile, size / def.tile);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const layer of def.layers) {
        ctx.beginPath();
        layer.draw(ctx, def.tile);
        ctx.globalAlpha = layer.alpha ?? 1;
        if (layer.filled) {
            ctx.fillStyle = color;
            ctx.fill();
        } else {
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(0.15, strokeWidth * (layer.weight ?? 1));
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
    return canvas;
}

/**
 * The same tile as a data URL, for the CSS-backed swatches in the sidebar.
 * Memoized because the swatch grid re-reads every pattern on each colour tweak.
 */
const previewCache = new Map<string, string>();

export function patternPreviewUrl(
    def: PatternDef,
    color: string,
    strokeWidth: number,
    scale: number,
): string {
    const key = `${def.id}|${color}|${strokeWidth}|${scale}`;
    const hit = previewCache.get(key);
    if (hit) return hit;
    const tile = patternTile(def, color, strokeWidth, scale);
    if (!tile) return "";
    const url = tile.toDataURL();
    previewCache.set(key, url);
    return url;
}

/**
 * Frames for the card edge.
 *
 * `hairline` is the original — a rule broken at the corners with a pair of
 * nested diamonds sitting in each break — and stays the default so cards saved
 * before the others existed look exactly as they did. The rest trade that
 * ornament for a different register: a bare rule, a doubled one, brackets that
 * leave the edges open, a khātim star at each corner, or a beaded inner line.
 */
export const FRAME_STYLES = [
    "none",
    "hairline",
    "keyline",
    "double",
    "corners",
    "khatim",
    "beaded",
] as const;

export type FrameStyle = (typeof FRAME_STYLES)[number];

/** Rules that stop short of each corner, leaving room for a corner motif. */
function frameRules(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    gap: number,
) {
    ctx.beginPath();
    line(ctx, x0 + gap, y0, x1 - gap, y0);
    line(ctx, x1, y0 + gap, x1, y1 - gap);
    line(ctx, x1 - gap, y1, x0 + gap, y1);
    line(ctx, x0, y1 - gap, x0, y0 + gap);
    ctx.stroke();
}

function frameRect(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
) {
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.stroke();
}

const FRAME_CORNERS = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
): Array<[number, number, number, number]> => [
    // x, y, and the unit direction the corner's arms run in
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x1, y1, -1, -1],
    [x0, y1, 1, -1],
];

/**
 * Draw one card frame between (x0,y0) and (x1,y1). `r` is the size the corner
 * ornament is allowed to occupy — the caller derives it from the card's
 * margins so the motifs never crowd the edge between them.
 */
export function drawCardFrame(
    ctx: CanvasRenderingContext2D,
    style: FrameStyle,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    lineWidth: number,
    color: string,
    r: number,
) {
    if (style === "none") return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";

    switch (style) {
        case "hairline": {
            frameRules(ctx, x0, y0, x1, y1, r);
            for (const [cx, cy] of FRAME_CORNERS(x0, y0, x1, y1)) {
                for (const rr of [r, r * 0.5]) {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy - rr);
                    ctx.lineTo(cx + rr, cy);
                    ctx.lineTo(cx, cy + rr);
                    ctx.lineTo(cx - rr, cy);
                    ctx.closePath();
                    ctx.stroke();
                }
            }
            break;
        }
        case "keyline": {
            frameRect(ctx, x0, y0, x1, y1);
            break;
        }
        case "double": {
            frameRect(ctx, x0, y0, x1, y1);
            const g = r * 0.55;
            ctx.lineWidth = Math.max(0.8, lineWidth * 0.6);
            frameRect(ctx, x0 + g, y0 + g, x1 - g, y1 - g);
            break;
        }
        case "corners": {
            // Brackets only: the edges stay open, which lets a busy pattern
            // run to the trim without a rule cutting across it.
            const arm = Math.min((x1 - x0) * 0.12, (y1 - y0) * 0.09);
            ctx.lineCap = "round";
            ctx.beginPath();
            for (const [cx, cy, sx, sy] of FRAME_CORNERS(x0, y0, x1, y1)) {
                line(ctx, cx, cy, cx + arm * sx, cy);
                line(ctx, cx, cy, cx, cy + arm * sy);
            }
            ctx.stroke();
            break;
        }
        case "khatim": {
            frameRules(ctx, x0, y0, x1, y1, r * 1.15);
            for (const [cx, cy] of FRAME_CORNERS(x0, y0, x1, y1)) {
                ctx.beginPath();
                square(ctx, cx, cy, r * 0.62);
                square(ctx, cx, cy, r * 0.62, Math.PI / 4);
                ctx.stroke();
                ctx.beginPath();
                polygon(ctx, cx, cy, r * 0.3, 8, Math.PI / 8);
                ctx.stroke();
            }
            break;
        }
        case "beaded": {
            frameRect(ctx, x0, y0, x1, y1);
            const g = r * 0.62;
            const bx0 = x0 + g;
            const by0 = y0 + g;
            const bx1 = x1 - g;
            const by1 = y1 - g;
            const dot = Math.max(1, lineWidth * 1.1);
            // Space the beads so a whole number of them fits each edge and one
            // lands on every corner — an uneven run reads as a mistake.
            const step = r * 1.35;
            const cols = Math.max(2, Math.round((bx1 - bx0) / step));
            const rows = Math.max(2, Math.round((by1 - by0) / step));
            ctx.beginPath();
            for (let i = 0; i <= cols; i++) {
                const x = bx0 + ((bx1 - bx0) * i) / cols;
                circle(ctx, x, by0, dot);
                circle(ctx, x, by1, dot);
            }
            for (let j = 1; j < rows; j++) {
                const y = by0 + ((by1 - by0) * j) / rows;
                circle(ctx, bx0, y, dot);
                circle(ctx, bx1, y, dot);
            }
            ctx.fill();
            break;
        }
    }
    ctx.restore();
}

/**
 * A frame drawn on its own canvas, for the picker swatches. Memoized like the
 * pattern previews — the row re-reads every style on each colour tweak.
 */
const framePreviewCache = new Map<string, string>();

export function framePreviewUrl(
    style: FrameStyle,
    w: number,
    h: number,
    color: string,
    background: string,
): string {
    if (typeof document === "undefined") return "";
    const key = `${style}|${w}|${h}|${color}|${background}`;
    const hit = framePreviewCache.get(key);
    if (hit) return hit;
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.scale(2, 2);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    const inset = Math.min(w, h) * 0.13;
    drawCardFrame(
        ctx,
        style,
        inset,
        inset,
        w - inset,
        h - inset,
        1,
        color,
        Math.min(w, h) * 0.1,
    );
    const url = canvas.toDataURL();
    framePreviewCache.set(key, url);
    return url;
}

export interface GradientDef {
    id: string;
    stops: string[];
}

export const GRADIENTS: GradientDef[] = [
    { id: "none", stops: [] },
    { id: "emerald", stops: ["#0f4d3f", "#06251f"] },
    { id: "midnight", stops: ["#1e293b", "#020617"] },
    { id: "teal", stops: ["#3c8c8c", "#0b2733"] },
    { id: "sand", stops: ["#e8dcc8", "#9a7a40"] },
    { id: "gold", stops: ["#f3e5c0", "#b89558"] },
    { id: "dusk", stops: ["#6b3f2a", "#c8a96a"] },
    { id: "plum", stops: ["#3b1e54", "#150c22"] },
    { id: "rose", stops: ["#7f3b52", "#2b1b28"] },
    { id: "ocean", stops: ["#0f2027", "#2c5364"] },
    { id: "dawn", stops: ["#f9d976", "#f39f86"] },
    { id: "ink", stops: ["#3a3a3a", "#000000"] },
    { id: "fade-dark", stops: ["rgba(0,0,0,0)", "rgba(0,0,0,0.95)"] },
    { id: "fade-light", stops: ["rgba(255,255,255,0)", "rgba(255,255,255,0.95)"] },
];

export const GRADIENT_DIRECTIONS = [
    "to-bottom",
    "to-top",
    "to-right",
    "diagonal",
    "radial",
] as const;

export type GradientDirection = (typeof GRADIENT_DIRECTIONS)[number];

export const BLEND_MODES = [
    "normal",
    "multiply",
    "overlay",
    "soft-light",
    "screen",
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

export interface CardSize {
    id: string;
    w: number;
    h: number;
}

export const CARD_SIZES: CardSize[] = [
    { id: "square", w: 1080, h: 1080 },
    { id: "portrait", w: 1080, h: 1350 },
    { id: "story", w: 1080, h: 1920 },
    { id: "landscape", w: 1920, h: 1080 },
];
