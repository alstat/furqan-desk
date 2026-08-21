/**
 * The postcard renderer.
 *
 * Kept apart from the editor component so that the drawing is a pure function
 * of its options — the preview and the exported file run this exact code, and
 * it can be exercised without a Tauri backend behind it.
 *
 * Layers are painted bottom-up: base colour, background (manuscript scan or
 * geometric tile), gradient overlay, text, hairline frame, then the signature
 * strip.
 */

import type { BlendMode, GradientDirection } from "./patterns";

export interface ShadowOptions {
    on: boolean;
    blur: number;
    dx: number;
    dy: number;
    /** `#rrggbb`. */
    color: string;
    /** 0–100. */
    opacity: number;
}

export interface PostcardOptions {
    width: number;
    height: number;

    arabicText: string;
    translationText: string;
    referenceText: string;

    arabicFont: string;
    arabicSize: number;
    arabicLine: number;
    arabicColor: string;

    transFont: string;
    transSize: number;
    transLine: number;
    transColor: string;

    refSize: number;
    refColor: string;
    refRtl: boolean;

    textAlign: "left" | "center" | "right";
    /** 0 = flush to the top margin, 100 = flush to the bottom. */
    vAlign: number;
    autoFit: boolean;
    shadow: ShadowOptions;

    /** Margin as a percentage of the card's shorter edge. */
    padPct: number;
    borderOn: boolean;
    signatureText: string;
    /** The AyahLab mark; falls back to a drawn star while it is still loading. */
    signatureIcon: CanvasImageSource | null;
    /** Rendered bottom-right; pass null when the background needs no credit. */
    creditText: string | null;

    baseColor: string;
    /** `combo` lays the geometric tile over the manuscript scan. */
    bgMode: "plain" | "manuscript" | "pattern" | "combo";

    bgImage: CanvasImageSource | null;
    bgImageWidth: number;
    bgImageHeight: number;
    bgOpacity: number;
    /** 100 = cover exactly. */
    bgZoom: number;
    /** Percentage of the card's width / height. */
    bgOffsetX: number;
    bgOffsetY: number;
    bgBlur: number;
    bgGray: boolean;

    patternImage: CanvasImageSource | null;
    patternOpacity: number;

    gradientStops: string[];
    gradientDir: GradientDirection;
    gradientOpacity: number;
    gradientBlend: BlendMode;
}

export function hexToRgba(hex: string, alpha: number): string {
    const h = hex.replace("#", "");
    const full =
        h.length === 3
            ? h
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : h;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return `rgba(0, 0, 0, ${alpha})`;
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function fontSpec(size: number, family: string, weight = "400"): string {
    return `${weight} ${size}px "${family}", serif`;
}

/** Greedy word wrap against the current `ctx.font`. */
export function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (!cur || ctx.measureText(test).width <= maxWidth) {
            cur = test;
        } else {
            lines.push(cur);
            cur = w;
        }
    }
    if (cur) lines.push(cur);
    return lines;
}

interface Block {
    lines: string[];
    size: number;
    line: number;
    color: string;
    font: string;
    rtl: boolean;
    gapAfter: number;
}

function buildBlocks(
    ctx: CanvasRenderingContext2D,
    o: PostcardOptions,
    maxWidth: number,
    scale: number,
): { blocks: Block[]; total: number } {
    const blocks: Block[] = [];

    if (o.arabicText) {
        const size = o.arabicSize * scale;
        const font = fontSpec(size, o.arabicFont);
        ctx.font = font;
        ctx.direction = "rtl";
        blocks.push({
            lines: wrapText(ctx, o.arabicText, maxWidth),
            size,
            line: o.arabicLine,
            color: o.arabicColor,
            font,
            rtl: true,
            gapAfter: size * 0.55,
        });
    }

    if (o.translationText) {
        const size = o.transSize * scale;
        const font = fontSpec(size, o.transFont);
        ctx.font = font;
        ctx.direction = "ltr";
        blocks.push({
            lines: wrapText(ctx, o.translationText, maxWidth * 0.92),
            size,
            line: o.transLine,
            color: o.transColor,
            font,
            rtl: false,
            gapAfter: size * 1.1,
        });
    }

    if (o.referenceText) {
        const size = o.refSize * scale;
        const font = fontSpec(
            size,
            o.refRtl ? o.arabicFont : o.transFont,
            "600",
        );
        ctx.font = font;
        ctx.direction = o.refRtl ? "rtl" : "ltr";
        blocks.push({
            lines: [o.referenceText],
            size,
            line: 1.4,
            color: o.refColor,
            font,
            rtl: o.refRtl,
            gapAfter: 0,
        });
    }

    const total = blocks.reduce(
        (sum, b, i) =>
            sum +
            b.lines.length * b.size * b.line +
            (i < blocks.length - 1 ? b.gapAfter : 0),
        0,
    );
    return { blocks, total };
}

