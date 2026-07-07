import {
    AlignmentType,
    BorderStyle,
    Document,
    ExternalHyperlink,
    HeadingLevel,
    ImageRun,
    LevelFormat,
    LineRuleType,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
    type IParagraphOptions,
    type ParagraphChild,
} from "docx";
import { readFile } from "@tauri-apps/plugin-fs";
import { get } from "svelte/store";
import { codeBlockParagraphs } from "./docxCodeHighlight";
import { sceneToDataUrl, type Scene } from "$lexical/core/plugins/Drawing/drawingScene";
import { cssColorToHex, textRunStyleFromNode } from "./docxInlineStyle";
import { getSurahNameTashkeel } from "$lib/data/surah-names-tashkeel";
import { surahLabels } from "$lib/stores/quran.svelte";
import { juliaPlotIframes } from "$lib/stores/julia-notebook";
import { references } from "$lib/stores/references.store";
import {
    type BibStyle,
    type Reference,
    formatBibliographyEntry,
    isNumberedBibStyle,
} from "$lib/utils/references";

type BlockChild = Paragraph | Table;
type InlineStyle = { italic?: boolean; defaultColor?: string; hyperlink?: boolean };

const QUOTE_TEXT_COLOR = "707070"; // brand-charcoal-500
const QUOTE_BG_FILL = "FBF5E8";    // brand-gold-50
const QUOTE_BORDER_COLOR = "C8A96A"; // brand-gold-400
const GOLD_LIGHT = "E5CC90";       // brand-gold-200
const GOLD_DARK = "9A7A40";        // brand-gold-600

const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 2;
const FORMAT_STRIKETHROUGH = 4;
const FORMAT_UNDERLINE = 8;
const FORMAT_CODE = 16;
const FORMAT_SUBSCRIPT = 32;
const FORMAT_SUPERSCRIPT = 64;

const HEADING_BY_TAG: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    h1: HeadingLevel.HEADING_1,
    h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3,
    h4: HeadingLevel.HEADING_4,
    h5: HeadingLevel.HEADING_5,
    h6: HeadingLevel.HEADING_6,
};

const ALIGNMENT_BY_FORMAT: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType] | undefined> = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
    start: AlignmentType.START,
    end: AlignmentType.END,
};

const BULLET_REF = "lexical-bullets";
const NUMBER_REF = "lexical-numbers";
const CHECK_REF = "lexical-checks";
const LEXICAL_BLOCK_INDENT_DXA = 600; // 40px editor indent base at 96dpi.
const HR_BORDER_COLOR = "D1D5DB";

// Node types that must each become their own DOCX block. Used to detect when a
// paragraph unexpectedly *nests* block content (see paragraphContainerBlocks).
// Inline-capable nodes (text, link, equation, image, tab, linebreak) are
// deliberately excluded so ordinary paragraphs still render as a single block.
const BLOCK_LEVEL_TYPES = new Set<string>([
    "paragraph",
    "extended-paragraph",
    "heading",
    "list",
    "quote",
    "blockquote",
    "table",
    "code",
    "julia-cell",
    "quran-block",
    "horizontalrule",
    "horizontal-rule",
    "reference-list",
]);

interface SerializedNode {
    type: string;
    children?: SerializedNode[];
    [key: string]: unknown;
}

interface ListContext {
    reference: typeof BULLET_REF | typeof NUMBER_REF | typeof CHECK_REF;
    level: number;
    checked?: boolean;
}

interface ParagraphOptionFlags {
    includeBlockIndent?: boolean;
}

export async function lexicalStateToDocxBlob(
    rootJson: SerializedNode,
    _title: string,
): Promise<Blob> {
    const flatChildren = liftQuranBlocksFromList(rootJson.children ?? []);
    const blocks = await walkBlocks(flatChildren, null);
    const doc = new Document({
        creator: "AyahLab",
        styles: {
            default: {
                document: { run: { font: "Calibri", size: 22 } },
            },
        },
        numbering: {
            config: [
                {
                    reference: BULLET_REF,
                    levels: buildBulletLevels(),
                },
                {
                    reference: NUMBER_REF,
                    levels: buildNumberLevels(),
                },
            ],
        },
        sections: [
            {
                properties: {},
                children: blocks.length > 0 ? blocks : [new Paragraph({ children: [] })],
            },
        ],
    });
    return Packer.toBlob(doc);
}

function buildBulletLevels() {
    return [0, 1, 2, 3, 4, 5].map((level) => ({
        level,
        format: LevelFormat.BULLET,
        text: ["•", "◦", "▪"][level % 3],
        alignment: AlignmentType.LEFT,
        style: {
            paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } },
        },
    }));
}

function buildNumberLevels() {
    const formats = [
        LevelFormat.DECIMAL,
        LevelFormat.LOWER_LETTER,
        LevelFormat.LOWER_ROMAN,
        LevelFormat.DECIMAL,
        LevelFormat.LOWER_LETTER,
        LevelFormat.LOWER_ROMAN,
    ];
    return formats.map((format, level) => ({
        level,
        format,
        text: `%${level + 1}.`,
        alignment: AlignmentType.LEFT,
        style: {
            paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } },
        },
    }));
}

async function walkBlocks(
    nodes: SerializedNode[],
    list: ListContext | null,
): Promise<BlockChild[]> {
    const out: BlockChild[] = [];
    for (const node of nodes) {
        const result = await blockForNode(node, list);
        if (Array.isArray(result)) {
            out.push(...result);
        } else if (result) {
            out.push(result);
        }
    }
    return out;
}

