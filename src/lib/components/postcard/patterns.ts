/**
 * Backgrounds for the Qur'an postcard editor.
 *
 * Two independent layers live here: repeating geometric tiles drawn in the
 * Islamic tradition, and the gradient overlays painted on top of whatever
 * background is in use.
 *
 * Every tile is built from motifs placed at the four corners *and* the centre
 * of a square. Any motif that is symmetric about its own centre then tiles
 * seamlessly at that spacing without needing per-pattern edge bookkeeping —
 * the quarter drawn past one edge is exactly the quarter missing at the
 * opposite one. Patterns that are line grids rather than motifs (lattice,
 * chevron, crosshatch) keep their spacing an integer division of the tile for
 * the same reason.
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

export interface PatternDef {
    id: string;
    /** Tile edge, in the units the `draw` callback works in. */
    tile: number;
    /**
     * Append this tile's geometry to the context's current path. The caller
     * owns the styling and issues the single stroke or fill.
     */
    draw: (ctx: CanvasRenderingContext2D, tile: number) => void;
    /** Motif patterns read better stroked; dot fields need fill instead. */
    filled?: boolean;
}

const CORNERS = (tile: number): Array<[number, number]> => [
    [0, 0],
    [tile, 0],
    [0, tile],
    [tile, tile],
    [tile / 2, tile / 2],
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
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
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
        const a = rot + (i * 2 * Math.PI) / sides;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
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
    for (let i = 0; i < petals; i++) {
        const a = (i * 2 * Math.PI) / petals;
        line(
            ctx,
            cx + r * 0.5 * Math.cos(a),
            cy + r * 0.5 * Math.sin(a),
            cx + r * Math.cos(a),
            cy + r * Math.sin(a),
        );
    }
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

export const PATTERNS: PatternDef[] = [
    {
        id: "star8",
        tile: 140,
        draw: (ctx, tile) => {
            for (const [cx, cy] of CORNERS(tile)) star8(ctx, cx, cy, tile * 0.24);
        },
    },
    {
        id: "rosette",
        tile: 160,
        draw: (ctx, tile) => {
            for (const [cx, cy] of CORNERS(tile))
                rosette(ctx, cx, cy, tile * 0.26, 12);
        },
    },
    {
        id: "octagon",
        tile: 130,
        draw: (ctx, tile) => {
            for (const [cx, cy] of CORNERS(tile)) {
                polygon(ctx, cx, cy, tile * 0.28, 8, Math.PI / 8);
                polygon(ctx, cx, cy, tile * 0.16, 4, Math.PI / 4);
            }
        },
    },
    {
        id: "quatrefoil",
        tile: 120,
        draw: (ctx, tile) => {
            for (const [cx, cy] of CORNERS(tile))
                quatrefoil(ctx, cx, cy, tile * 0.3);
        },
    },
    {
        id: "girih",
        tile: 150,
        draw: (ctx, tile) => {
            for (const [cx, cy] of CORNERS(tile)) {
                // Two hexagons 30° apart read as a twelve-point girih star.
                polygon(ctx, cx, cy, tile * 0.3, 6, Math.PI / 6);
                polygon(ctx, cx, cy, tile * 0.3, 6, Math.PI / 3);
                polygon(ctx, cx, cy, tile * 0.14, 6, Math.PI / 6);
            }
        },
    },
    {
        id: "lattice",
        tile: 120,
        draw: (ctx, tile) => {
            ctx.moveTo(tile / 2, 0);
            ctx.lineTo(tile, tile / 2);
            ctx.lineTo(tile / 2, tile);
            ctx.lineTo(0, tile / 2);
            ctx.closePath();
            line(ctx, 0, 0, tile, tile);
            line(ctx, tile, 0, 0, tile);
            circle(ctx, tile / 2, tile / 2, tile * 0.14);
        },
    },
    {
        id: "chevron",
        tile: 120,
        draw: (ctx, tile) => {
            const amp = tile / 8;
            const q = tile / 4;
            for (let i = 0; i <= 4; i++) {
                const y = (i * tile) / 4;
                ctx.moveTo(0, y);
                ctx.lineTo(q, y - amp);
                ctx.lineTo(tile / 2, y);
                ctx.lineTo(3 * q, y - amp);
                ctx.lineTo(tile, y);
            }
        },
    },
    {
        id: "crosshatch",
        tile: 120,
        draw: (ctx, tile) => {
            const step = tile / 6;
            for (let k = -tile; k <= tile * 2; k += step) {
                line(ctx, k, 0, k + tile, tile);
                line(ctx, k, 0, k - tile, tile);
            }
        },
    },
    {
        id: "dots",
        tile: 90,
        filled: true,
        draw: (ctx, tile) => {
            const pts: Array<[number, number]> = [
                ...CORNERS(tile),
                [tile / 2, 0],
                [tile / 2, tile],
                [0, tile / 2],
                [tile, tile / 2],
            ];
            for (const [cx, cy] of pts) circle(ctx, cx, cy, tile * 0.06);
        },
    },
];

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
    ctx.beginPath();
    def.draw(ctx, def.tile);
    if (def.filled) {
        ctx.fillStyle = color;
        ctx.fill();
    } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
    }
    return canvas;
}

/**
 * The same tile as a data URL, for the CSS-backed swatches in the sidebar.
 * Memoized because the swatch grid re-reads all nine on every colour tweak.
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