function paintGradient(
    ctx: CanvasRenderingContext2D,
    o: PostcardOptions,
    W: number,
    H: number,
) {
    if (o.gradientStops.length === 0 || o.gradientOpacity === 0) return;

    let grad: CanvasGradient;
    switch (o.gradientDir) {
        case "radial":
            grad = ctx.createRadialGradient(
                W / 2,
                H / 2,
                Math.min(W, H) * 0.1,
                W / 2,
                H / 2,
                Math.hypot(W, H) / 2,
            );
            break;
        case "to-top":
            grad = ctx.createLinearGradient(0, H, 0, 0);
            break;
        case "to-right":
            grad = ctx.createLinearGradient(0, 0, W, 0);
            break;
        case "diagonal":
            grad = ctx.createLinearGradient(0, 0, W, H);
            break;
        default:
            grad = ctx.createLinearGradient(0, 0, 0, H);
    }

    const stops = o.gradientStops;
    stops.forEach((c, i) =>
        grad.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c),
    );

    ctx.save();
    ctx.globalAlpha = o.gradientOpacity / 100;
    ctx.globalCompositeOperation =
        o.gradientBlend === "normal"
            ? "source-over"
            : (o.gradientBlend as GlobalCompositeOperation);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
}

/**
 * The hairline frame.
 *
 * Rather than closing at a bare right angle, each corner carries a diamond
 * medallion — a square stood on its point, doubled — and the four edges stop at
 * that diamond's side vertices so they meet it exactly. It is the same motif
 * the `star8` tile is built from, which keeps the frame in the same visual
 * family as the patterns offered for the background.
 */
function drawFrame(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number,
    lineWidth: number,
    color: string,
) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "miter";

    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x1 - r, y0);
    ctx.moveTo(x1, y0 + r);
    ctx.lineTo(x1, y1 - r);
    ctx.moveTo(x1 - r, y1);
    ctx.lineTo(x0 + r, y1);
    ctx.moveTo(x0, y1 - r);
    ctx.lineTo(x0, y0 + r);
    ctx.stroke();

    const corners: Array<[number, number]> = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
    ];
    for (const [cx, cy] of corners) {
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
    ctx.restore();
}

/** Fallback signature mark while the app icon is still loading. */
function drawMark(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    color: string,
) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, r * 0.16);
    ctx.lineJoin = "round";
    for (const rot of [0, Math.PI / 4]) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.strokeRect(-r * 0.62, -r * 0.62, r * 1.24, r * 1.24);
        ctx.restore();
    }
    ctx.restore();
}

/**
 * Fit a single run into `maxWidth`: shrink the type a little first, and only
 * clip with an ellipsis once that is exhausted. Archive credits run long — one
 * Corpus Coranicum source names a film archive and a German academy — and an
 * unfitted run would slide left across the signature on the other side.
 */
function fitRun(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    size: number,
    family: string,
    weight: string,
): { text: string; font: string } | null {
    if (maxWidth <= 0) return null;
    for (const factor of [1, 0.9, 0.8, 0.7]) {
        const font = fontSpec(size * factor, family, weight);
        ctx.font = font;
        if (ctx.measureText(text).width <= maxWidth) return { text, font };
    }
    const font = fontSpec(size * 0.7, family, weight);
    ctx.font = font;
    const ellipsis = "\u2026";
    if (ctx.measureText(ellipsis).width > maxWidth) return null;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    return { text: text.slice(0, lo).trimEnd() + ellipsis, font };
}