async function blockForNode(
    node: SerializedNode,
    list: ListContext | null,
): Promise<BlockChild | BlockChild[] | null> {
    switch (node.type) {
        case "heading": {
            const tag = (node.tag as string) ?? "h1";
            const children = await inlineRuns(node.children ?? []);
            return new Paragraph({
                heading: HEADING_BY_TAG[tag] ?? HeadingLevel.HEADING_1,
                children,
                ...paragraphOptionsFromNode(node, list),
            });
        }
        case "paragraph":
        case "extended-paragraph": {
            // Normally a paragraph holds only inline content, but some documents
            // nest block nodes inside it (e.g. text authored around an inline
            // Quran decorator ends up wrapped in a container paragraph). Flatten-
            // ing those to inline runs merges them onto one line and drops the
            // empty paragraphs between them, so split the container instead.
            if ((node.children ?? []).some((c) => BLOCK_LEVEL_TYPES.has(c.type))) {
                return await paragraphContainerBlocks(node, list);
            }
            const children = await inlineRuns(node.children ?? []);
            return new Paragraph({
                children,
                ...paragraphOptionsFromNode(node, list),
            });
        }
        case "blockquote":
        case "quote": {
            const children = await inlineRuns(node.children ?? [], {
                italic: true,
                defaultColor: QUOTE_TEXT_COLOR,
            });
            const baseOpts = paragraphOptionsFromNode(node, list);
            // Combine the quote's fixed inset with any block indent /
            // text-indent the node carries, instead of discarding them.
            const baseLeft =
                typeof baseOpts.indent?.left === "number" ? baseOpts.indent.left : 0;
            return new Paragraph({
                children,
                ...baseOpts,
                indent: { ...(baseOpts.indent ?? {}), left: 360 + baseLeft },
                border: {
                    left: {
                        style: BorderStyle.SINGLE,
                        size: 24,
                        color: QUOTE_BORDER_COLOR,
                        space: 12,
                    },
                },
                shading: { type: ShadingType.CLEAR, color: "auto", fill: QUOTE_BG_FILL },
            });
        }
        case "horizontalrule":
        case "horizontal-rule": {
            return new Paragraph({
                children: [],
                spacing: { before: 240, after: 240 },
                border: {
                    bottom: { style: BorderStyle.SINGLE, size: 6, color: HR_BORDER_COLOR, space: 1 },
                },
            });
        }
        case "list": {
            const listType = (node.listType as string) ?? "bullet";
            const ref =
                listType === "number"
                    ? NUMBER_REF
                    : listType === "check"
                        ? CHECK_REF
                        : BULLET_REF;
            const nextLevel = list ? list.level + 1 : 0;
            const items: BlockChild[] = [];
            for (const child of node.children ?? []) {
                if (child.type === "listitem") {
                    const ctx: ListContext = {
                        reference: ref,
                        level: nextLevel,
                        checked: typeof child.checked === "boolean" ? (child.checked as boolean) : undefined,
                    };
                    items.push(...(await listItemBlocks(child, ctx)));
                }
            }
            return items;
        }
        case "image": {
            return await imageParagraph(node);
        }
        case "drawing": {
            return await drawingParagraph(node);
        }
        case "code": {
            return codeBlockParagraphs(node);
        }
        case "julia-cell": {
            return await juliaCellBlocks(node);
        }
        case "equation": {
            const eq = (node.equation as string) ?? "";
            const inline = (node.inline as boolean) ?? false;
            const text = inline ? `$${eq}$` : `$$${eq}$$`;
            return new Paragraph({
                children: [new TextRun({ text, italics: true })],
                alignment: inline ? undefined : AlignmentType.CENTER,
            });
        }
        case "table": {
            return await tableElement(node);
        }
        case "quran-block": {
            return quranBlockBlocks(node);
        }
        case "reference-list": {
            return referenceListBlocks(node);
        }
        case "tablerow":
        case "tablecell": {
            return null;
        }
        default: {
            if (node.children && node.children.length > 0) {
                return await walkBlocks(node.children, list);
            }
            return null;
        }
    }
}

// Render a paragraph whose children include block-level nodes. Consecutive
// inline children are grouped into their own paragraph (preserving the wrapper's
// alignment/indent), while each nested block node is emitted as a standalone
// block. This keeps the document's line breaks and blank lines — an empty nested
// paragraph becomes an empty DOCX paragraph rather than disappearing.
async function paragraphContainerBlocks(
    node: SerializedNode,
    list: ListContext | null,
): Promise<BlockChild[]> {
    const baseOptions = paragraphOptionsFromNode(node, list);
    const out: BlockChild[] = [];
    let inlineBuffer: SerializedNode[] = [];
    const flushInline = async () => {
        if (inlineBuffer.length === 0) return;
        out.push(
            new Paragraph({ children: await inlineRuns(inlineBuffer), ...baseOptions }),
        );
        inlineBuffer = [];
    };
    for (const child of node.children ?? []) {
        if (BLOCK_LEVEL_TYPES.has(child.type)) {
            await flushInline();
            const block = await blockForNode(child, list);
            if (Array.isArray(block)) out.push(...block);
            else if (block) out.push(block);
        } else {
            inlineBuffer.push(child);
        }
    }
    await flushInline();
    return out;
}

async function listItemBlocks(
    item: SerializedNode,
    ctx: ListContext,
): Promise<BlockChild[]> {
    const out: BlockChild[] = [];
    const inlineChildren: SerializedNode[] = [];
    const blockChildren: SerializedNode[] = [];
    for (const child of item.children ?? []) {
        if (child.type === "list") blockChildren.push(child);
        else inlineChildren.push(child);
    }

    const runs = await inlineRuns(inlineChildren);
    const prefix: ParagraphChild[] =
        ctx.checked !== undefined
            ? [new TextRun({ text: ctx.checked ? "☑ " : "☐ " })]
            : [];

    const level = Math.min(ctx.level, 5);
    // Check items render their own ☑/☐ glyph, so numbering would add a
    // stray bullet in front of it — indent them like a list level instead.
    const isCheck = ctx.reference === CHECK_REF;
    out.push(
        new Paragraph({
            children: [...prefix, ...runs],
            ...paragraphOptionsFromNode(item, ctx, { includeBlockIndent: false }),
            ...(isCheck
                ? { indent: { left: 720 * (level + 1), hanging: 360 } }
                : { numbering: { reference: ctx.reference, level } }),
        }),
    );

    for (const block of blockChildren) {
        const nested = await blockForNode(block, ctx);
        if (Array.isArray(nested)) out.push(...nested);
        else if (nested) out.push(nested);
    }
    return out;
}

async function inlineRuns(
    nodes: SerializedNode[],
    style?: InlineStyle,
): Promise<ParagraphChild[]> {
    const out: ParagraphChild[] = [];
    for (const node of nodes) {
        const runs = await inlineForNode(node, style);
        out.push(...runs);
    }
    return out;
}

