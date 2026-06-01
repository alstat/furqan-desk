import {
    AlignmentType,
    BorderStyle,
    Document,
    ExternalHyperlink,
    HeadingLevel,
    ImageRun,
    LevelFormat,
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
import { codeBlockParagraphs } from "./docxCodeHighlight";
import { cssColorToHex, textRunStyleFromNode } from "./docxInlineStyle";
import { getSurahNameTashkeel } from "$lib/data/surah-names-tashkeel";
import { juliaPlotIframes } from "$lib/stores/julia-notebook";

type BlockChild = Paragraph | Table;
type InlineStyle = { italic?: boolean; defaultColor?: string };

const QUOTE_TEXT_COLOR = "707070"; // brand-charcoal-500
const QUOTE_BG_FILL = "FBF5E8";    // brand-gold-50
const QUOTE_BORDER_COLOR = "C8A96A"; // brand-gold-400

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
                {
                    reference: CHECK_REF,
                    levels: buildBulletLevels(),
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
    console.log("[docx-export] blockForNode type=", node.type);
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
            return new Paragraph({
                children,
                ...paragraphOptionsFromNode(node, list),
                indent: { left: 360 },
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
            console.log("[docx-export] quran-block node:", JSON.stringify(node));
            const blocks = quranBlockBlocks(node);
            console.log("[docx-export] quran-block produced", blocks.length, "blocks");
            return blocks;
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

    out.push(
        new Paragraph({
            children: [...prefix, ...runs],
            ...paragraphOptionsFromNode(item, ctx, { includeBlockIndent: false }),
            numbering: { reference: ctx.reference, level: Math.min(ctx.level, 5) },
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
            return [
                new TextRun({
                    ...styleOpts,
                    text,
                    bold: (format & FORMAT_BOLD) !== 0 || undefined,
                    italics: italic || undefined,
                    strike: (format & FORMAT_STRIKETHROUGH) !== 0 || undefined,
                    underline: (format & FORMAT_UNDERLINE) !== 0 ? {} : undefined,
                    subScript: (format & FORMAT_SUBSCRIPT) !== 0 || undefined,
                    superScript: (format & FORMAT_SUPERSCRIPT) !== 0 || undefined,
                    ...((format & FORMAT_CODE) !== 0 ? { font: "Courier New" } : {}),
                }),
            ];
        }
        case "linebreak":
            return [new TextRun({ break: 1 })];
        case "tab":
            return [new TextRun({ text: "\t" })];
        case "link":
        case "autolink": {
            const url = (node.url as string) ?? "";
            const children = await inlineRuns(node.children ?? [], style);
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
    let doc: Document | null;
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

function extractTauriAssetPath(src: string): string | null {
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

function detectImageType(
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

// ── Quran block ─────────────────────────────────────────────────────────────

// Lift `quran-block` decorator nodes out of their parents so they sit at the
// root level for the block-walker. Lexical's DecoratorNode is inline by
// default, so QuranBlockNode commonly nests inside a paragraph alongside
// other inline content; the parent is split at each quran-block boundary so
// the document order — text, block, more text, another block — is preserved.
// Table containers are left intact (we don't fragment table cells).
function liftQuranBlocksFromList(nodes: SerializedNode[]): SerializedNode[] {
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
        out.push(surahBannerTable(getSurahNameTashkeel(group.surah)));
        out.push(versesParagraph(group.verses, fontScale));
    }
    out.push(bottomRuleTable());
    return out;
}

const QURAN_BANNER_TOTAL_DXA = 9000;
const QURAN_BANNER_PANEL_DXA = 2400;

function surahBannerTable(name: string): Table {
    const armDxa = Math.floor((QURAN_BANNER_TOTAL_DXA - QURAN_BANNER_PANEL_DXA) / 2);
    const armRule = {
        style: BorderStyle.SINGLE,
        size: 4,
        color: QUOTE_BORDER_COLOR,
        space: 0,
    };
    const panelBorder = {
        style: BorderStyle.SINGLE,
        size: 6,
        color: QUOTE_BORDER_COLOR,
        space: 0,
    };
    const armCell = (): TableCell =>
        new TableCell({
            width: { size: armDxa, type: WidthType.DXA },
            verticalAlign: "center",
            borders: {
                top: { style: BorderStyle.NONE, size: 0, color: "auto" },
                bottom: armRule,
                left: { style: BorderStyle.NONE, size: 0, color: "auto" },
                right: { style: BorderStyle.NONE, size: 0, color: "auto" },
            },
            children: [new Paragraph({ children: [] })],
        });
    const panelCell = new TableCell({
        width: { size: QURAN_BANNER_PANEL_DXA, type: WidthType.DXA },
        verticalAlign: "center",
        borders: {
            top: panelBorder,
            bottom: panelBorder,
            left: panelBorder,
            right: panelBorder,
        },
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
                        size: 28,
                        rightToLeft: true,
                    }),
                ],
            }),
        ],
    });
    return new Table({
        rows: [new TableRow({ children: [armCell(), panelCell, armCell()] })],
        columnWidths: [armDxa, QURAN_BANNER_PANEL_DXA, armDxa],
        width: { size: QURAN_BANNER_TOTAL_DXA, type: WidthType.DXA },
        alignment: AlignmentType.CENTER,
        borders: {
            top: { style: BorderStyle.NONE, size: 0, color: "auto" },
            bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
            left: { style: BorderStyle.NONE, size: 0, color: "auto" },
            right: { style: BorderStyle.NONE, size: 0, color: "auto" },
            insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
        },
    });
}

function versesParagraph(verses: QuranVerseLike[], fontScale: number): Paragraph {
    const verseSize = Math.round(28 * fontScale);
    const markerSize = Math.round(26 * fontScale);
    const children: ParagraphChild[] = [];
    for (const v of verses) {
        children.push(
            new TextRun({
                text: v.arabic,
                font: "Scheherazade New",
                size: verseSize,
                rightToLeft: true,
            }),
            new TextRun({
                text: ` ⁠﴿⁠${toArabicNumerals(v.ayah)}⁠﴾⁠ `,
                font: "Scheherazade New",
                size: markerSize,
                color: QUOTE_BORDER_COLOR,
                rightToLeft: true,
            }),
        );
    }
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: true,
        spacing: { before: 120, after: 120 },
        children,
    });
}

function bottomRuleTable(): Table {
    // Mirrors the surah banner's arm width so the closing rule visually aligns
    // with the banner above it.
    const rule = {
        style: BorderStyle.SINGLE,
        size: 4,
        color: QUOTE_BORDER_COLOR,
        space: 0,
    };
    const cell = new TableCell({
        width: { size: QURAN_BANNER_TOTAL_DXA, type: WidthType.DXA },
        borders: {
            top: { style: BorderStyle.NONE, size: 0, color: "auto" },
            bottom: rule,
            left: { style: BorderStyle.NONE, size: 0, color: "auto" },
            right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        },
        children: [new Paragraph({ children: [], spacing: { before: 0, after: 60 } })],
    });
    return new Table({
        rows: [new TableRow({ children: [cell] })],
        columnWidths: [QURAN_BANNER_TOTAL_DXA],
        width: { size: QURAN_BANNER_TOTAL_DXA, type: WidthType.DXA },
        alignment: AlignmentType.CENTER,
        borders: {
            top: { style: BorderStyle.NONE, size: 0, color: "auto" },
            bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
            left: { style: BorderStyle.NONE, size: 0, color: "auto" },
            right: { style: BorderStyle.NONE, size: 0, color: "auto" },
            insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
        },
    });
}