function clearShadow(ctx: CanvasRenderingContext2D) {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

/** True when this context honours the `filter` property (WebKit lags here). */
export function supportsCanvasFilter(ctx: CanvasRenderingContext2D): boolean {
    return typeof ctx.filter === "string";
}

export function renderPostcard(
    ctx: CanvasRenderingContext2D,
    o: PostcardOptions,
): void {
    const W = o.width;
    const H = o.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";
    clearShadow(ctx);

    // 1 — base colour, so translucent layers always have a ground to sit on.
    ctx.fillStyle = o.baseColor;
    ctx.fillRect(0, 0, W, H);

    // 2 — background layer. `combo` runs both arms: the scan goes down first
    // and the tile is laid over it, each keeping its own opacity.
    const wantsScan = o.bgMode === "manuscript" || o.bgMode === "combo";
    const wantsTile = o.bgMode === "pattern" || o.bgMode === "combo";

    if (wantsScan && o.bgImage && o.bgImageWidth > 0) {
        ctx.save();
        ctx.globalAlpha = o.bgOpacity / 100;
        if (supportsCanvasFilter(ctx)) {
            const parts: string[] = [];
            if (o.bgBlur > 0) parts.push(`blur(${o.bgBlur}px)`);
            if (o.bgGray) parts.push("grayscale(1)");
            ctx.filter = parts.length ? parts.join(" ") : "none";
        }
        const cover = Math.max(W / o.bgImageWidth, H / o.bgImageHeight);
        const s = cover * (o.bgZoom / 100);
        const dw = o.bgImageWidth * s;
        const dh = o.bgImageHeight * s;
        ctx.drawImage(
            o.bgImage,
            (W - dw) / 2 + (o.bgOffsetX / 100) * W,
            (H - dh) / 2 + (o.bgOffsetY / 100) * H,
            dw,
            dh,
        );
        ctx.restore();
    }

    if (wantsTile && o.patternImage) {
        const pat = ctx.createPattern(o.patternImage, "repeat");
        if (pat) {
            ctx.save();
            ctx.globalAlpha = o.patternOpacity / 100;
            ctx.fillStyle = pat;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
    }

    // 3 — gradient overlay
    paintGradient(ctx, o, W, H);

    // 4 — text
    const pad = Math.round(Math.min(W, H) * (o.padPct / 100));
    const maxWidth = W - pad * 2;

    // The signature strip is always drawn, so the text block is laid out
    // against the space left above it rather than against the card's height.
    // Its baseline sits a full margin-and-then-some off the bottom edge, which
    // keeps the mark clear of both the card edge and the frame's corner
    // medallions.
    const sigSize = Math.max(15, Math.min(W, H) * 0.019);
    const sigBaseline = H - pad * 0.75;
    const sigTop = sigBaseline - sigSize * 1.5;
    const contentBottom = sigTop - pad * 0.6;
    const available = contentBottom - pad;

    let scale = 1;
    let laid = buildBlocks(ctx, o, maxWidth, scale);
    if (o.autoFit) {
        let guard = 0;
        while (laid.total > available && scale > 0.25 && guard < 60) {
            scale *= 0.95;
            laid = buildBlocks(ctx, o, maxWidth, scale);
            guard++;
        }
    }

    const startY = pad + Math.max(0, (available - laid.total) * (o.vAlign / 100));
    const anchorX =
        o.textAlign === "center"
            ? W / 2
            : o.textAlign === "right"
              ? W - pad
              : pad;

    ctx.textAlign = o.textAlign;
    let cursorY = startY;
    for (const b of laid.blocks) {
        ctx.font = b.font;
        ctx.direction = b.rtl ? "rtl" : "ltr";
        ctx.fillStyle = b.color;
        if (o.shadow.on) {
            ctx.shadowColor = hexToRgba(o.shadow.color, o.shadow.opacity / 100);
            ctx.shadowBlur = o.shadow.blur;
            ctx.shadowOffsetX = o.shadow.dx;
            ctx.shadowOffsetY = o.shadow.dy;
        } else {
            clearShadow(ctx);
        }
        const lh = b.size * b.line;
        for (const line of b.lines) {
            cursorY += lh;
            // Sit the baseline inside the line box rather than on its bottom
            // edge, so ascenders and descenders share the leading evenly.
            ctx.fillText(line, anchorX, cursorY - lh * 0.25);
        }
        cursorY += b.gapAfter;
    }
    clearShadow(ctx);

    // 5 — hairline frame with ornamented corners
    if (o.borderOn) {
        const inset = pad * 0.5;
        // Keep the medallion inside the canvas at tight margins, and small
        // enough that the four of them never crowd out the edge between them.
        const r = Math.min(
            Math.min(W, H) * 0.022,
            inset * 0.9,
            (W - inset * 2) / 6,
            (H - inset * 2) / 6,
        );
        drawFrame(
            ctx,
            inset,
            inset,
            W - inset,
            H - inset,
            r,
            Math.max(1.5, Math.min(W, H) * 0.0018),
            hexToRgba(o.arabicColor, 0.32),
        );
    }

    // 6 — signature (left) and background credit (right)
    {
        const fy = sigBaseline;
        const fSize = sigSize;
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.direction = "ltr";
        ctx.font = fontSpec(fSize, o.transFont, "600");
        ctx.textAlign = "left";
        const markR = fSize * 0.75;
        if (o.signatureIcon) {
            ctx.drawImage(
                o.signatureIcon,
                pad,
                fy - fSize * 0.32 - markR,
                markR * 2,
                markR * 2,
            );
        } else {
            drawMark(ctx, pad + markR, fy - fSize * 0.32, markR, o.arabicColor);
        }
        ctx.fillStyle = o.arabicColor;
        const sigX = pad + markR * 2.4;
        ctx.fillText(o.signatureText, sigX, fy);
        const sigRight = sigX + ctx.measureText(o.signatureText).width;

        if (o.creditText) {
            const fitted = fitRun(
                ctx,
                o.creditText,
                W - pad - sigRight - fSize * 1.5,
                fSize * 0.86,
                o.transFont,
                "400",
            );
            if (fitted) {
                ctx.textAlign = "right";
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = o.arabicColor;
                ctx.font = fitted.font;
                ctx.fillText(fitted.text, W - pad, fy);
            }
        }
        ctx.restore();
    }
}