async function inlineForNode(
    node: SerializedNode,
    style?: InlineStyle,
): Promise<ParagraphChild[]> {
    switch (node.type) {
        case "text": {
            const text = (node.text as string) ?? "";
            const format = (node.format as number) ?? 0;
            const italic = (format & FORMAT_ITALIC) !== 0 || style?.italic === true;
            const styleOpts = textRunStyleFromNode(
                typeof node.style === "string" ? (node.style as string) : undefined,
                style?.defaultColor,
            );
            const runOpts = {
                // The built-in "Hyperlink" character style (blue + underline)
                // applies when this run is inside a link; explicit props below
                // still override it (e.g. a custom color/format).
                ...(style?.hyperlink ? { style: "Hyperlink" } : {}),
                ...styleOpts,
                bold: (format & FORMAT_BOLD) !== 0 || undefined,
                italics: italic || undefined,
                strike: (format & FORMAT_STRIKETHROUGH) !== 0 || undefined,
                underline: (format & FORMAT_UNDERLINE) !== 0 ? {} : undefined,
                subScript: (format & FORMAT_SUBSCRIPT) !== 0 || undefined,
                superScript: (format & FORMAT_SUPERSCRIPT) !== 0 || undefined,
                ...((format & FORMAT_CODE) !== 0 ? { font: "Courier New" } : {}),
            };
            // A raw "\n" inside a run's text is ignored by Word — a line break
            // needs an explicit break. Text nodes can carry embedded newlines
            // (e.g. from pasted/imported content), so split on them and emit a
            // break before each segment after the first.
            const segments = text.split("\n");
            return segments.map(
                (segment, i) =>
                    new TextRun({
                        ...runOpts,
                        text: segment,
                        ...(i > 0 ? { break: 1 } : {}),
                    }),
            );
        }
        case "linebreak":
            return [new TextRun({ break: 1 })];
        case "tab":
            return [new TextRun({ text: "\t" })];
        case "link":
        case "autolink": {
            const url = (node.url as string) ?? "";
            const children = await inlineRuns(node.children ?? [], {
                ...style,
                hyperlink: true,
            });
            const textRunChildren = children.filter(
                (c): c is TextRun => c instanceof TextRun,
            );
            return [
                new ExternalHyperlink({
                    link: url,
                    children: textRunChildren.length > 0
                        ? textRunChildren
                        : [new TextRun({ text: url, style: "Hyperlink" })],
                }),
            ];
        }
        case "citation": {
            // In-text citation marker (e.g. "[1]" or "(Author, 2020)"). It's an
            // inline decorator node with no children — the rendered text lives on
            // the node itself — so without this case it falls through to the
            // default and the citation silently vanishes from the export while the
            // end-of-document References list still lists the source.
            const citationText = (node.text as string) ?? "";
            if (!citationText) return [];
            return [
                new TextRun({
                    text: citationText,
                    italics: style?.italic || undefined,
                    color: style?.defaultColor,
                    ...(style?.hyperlink ? { style: "Hyperlink" } : {}),
                }),
            ];
        }
        case "equation": {
            const eq = (node.equation as string) ?? "";
            const inline = (node.inline as boolean) ?? true;
            return [
                new TextRun({
                    text: inline ? `$${eq}$` : `$$${eq}$$`,
                    italics: true,
                }),
            ];
        }
        case "image": {
            const run = await imageRunFromNode(node);
            if (run) return [run];
            const altText = (node.altText as string) ?? "";
            return [new TextRun({ text: `[Image: ${altText || "missing"}]`, italics: true })];
        }
        case "drawing": {
            const run = await drawingRunFromNode(node);
            if (run) return [run];
            return [new TextRun({ text: `[Drawing]`, italics: true })];
        }
        default: {
            if (node.children && node.children.length > 0) {
                return await inlineRuns(node.children, style);
            }
            return [];
        }
    }
}

// Largest width (in px) an image is allowed to occupy in the exported
// document, so oversized images are scaled down rather than overflowing.
const DOCX_IMAGE_MAX_WIDTH = 480;

