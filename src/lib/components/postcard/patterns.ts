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
 */

export interface PatternDef {
    id: string;
    /** Tile edge in SVG user units. */
    tile: number;
    /** SVG body drawn inside a `stroke`d group. */
    build: (tile: number) => string;
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

/** Two concentric squares, one rotated 45° — the classic khātim eight-point star. */
function star8(cx: number, cy: number, r: number): string {
    const d = 2 * r;
    return (
        `<rect x="${cx - r}" y="${cy - r}" width="${d}" height="${d}"/>` +
        `<rect x="${cx - r}" y="${cy - r}" width="${d}" height="${d}" transform="rotate(45 ${cx} ${cy})"/>`
    );
}

function polygon(cx: number, cy: number, r: number, sides: number, rot = 0): string {
    const pts: string[] = [];
    for (let i = 0; i < sides; i++) {
        const a = rot + (i * 2 * Math.PI) / sides;
        pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
    }
    return `<polygon points="${pts.join(" ")}"/>`;
}

function rosette(cx: number, cy: number, r: number, petals: number): string {
    let out = `<circle cx="${cx}" cy="${cy}" r="${r}"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.5).toFixed(2)}"/>`;
    for (let i = 0; i < petals; i++) {
        const a = (i * 2 * Math.PI) / petals;
        const x1 = cx + r * 0.5 * Math.cos(a);
        const y1 = cy + r * 0.5 * Math.sin(a);
        const x2 = cx + r * Math.cos(a);
        const y2 = cy + r * Math.sin(a);
        out += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`;
    }
    return out;
}

function quatrefoil(cx: number, cy: number, r: number): string {
    const o = r * 0.5;
    return (
        `<circle cx="${cx - o}" cy="${cy}" r="${o.toFixed(2)}"/>` +
        `<circle cx="${cx + o}" cy="${cy}" r="${o.toFixed(2)}"/>` +
        `<circle cx="${cx}" cy="${cy - o}" r="${o.toFixed(2)}"/>` +
        `<circle cx="${cx}" cy="${cy + o}" r="${o.toFixed(2)}"/>`
    );
}

export const PATTERNS: PatternDef[] = [
    {
        id: "star8",
        tile: 140,
        build: (tile) =>
            CORNERS(tile)
                .map(([cx, cy]) => star8(cx, cy, tile * 0.24))
                .join(""),
    },
    {
        id: "rosette",
        tile: 160,
        build: (tile) =>
            CORNERS(tile)
                .map(([cx, cy]) => rosette(cx, cy, tile * 0.26, 12))
                .join(""),
    },
    {
        id: "octagon",
        tile: 130,
        build: (tile) =>
            CORNERS(tile)
                .map(
                    ([cx, cy]) =>
                        polygon(cx, cy, tile * 0.28, 8, Math.PI / 8) +
                        polygon(cx, cy, tile * 0.16, 4, Math.PI / 4),
                )
                .join(""),
    },
    {
        id: "quatrefoil",
        tile: 120,
        build: (tile) =>
            CORNERS(tile)
                .map(([cx, cy]) => quatrefoil(cx, cy, tile * 0.3))
                .join(""),
    },
    {
        id: "girih",
        tile: 150,
        build: (tile) =>
            CORNERS(tile)
                .map(
                    ([cx, cy]) =>
                        polygon(cx, cy, tile * 0.3, 6, Math.PI / 6) +
                        polygon(cx, cy, tile * 0.3, 6, Math.PI / 6 + Math.PI / 6) +
                        polygon(cx, cy, tile * 0.14, 6, Math.PI / 6),
                )
                .join(""),
    },
    {
        id: "lattice",
        tile: 120,
        build: (tile) =>
            `<path d="M${tile / 2} 0 L${tile} ${tile / 2} L${tile / 2} ${tile} L0 ${tile / 2} Z"/>` +
            `<path d="M0 0 L${tile} ${tile}"/><path d="M${tile} 0 L0 ${tile}"/>` +
            `<circle cx="${tile / 2}" cy="${tile / 2}" r="${(tile * 0.14).toFixed(2)}"/>`,
    },
    {
        id: "chevron",
        tile: 120,
        build: (tile) => {
            const amp = tile / 8;
            const q = tile / 4;
            let out = "";
            for (let i = 0; i <= 4; i++) {
                const y = (i * tile) / 4;
                out += `<path d="M0 ${y} L${q} ${y - amp} L${tile / 2} ${y} L${3 * q} ${y - amp} L${tile} ${y}"/>`;
            }
            return out;
        },
    },
    {
        id: "crosshatch",
        tile: 120,
        build: (tile) => {
            const step = tile / 6;
            let out = "";
            for (let k = -tile; k <= tile * 2; k += step) {
                out += `<path d="M${k} 0 L${k + tile} ${tile}"/>`;
                out += `<path d="M${k} 0 L${k - tile} ${tile}"/>`;
            }
            return out;
        },
    },
    {
        id: "dots",
        tile: 90,
        filled: true,
        build: (tile) => {
            const pts: Array<[number, number]> = [
                ...CORNERS(tile),
                [tile / 2, 0],
                [tile / 2, tile],
                [0, tile / 2],
                [tile, tile / 2],
            ];
            return pts
                .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${(tile * 0.06).toFixed(2)}"/>`)
                .join("");
        },
    },
];

/**
 * Build a tile as an SVG data URL, ready for `createPattern`.
 *
 * `scale` grows the rendered tile without touching the geometry, so a pattern
 * stays crisp on a 1080px card at any density the user picks.
 */
export function patternDataUrl(
    def: PatternDef,
    color: string,
    strokeWidth: number,
    scale: number,
): string {
    const tile = def.tile;
    const size = Math.round(tile * scale);
    const paint = def.filled
        ? `fill="${color}" stroke="none"`
        : `fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"`;
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${tile} ${tile}">` +
        `<g ${paint}>${def.build(tile)}</g></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