// Decode the image bytes to obtain its intrinsic pixel dimensions, used to
// preserve aspect ratio when the Lexical node carries no explicit size.
async function decodeImageSize(
    data: Uint8Array,
    imageType: "png" | "jpg" | "gif" | "bmp",
): Promise<{ width: number; height: number } | null> {
    const mime = imageType === "jpg" ? "image/jpeg" : `image/${imageType}`;
    const blob = new Blob([data as unknown as BlobPart], { type: mime });
    try {
        if (typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(blob);
            const size = { width: bitmap.width, height: bitmap.height };
            bitmap.close();
            if (size.width > 0 && size.height > 0) return size;
        }
    } catch {
        // fall through to the HTMLImageElement path
    }
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(
                img.naturalWidth > 0 && img.naturalHeight > 0
                    ? { width: img.naturalWidth, height: img.naturalHeight }
                    : null,
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

async function imageRunFromNode(node: SerializedNode): Promise<ParagraphChild | null> {
    const src = (node.src as string) ?? "";
    const altText = (node.altText as string) ?? "";
    const widthRaw = node.width;
    const heightRaw = node.height;
    // `'inherit'` sizing is serialized as 0; treat anything non-positive as
    // "unspecified" so we can derive it from the image's real aspect ratio.
    let width = typeof widthRaw === "number" && widthRaw > 0 ? widthRaw : 0;
    let height = typeof heightRaw === "number" && heightRaw > 0 ? heightRaw : 0;

    const data = await resolveImageSrc(src);
    if (!data) {
        console.warn("[lexicalToDocx] image skipped, could not resolve src:", src.slice(0, 120));
        return null;
    }

    const imageType = detectImageType(src, data);

    const natural = await decodeImageSize(data, imageType);
    if (natural) {
        const ratio = natural.height / natural.width;
        if (width > 0 && height <= 0) {
            height = Math.round(width * ratio);
        } else if (height > 0 && width <= 0) {
            width = Math.round(height / ratio);
        } else if (width <= 0 && height <= 0) {
            width = Math.min(natural.width, DOCX_IMAGE_MAX_WIDTH);
            height = Math.round(width * ratio);
        }
    }
    // Final guard for images that could not be decoded at all.
    if (width <= 0) width = DOCX_IMAGE_MAX_WIDTH;
    if (height <= 0) height = Math.round(width * 0.75);
    try {
        return new ImageRun({
            data,
            transformation: { width, height },
            type: imageType,
            altText: altText
                ? { title: altText, description: altText, name: altText }
                : undefined,
        } as ConstructorParameters<typeof ImageRun>[0]);
    } catch (err) {
        console.warn("[lexicalToDocx] ImageRun failed:", err);
        return null;
    }
}

async function imageParagraph(node: SerializedNode): Promise<Paragraph> {
    const run = await imageRunFromNode(node);
    if (run) {
        return new Paragraph({ children: [run], alignment: AlignmentType.CENTER });
    }
    const altText = (node.altText as string) ?? "";
    return new Paragraph({
        children: [new TextRun({ text: `[Image: ${altText || "missing"}]`, italics: true })],
    });
}

// A drawing node carries an editable scene model; render it to SVG, rasterize
// to PNG (docx's ImageRun has no SVG support), and size it like an image.
async function drawingRunFromNode(node: SerializedNode): Promise<ParagraphChild | null> {
    const scene = node.scene as Scene | undefined;
    if (!scene || !Array.isArray(scene.shapes)) return null;
    const raster = await rasterizeToPng(sceneToDataUrl(scene));
    if (!raster) return null;

    const ratio = raster.width > 0 ? raster.height / raster.width : 0.75;
    let width =
        typeof node.width === "number" && node.width > 0 ? node.width : raster.width;
    let height =
        typeof node.height === "number" && node.height > 0 ? node.height : raster.height;
    if (width > DOCX_IMAGE_MAX_WIDTH) {
        width = DOCX_IMAGE_MAX_WIDTH;
        height = Math.round(width * ratio);
    }
    const altText = (node.altText as string) ?? "";
    try {
        return new ImageRun({
            data: raster.bytes,
            transformation: { width, height },
            type: "png",
            altText: altText
                ? { title: altText, description: altText, name: altText }
                : undefined,
        } as ConstructorParameters<typeof ImageRun>[0]);
    } catch (err) {
        console.warn("[lexicalToDocx] drawing ImageRun failed:", err);
        return null;
    }
}

async function drawingParagraph(node: SerializedNode): Promise<Paragraph> {
    const run = await drawingRunFromNode(node);
    if (run) {
        return new Paragraph({ children: [run], alignment: AlignmentType.CENTER });
    }
    return new Paragraph({
        children: [new TextRun({ text: `[Drawing]`, italics: true })],
    });
}

// Rasterize an image data URL (PNG or SVG) to PNG bytes and its pixel size,
// so Julia plots export as a uniformly DOCX-supported image regardless of
// the format the Julia display hook produced.
function rasterizeToPng(
    url: string,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const width = img.naturalWidth || DOCX_IMAGE_MAX_WIDTH;
            const height = img.naturalHeight || Math.round(width * 0.75);
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                resolve(null);
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const base64 = canvas.toDataURL("image/png").split(",")[1] ?? "";
            resolve({ bytes: base64ToBytes(base64), width, height });
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

// Snapshot an interactive plot's iframe to PNG bytes, capturing whatever
// rotation/pan/zoom the user has applied. PlotlyJS exposes `Plotly.toImage`
// inside the srcdoc iframe; Gadfly's SVGJS output mutates an inline <svg> we
// serialize directly; WGLMakie's Bonito canvas is read via `toDataURL` when
// the webview lets us. Returns `null` if the iframe isn't mounted or the
// snapshot can't be taken (e.g. tainted canvas).
async function captureInteractivePlot(
    key: string,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
    const iframe = juliaPlotIframes.get(key);
    if (!iframe) return null;
    // `Document` from the `docx` import shadows the DOM's Document type here, so
    // qualify these with `globalThis` to get the real browser document/window.
    let doc: globalThis.Document | null;
    let win: Window | null;
    try {
        doc = iframe.contentDocument;
        win = iframe.contentWindow;
    } catch {
        return null;
    }
    if (!doc || !win) return null;

    // PlotlyJS — call into the iframe's Plotly to render the live state.
    const plotly = (win as unknown as { Plotly?: { toImage: (gd: HTMLElement, opts: Record<string, unknown>) => Promise<string> } }).Plotly;
    if (plotly) {
        const gd = (doc.querySelector(".js-plotly-plot") ??
            doc.querySelector(".plotly-graph-div")) as HTMLElement | null;
        if (gd) {
            try {
                const rect = gd.getBoundingClientRect();
                const w = Math.max(400, Math.round(rect.width || gd.clientWidth || 1000));
                const h = Math.max(300, Math.round(rect.height || gd.clientHeight || 600));
                const dataUrl = await plotly.toImage(gd, {
                    format: "png",
                    width: w,
                    height: h,
                });
                const raster = await rasterizeToPng(dataUrl);
                if (raster) return raster;
            } catch (err) {
                console.warn("[lexicalToDocx] Plotly.toImage failed:", err);
            }
        }
    }

    // Gadfly / generic SVG — serialize the live SVG (transforms applied by
    // SVGJS hover/zoom code are part of the DOM, so this preserves the state).
    const svg = doc.querySelector("svg") as SVGElement | null;
    if (svg) {
        try {
            const cloned = svg.cloneNode(true) as SVGElement;
            if (!cloned.getAttribute("xmlns")) {
                cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            }
            const xml = new XMLSerializer().serializeToString(cloned);
            const dataUrl =
                "data:image/svg+xml;base64," +
                btoa(unescape(encodeURIComponent(xml)));
            const raster = await rasterizeToPng(dataUrl);
            if (raster) return raster;
        } catch (err) {
            console.warn("[lexicalToDocx] SVG snapshot failed:", err);
        }
    }

    // WGLMakie / Bonito — grab the canvas if the webview considers it
    // same-origin. Tainted canvases throw on toDataURL; we silently fall
    // back to whatever the cell originally captured.
    const canvas = doc.querySelector("canvas") as HTMLCanvasElement | null;
    if (canvas) {
        try {
            const dataUrl = canvas.toDataURL("image/png");
            const raster = await rasterizeToPng(dataUrl);
            if (raster) return raster;
        } catch (err) {
            console.warn("[lexicalToDocx] canvas snapshot failed:", err);
        }
    }

    return null;
}

async function juliaPlotParagraph(plot: {
    format: string;
    data?: string;
    url?: string;
}): Promise<Paragraph | null> {
    const key = plot.url ?? plot.data ?? "";
    let raster: { bytes: Uint8Array; width: number; height: number } | null =
        null;

    // Prefer the live iframe state for interactive plots so any rotation/
    // pan/zoom done in the editor is reflected in the exported image.
    if (key && (plot.format === "plotly" || plot.format === "html")) {
        raster = await captureInteractivePlot(key);
    }

    if (!raster && plot.data) {
        const mime = plot.format === "svg" ? "image/svg+xml" : "image/png";
        raster = await rasterizeToPng(`data:${mime};base64,${plot.data}`);
    }
    if (!raster) return null;

    let { width, height } = raster;
    if (width > DOCX_IMAGE_MAX_WIDTH) {
        height = Math.round(height * (DOCX_IMAGE_MAX_WIDTH / width));
        width = DOCX_IMAGE_MAX_WIDTH;
    }
    try {
        return new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new ImageRun({
                    data: raster.bytes,
                    transformation: { width, height },
                    type: "png",
                } as ConstructorParameters<typeof ImageRun>[0]),
            ],
        });
    } catch (err) {
        console.warn("[lexicalToDocx] Julia plot failed:", err);
        return null;
    }
}

// Export a Julia code cell honouring its on-screen display mode: the cell
// contributes its source, its output, or both — matching what the editor
// shows so the document mirrors the user's chosen view.
async function juliaCellBlocks(node: SerializedNode): Promise<BlockChild[]> {
    const displayMode = (node.displayMode as string) ?? "both";
    const code = (node.code as string) ?? "";
    const output = (node.output as string) ?? "";
    const hasError = (node.hasError as boolean) ?? false;
    const plots = Array.isArray(node.plots)
        ? (node.plots as { format: string; data?: string; url?: string }[])
        : [];

    const out: BlockChild[] = [];

    if (displayMode !== "output") {
        out.push(
            ...codeBlockParagraphs({ type: "code", code, language: "julia" }),
        );
    }

    if (displayMode !== "code") {
        if (output) {
            const outColor = hasError ? "C0392B" : "5C6166";
            for (const line of output.split("\n")) {
                out.push(
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: line,
                                font: "Courier New",
                                size: 20,
                                color: outColor,
                            }),
                        ],
                        shading: {
                            type: ShadingType.CLEAR,
                            color: "auto",
                            fill: "F4F4F4",
                        },
                        spacing: { before: 0, after: 0 },
                    }),
                );
            }
        }
        for (const plot of plots) {
            const para = await juliaPlotParagraph(plot);
            if (para) out.push(para);
        }
    }

    return out;
}

const PX_TO_DXA = 15; // 1 px (96 dpi) ≈ 0.75 pt = 15 twips
const DEFAULT_CELL_PX = 120;

async function tableElement(node: SerializedNode): Promise<Table> {
    const rowDefs = (node.children ?? []).filter((c) => c.type === "tablerow");
    const firstRowCells = (rowDefs[0]?.children ?? []).filter(
        (c) => c.type === "tablecell",
    );
    let totalCols = 0;
    for (const cell of firstRowCells) {
        const span = typeof cell.colSpan === "number" ? (cell.colSpan as number) : 1;
        totalCols += Math.max(1, span);
    }
    if (totalCols === 0) totalCols = 1;

    const colWidthsPx = Array.isArray(node.colWidths)
        ? (node.colWidths as number[])
        : [];
    const colWidthsDxa: number[] = [];
    for (let i = 0; i < totalCols; i++) {
        const px = typeof colWidthsPx[i] === "number" && colWidthsPx[i] > 0
            ? colWidthsPx[i]
            : DEFAULT_CELL_PX;
        colWidthsDxa.push(Math.round(px * PX_TO_DXA));
    }
    const tableWidthDxa = colWidthsDxa.reduce((a, b) => a + b, 0);
    const tableAlignment = alignmentFromFormat(node.format);

    const rows: TableRow[] = [];
    for (const rowNode of rowDefs) {
        rows.push(await tableRowFromNode(rowNode, colWidthsDxa));
    }
    if (rows.length === 0) {
        rows.push(
            new TableRow({
                children: [new TableCell({ children: [new Paragraph({ children: [] })] })],
            }),
        );
    }
    return new Table({
        rows,
        columnWidths: colWidthsDxa,
        width: { size: tableWidthDxa, type: WidthType.DXA },
        ...(tableAlignment !== undefined ? { alignment: tableAlignment } : {}),
    });
}

async function tableRowFromNode(
    rowNode: SerializedNode,
    colWidthsDxa: number[],
): Promise<TableRow> {
    const cells: TableCell[] = [];
    let colIdx = 0;
    for (const cellNode of rowNode.children ?? []) {
        if (cellNode.type !== "tablecell") continue;
        const colSpan =
            typeof cellNode.colSpan === "number" && (cellNode.colSpan as number) > 0
                ? (cellNode.colSpan as number)
                : 1;
        let widthDxa = 0;
        for (let i = 0; i < colSpan; i++) {
            widthDxa += colWidthsDxa[colIdx + i] ?? DEFAULT_CELL_PX * PX_TO_DXA;
        }
        cells.push(await tableCellFromNode(cellNode, widthDxa));
        colIdx += colSpan;
    }
    if (cells.length === 0) {
        cells.push(new TableCell({ children: [new Paragraph({ children: [] })] }));
    }
    return new TableRow({ children: cells });
}

async function tableCellFromNode(
    cellNode: SerializedNode,
    widthDxa: number,
): Promise<TableCell> {
    const headerState =
        typeof cellNode.headerState === "number" ? (cellNode.headerState as number) : 0;
    const isHeader = headerState !== 0;
    const colSpan =
        typeof cellNode.colSpan === "number" && (cellNode.colSpan as number) > 1
            ? (cellNode.colSpan as number)
            : undefined;
    const rowSpan =
        typeof cellNode.rowSpan === "number" && (cellNode.rowSpan as number) > 1
            ? (cellNode.rowSpan as number)
            : undefined;
    const blocks = await walkBlocks(cellNode.children ?? [], null);
    const children: BlockChild[] =
        blocks.length > 0 ? blocks : [new Paragraph({ children: [] })];
    const backgroundColor =
        typeof cellNode.backgroundColor === "string"
            ? cssColorToHex(cellNode.backgroundColor as string)
            : null;
    const shadingFill = backgroundColor ?? (isHeader ? "F0F0F0" : null);
    return new TableCell({
        children,
        ...(widthDxa > 0
            ? { width: { size: widthDxa, type: WidthType.DXA } }
            : {}),
        ...(colSpan ? { columnSpan: colSpan } : {}),
        ...(rowSpan ? { rowSpan } : {}),
        ...(shadingFill
            ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: shadingFill } }
            : {}),
    });
}

export async function resolveImageSrc(src: string): Promise<Uint8Array | null> {
    if (!src) return null;
    try {
        if (src.startsWith("data:")) {
            const commaIdx = src.indexOf(",");
            if (commaIdx === -1) return null;
            const meta = src.substring(5, commaIdx);
            const payload = src.substring(commaIdx + 1);
            if (meta.includes("base64")) {
                return base64ToBytes(payload);
            }
            return new TextEncoder().encode(decodeURIComponent(payload));
        }
        if (src.startsWith("blob:")) {
            const buf = await (await fetch(src)).arrayBuffer();
            return new Uint8Array(buf);
        }

        const tauriPath = extractTauriAssetPath(src);
        if (tauriPath) {
            const bytes = await readFile(tauriPath);
            return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        }

        if (src.startsWith("file://")) {
            const path = decodeURI(src.replace(/^file:\/\//, ""));
            const bytes = await readFile(path);
            return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        }
        if (src.startsWith("http://") || src.startsWith("https://")) {
            try {
                const res = await fetch(src);
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    return new Uint8Array(buf);
                }
            } catch {
                // fall through to XHR fallback (some Tauri webviews block fetch but allow XHR)
            }
            return await xhrToBytes(src);
        }
        if (src.startsWith("/") || /^[A-Za-z]:[\\\/]/.test(src)) {
            const bytes = await readFile(src);
            return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        }
        return null;
    } catch {
        return null;
    }
}

export function extractTauriAssetPath(src: string): string | null {
    // Tauri 2.x asset protocol on different platforms:
    //   macOS/Linux:  asset://localhost/<encoded-path>
    //   Windows:      https://asset.localhost/<encoded-path>
    //                 http://asset.localhost/<encoded-path>
    //   Older:        tauri://localhost/<encoded-path>
    const patterns = [
        /^asset:\/\/localhost\/(.+)$/,
        /^https?:\/\/asset\.localhost\/(.+)$/,
        /^tauri:\/\/localhost\/(.+)$/,
    ];
    for (const re of patterns) {
        const m = src.match(re);
        if (m) {
            try {
                return decodeURIComponent(m[1]);
            } catch {
                return m[1];
            }
        }
    }
    return null;
}

function xhrToBytes(url: string): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.responseType = "arraybuffer";
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
                    resolve(new Uint8Array(xhr.response as ArrayBuffer));
                } else {
                    resolve(null);
                }
            };
            xhr.onerror = () => resolve(null);
            xhr.send();
        } catch {
            resolve(null);
        }
    });
}

function base64ToBytes(b64: string): Uint8Array {
    const clean = b64.replace(/\s+/g, "");
    const binary = atob(clean);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

export function detectImageType(
    src: string,
    data: Uint8Array,
): "png" | "jpg" | "gif" | "bmp" {
    const lower = src.toLowerCase();
    if (lower.includes(".png") || lower.startsWith("data:image/png")) return "png";
    if (lower.includes(".jpg") || lower.includes(".jpeg") || lower.startsWith("data:image/jpeg")) return "jpg";
    if (lower.includes(".gif") || lower.startsWith("data:image/gif")) return "gif";
    if (lower.includes(".bmp") || lower.startsWith("data:image/bmp")) return "bmp";
    if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "png";
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
    if (data.length >= 3 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "gif";
    return "png";
}

function paragraphOptionsFromNode(
    node: SerializedNode,
    _list: ListContext | null,
    flags: ParagraphOptionFlags = {},
): Partial<IParagraphOptions> {
    const format = node.format;
    const indent = node.indent;
    const alignment = alignmentFromFormat(format);
    const blockIndent =
        flags.includeBlockIndent !== false && typeof indent === "number" && indent > 0
            ? LEXICAL_BLOCK_INDENT_DXA * indent
            : undefined;
    const firstLineIndent =
        typeof node.style === "string"
            ? firstLineIndentFromStyle(node.style as string)
            : undefined;
    const indentOpt =
        blockIndent !== undefined || firstLineIndent !== undefined
            ? {
                ...(blockIndent !== undefined ? { left: blockIndent } : {}),
                ...(firstLineIndent !== undefined ? { firstLine: firstLineIndent } : {}),
            }
            : undefined;
    return {
        ...(alignment !== undefined ? { alignment } : {}),
        ...(indentOpt !== undefined ? { indent: indentOpt } : {}),
    };
}

function alignmentFromFormat(format: unknown) {
    return typeof format === "string" && format && ALIGNMENT_BY_FORMAT[format]
        ? ALIGNMENT_BY_FORMAT[format]
        : undefined;
}

function firstLineIndentFromStyle(style: string): number | undefined {
    const value = style
        .split(";")
        .map((decl) => decl.trim())
        .find((decl) => decl.toLowerCase().startsWith("text-indent:"))
        ?.split(":")
        .slice(1)
        .join(":")
        .trim();
    if (!value) return undefined;
    return cssLengthToDxa(value);
}

function cssLengthToDxa(value: string): number | undefined {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|pt|em|rem)?$/i);
    if (!match) return undefined;
    const n = Number.parseFloat(match[1]);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    const unit = (match[2] ?? "px").toLowerCase();
    const pt = unit === "pt" ? n : unit === "px" ? n * 0.75 : n * 12;
    return Math.round(pt * 20);
}

// ── Reference list ──────────────────────────────────────────────────────────

// Render the auto-maintained "References" section. The Lexical node only
// stores the cited reference ids and the chosen style, so the actual entries
// are resolved from the reference library store at export time and formatted
// in the selected bibliography style.
function referenceListBlocks(node: SerializedNode): BlockChild[] {
    const refIds = Array.isArray(node.refIds) ? (node.refIds as string[]) : [];
    const style = (typeof node.style === "string" ? node.style : "apa") as BibStyle;

    const byId = new Map(get(references).map((r) => [r.id, r]));
    const entries = refIds
        .map((id) => byId.get(id))
        .filter((r): r is Reference => !!r);

    const out: BlockChild[] = [];
    out.push(
        new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
            children: [new TextRun({ text: "References" })],
        }),
    );

    const numbered = isNumberedBibStyle(style);
    entries.forEach((ref, i) => {
        const text = formatBibliographyEntry(ref, style);
        const runs: ParagraphChild[] = numbered
            ? [new TextRun({ text: `[${i + 1}]\t${text}` })]
            : [new TextRun({ text })];
        out.push(
            new Paragraph({
                children: runs,
                spacing: { after: 60 },
                indent: { left: 360, hanging: 360 },
            }),
        );
    });

    return out;
}

// ── Quran block ─────────────────────────────────────────────────────────────

// Lift `quran-block` decorator nodes out of their parents so they sit at the
// root level for the block-walker. Lexical's DecoratorNode is inline by
// default, so QuranBlockNode commonly nests inside a paragraph alongside
// other inline content; the parent is split at each quran-block boundary so
// the document order — text, block, more text, another block — is preserved.
// Table containers are left intact (we don't fragment table cells).
export function liftQuranBlocksFromList(nodes: SerializedNode[]): SerializedNode[] {
    const out: SerializedNode[] = [];
    for (const node of nodes) out.push(...liftFromNode(node));
    return out;
}

function liftFromNode(node: SerializedNode): SerializedNode[] {
    if (node.type === "quran-block") return [node];
    if (!Array.isArray(node.children) || node.children.length === 0) {
        return [node];
    }
    if (isUnsplittableContainer(node)) {
        // Recurse but keep the container as a single output node — don't split
        // tables/cells around an embedded quran-block.
        const newChildren: SerializedNode[] = [];
        for (const child of node.children) {
            for (const lifted of liftFromNode(child)) newChildren.push(lifted);
        }
        return [{ ...node, children: newChildren }];
    }

    const segments: SerializedNode[] = [];
    let buffer: SerializedNode[] = [];
    const flushBuffer = () => {
        if (buffer.length === 0) return;
        segments.push({ ...node, children: buffer });
        buffer = [];
    };
    for (const child of node.children) {
        const lifted = liftFromNode(child);
        for (const item of lifted) {
            if (item.type === "quran-block") {
                flushBuffer();
                segments.push(item);
            } else {
                buffer.push(item);
            }
        }
    }
    flushBuffer();
    return segments.length > 0 ? segments : [{ ...node, children: [] }];
}

function isUnsplittableContainer(node: SerializedNode): boolean {
    return node.type === "table" || node.type === "tablerow" || node.type === "tablecell";
}


interface QuranVerseLike {
    surah: number;
    ayah: number;
    arabic: string;
}

const QURAN_ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function toArabicNumerals(n: number): string {
    return String(n)
        .split("")
        .map((d) => {
            const code = d.charCodeAt(0) - 48;
            return code >= 0 && code <= 9 ? QURAN_ARABIC_DIGITS[code] : d;
        })
        .join("");
}

// Same fallback chain as QuranBlock.svelte's `nameFor`: tashkeel name, then
// the surah label store (Arabic, then English), then a plain "Surah N".
function surahDisplayName(surah: number): string {
    const labels = get(surahLabels);
    return (
        getSurahNameTashkeel(surah) ||
        labels[surah - 1]?.ar ||
        labels[surah - 1]?.en ||
        `Surah ${surah}`
    );
}

function quranBlockBlocks(node: SerializedNode): BlockChild[] {
    const verses = Array.isArray(node.verses) ? (node.verses as QuranVerseLike[]) : [];
    if (verses.length === 0) return [];

    const rawScale = typeof node.fontScale === "number" ? (node.fontScale as number) : 1;
    const fontScale = Number.isFinite(rawScale)
        ? Math.min(2.0, Math.max(0.7, rawScale))
        : 1;

    // Group consecutive verses by surah (mirrors QuranBlock.svelte's `groups` derivation).
    const groups: Array<{ surah: number; verses: QuranVerseLike[] }> = [];
    for (const v of verses) {
        const last = groups[groups.length - 1];
        if (last && last.surah === v.surah) last.verses.push(v);
        else groups.push({ surah: v.surah, verses: [v] });
    }

    const out: BlockChild[] = [];
    for (const group of groups) {
        out.push(surahBannerTable(surahDisplayName(group.surah)));
        out.push(versesParagraph(group.verses, fontScale));
    }
    out.push(bottomRuleTable());
    return out;
}

const QURAN_BANNER_TOTAL_DXA = 9000;
const QURAN_ORNAMENT_DXA = 600; // diamond cluster between arm and panel

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
const NO_BORDERS = {
    top: NO_BORDER,
    bottom: NO_BORDER,
    left: NO_BORDER,
    right: NO_BORDER,
} as const;
const NO_TABLE_BORDERS = {
    ...NO_BORDERS,
    insideHorizontal: NO_BORDER,
    insideVertical: NO_BORDER,
} as const;

// Estimate the banner panel width from the name so long surah names don't
// wrap: ~112 dxa per base (non-diacritic) character at 12pt Scheherazade,
// plus the panel's side margins, never narrower than the editor-like default.
function bannerPanelDxa(name: string): number {
    const baseChars = name.replace(/[ً-ٰٟۖ-ۭ]/g, "").length;
    return Math.min(4800, Math.max(2400, baseChars * 112 + 1500));
}

// Fading shades for the decorative arms, ordered page-edge → banner. The
// typst export draws the arms with a transparency gradient; DOCX borders
// can't take gradients, so each arm is stepped segments toward full gold.
const ARM_FADE_SHADES = ["F9F2E3", "F2E5C7", GOLD_LIGHT];

function armSegments(
    totalDxa: number,
    side: "left" | "right",
): { width: number; color: string }[] {
    const shades =
        side === "left" ? ARM_FADE_SHADES : [...ARM_FADE_SHADES].reverse();
    const seg = Math.floor(totalDxa / shades.length);
    return shades.map((color, i) => ({
        width: i === shades.length - 1 ? totalDxa - seg * (shades.length - 1) : seg,
        color,
    }));
}

// A horizontal gold rule, drawn as a paragraph bottom border so that —
// unlike a cell border — it sits near the vertical middle of the row,
// matching the editor's decorative arms. The trailing spacing shifts the
// centred paragraph (and thus the border under it) up toward the middle.
function armRuleCell(widthDxa: number, color: string = GOLD_LIGHT): TableCell {
    return new TableCell({
        width: { size: widthDxa, type: WidthType.DXA },
        verticalAlign: "center",
        borders: NO_BORDERS,
        children: [
            new Paragraph({
                spacing: { before: 0, after: 120 },
                border: {
                    bottom: {
                        style: BorderStyle.SINGLE,
                        size: 4,
                        color,
                        space: 0,
                    },
                },
                children: [],
            }),
        ],
    });
}

// The editor's small-large-small diamond cluster between the arms and the
// surah panel (and at the middle of the closing rule).
function ornamentCell(): TableCell {
    return new TableCell({
        width: { size: QURAN_ORNAMENT_DXA, type: WidthType.DXA },
        verticalAlign: "center",
        borders: NO_BORDERS,
        // Drop the default cell insets so the full cell width is usable, or the
        // margins squeeze the cluster into wrapping.
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        children: [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: [
                    // Non-breaking spaces (U+00A0) keep the three diamonds on one
                    // line — with ordinary spaces Word treats them as break
                    // opportunities and stacks the cluster vertically in the
                    // narrow cell.
                    new TextRun({ text: "◆", size: 10, color: GOLD_LIGHT }),
                    new TextRun({ text: "\u00A0◆\u00A0", size: 14, color: QUOTE_BORDER_COLOR }),
                    new TextRun({ text: "◆", size: 10, color: GOLD_LIGHT }),
                ],
            }),
        ],
    });
}

function surahBannerTable(name: string): Table {
    const panelDxa = bannerPanelDxa(name);
    const armDxa = Math.floor(
        (QURAN_BANNER_TOTAL_DXA - panelDxa - 2 * QURAN_ORNAMENT_DXA) / 2,
    );
    // Thin DOUBLE ring, matching the typst export's hairline outer + inner
    // border (size is in eighths of a point; space pads border from text).
    const panelBorder = {
        style: BorderStyle.DOUBLE,
        size: 4,
        color: QUOTE_BORDER_COLOR,
        space: 3,
    };
    const leftArm = armSegments(armDxa, "left");
    const rightArm = armSegments(armDxa, "right");
    const panelCell = new TableCell({
        width: { size: panelDxa, type: WidthType.DXA },
        verticalAlign: "center",
        borders: {
            top: panelBorder,
            bottom: panelBorder,
            left: panelBorder,
            right: panelBorder,
        },
        // Breathing room so the tall Arabic glyphs don't touch the ring
        // (mirrors the typst panel's x: 16pt / y: 6pt inset).
        margins: { top: 120, bottom: 120, left: 320, right: 320 },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: QUOTE_BG_FILL },
        children: [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                bidirectional: true,
                spacing: { before: 40, after: 40 },
                children: [
                    new TextRun({
                        text: name,
                        font: "Scheherazade New",
                        size: 24,
                        color: QUOTE_TEXT_COLOR,
                        rightToLeft: true,
                    }),
                ],
            }),
        ],
    });
    return new Table({
        rows: [
            new TableRow({
                children: [
                    ...leftArm.map((s) => armRuleCell(s.width, s.color)),
                    ornamentCell(),
                    panelCell,
                    ornamentCell(),
                    ...rightArm.map((s) => armRuleCell(s.width, s.color)),
                ],
            }),
        ],
        columnWidths: [
            ...leftArm.map((s) => s.width),
            QURAN_ORNAMENT_DXA,
            panelDxa,
            QURAN_ORNAMENT_DXA,
            ...rightArm.map((s) => s.width),
        ],
        width: { size: QURAN_BANNER_TOTAL_DXA, type: WidthType.DXA },
        alignment: AlignmentType.CENTER,
        borders: NO_TABLE_BORDERS,
    });
}

// Rough character budget of one exported line at the given scale; used to
// decide whether the verses paragraph will wrap (14pt Scheherazade on a
// ~6.5" line fits roughly 90 characters of Arabic incl. diacritics).
function estimatedCharsPerLine(fontScale: number): number {
    return Math.round(90 / fontScale);
}

function versesParagraph(verses: QuranVerseLike[], fontScale: number): Paragraph {
    const verseSize = Math.round(28 * fontScale);
    const markerSize = Math.round(26 * fontScale);
    const children: ParagraphChild[] = [];
    let totalChars = 0;
    for (const v of verses) {
        totalChars += v.arabic.length + 6;
        children.push(
            new TextRun({
                text: v.arabic,
                font: "Scheherazade New",
                size: verseSize,
                color: QUOTE_TEXT_COLOR,
                rightToLeft: true,
            }),
            new TextRun({
                text: ` ⁠﴿⁠${toArabicNumerals(v.ayah)}⁠﴾⁠ `,
                font: "Scheherazade New",
                size: markerSize,
                color: GOLD_DARK,
                rightToLeft: true,
            }),
        );
    }
    // The editor justifies the block with a centred last line. DOCX has no
    // "center last line", so justify passages long enough to wrap and keep
    // short (single-line) blocks centred, which matches the editor exactly.
    const wraps = totalChars > estimatedCharsPerLine(fontScale);
    return new Paragraph({
        alignment: wraps ? AlignmentType.JUSTIFIED : AlignmentType.CENTER,
        bidirectional: true,
        // Roomy leading (1.4× single, mirroring the typst export) so
        // Scheherazade's diacritic stacks don't collide across wrapped
        // lines, plus breathing room against the banner and closing rule.
        spacing: {
            before: 200,
            after: 200,
            line: 336,
            lineRule: LineRuleType.AUTO,
        },
        children,
    });
}

function bottomRuleTable(): Table {
    // Mirrors the banner: two fading arms meeting a small diamond cluster in
    // the middle, aligned to the same overall width.
    const armDxa = Math.floor((QURAN_BANNER_TOTAL_DXA - QURAN_ORNAMENT_DXA) / 2);
    const leftArm = armSegments(armDxa, "left");
    const rightArm = armSegments(armDxa, "right");
    return new Table({
        rows: [
            new TableRow({
                children: [
                    ...leftArm.map((s) => armRuleCell(s.width, s.color)),
                    ornamentCell(),
                    ...rightArm.map((s) => armRuleCell(s.width, s.color)),
                ],
            }),
        ],
        columnWidths: [
            ...leftArm.map((s) => s.width),
            QURAN_ORNAMENT_DXA,
            ...rightArm.map((s) => s.width),
        ],
        width: { size: QURAN_BANNER_TOTAL_DXA, type: WidthType.DXA },
        alignment: AlignmentType.CENTER,
        borders: NO_TABLE_BORDERS,
    });
}
