// Converts a serialized Lexical editor state into Typst source that compiles
// to PDF. Mirrors lexicalToDocx's node coverage: headings, paragraphs, inline
// formats/styles, links, lists, quotes, code, Julia cells, equations
// (LaTeX translated to native Typst math — see latexToTypst.ts), images
// (referenced by file path, relative to the .typ; pathless sources get a
// deliberately missing placeholder path so the compile error prompts the
// user to fill it in), drawings/plots (embedded as base64 via
// @preview/based — they never exist as files), tables, Quran blocks and the
// reference list. The based package is only imported when actually used, and
// the TypstEditor auto-installs @preview imports.
import { get } from "svelte/store";
import {
    extractTauriAssetPath,
    liftQuranBlocksFromList,
    resolveImageSrc,
} from "./lexicalToDocx";
import { latexToTypstMath } from "./latexToTypst";
import { cssColorToHex } from "./docxInlineStyle";
import { sceneToDataUrl, type Scene } from "$lexical/core/plugins/Drawing/drawingScene";
import { getSurahNameTashkeel } from "$lib/data/surah-names-tashkeel";
import { surahLabels } from "$lib/stores/quran.svelte";
import { references } from "$lib/stores/references.store";
import {
    type BibStyle,
    type Reference,
    formatBibliographyEntry,
    isNumberedBibStyle,
    toBibtex,
} from "$lib/utils/references";

const QUOTE_TEXT_COLOR = "#707070"; // brand-charcoal-500
const QUOTE_BG_FILL = "#FBF5E8";    // brand-gold-50
const QUOTE_BORDER_COLOR = "#C8A96A"; // brand-gold-400
const GOLD_LIGHT = "#E5CC90";       // brand-gold-200
const GOLD_DARK = "#9A7A40";        // brand-gold-600
const HR_BORDER_COLOR = "#D1D5DB";
const HEADER_CELL_FILL = "#F0F0F0";
const TABLE_BORDER_COLOR = "#B9BEC6"; // subtle gray; Typst's default 1pt black is too heavy

const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 2;
const FORMAT_STRIKETHROUGH = 4;
const FORMAT_UNDERLINE = 8;
const FORMAT_CODE = 16;
const FORMAT_SUBSCRIPT = 32;
const FORMAT_SUPERSCRIPT = 64;

// Same as lexicalToDocx: node types that must become their own block when
// they unexpectedly nest inside a paragraph.
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
    listType: "bullet" | "number" | "check";
    level: number;
}

// Collects what the document body actually used, so the preamble only pulls
// in packages/assets that are needed.
interface TypstContext {
    usesBased: boolean;
    assets: string[];
    nextAssetId: number;
    /// Directory the .typ file will be saved into; image paths are made
    /// relative to it (Typst resolves paths relative to the compiled file).
    baseDir: string | null;
    placeholderCount: number;
    /// Native-citation plan (see planBibliography); null falls back to
    /// baking citations and the reference list as plain text.
    bib: BibPlan | null;
    /// Typst allows a single #bibliography per document.
    bibEmitted: boolean;
}

export interface TypstExportOptions {
    /// Directory the exported .typ will live in, used to relativize image
    /// file paths. Without it, absolute source paths are emitted as-is.
    baseDir?: string | null;
}

export async function lexicalStateToTypst(
    rootJson: SerializedNode,
    title: string,
    options: TypstExportOptions = {},
): Promise<string> {
    const flatChildren = liftQuranBlocksFromList(rootJson.children ?? []);
    const ctx: TypstContext = {
        usesBased: false,
        assets: [],
        nextAssetId: 1,
        baseDir: options.baseDir ?? null,
        placeholderCount: 0,
        bib: planBibliography(flatChildren),
        bibEmitted: false,
    };
    const blocks = await walkBlocks(flatChildren, null, ctx);

    const head: string[] = [];
    head.push(`// ${title.replace(/\s+/g, " ")} — exported from AyahLab`);
    if (ctx.usesBased) head.push(`#import "@preview/based:0.2.0": base64`);
    head.push("#set page(margin: 2.5cm)");
    head.push("#set text(size: 11pt)");
    if (ctx.assets.length > 0) {
        head.push("", "// Embedded assets", ...ctx.assets);
    }
    return head.join("\n") + "\n\n" + blocks.join("\n\n") + "\n";
}

// ── Escaping helpers ────────────────────────────────────────────────────────

// Escape one line of plain text for Typst markup mode. Also neutralizes the
// line-start list/heading/term markers; escaping them mid-line is harmless.
function escapeMarkup(s: string): string {
    return s
        .replace(/[\\#$*_`@<>~[\]]/g, (c) => "\\" + c)
        .replace(/^(\s*)([-+=/])/, "$1\\$2");
}

// A Typst string literal (code mode), quotes and backslashes escaped.
function typstStr(s: string): string {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function rgb(hex: string): string {
    return `rgb(${typstStr(hex)})`;
}

// Fenced raw block; the fence grows past any backtick run inside the code.
function codeFence(code: string, lang: string): string {
    const maxRun = (code.match(/`+/g) ?? []).reduce(
        (m, r) => Math.max(m, r.length),
        0,
    );
    const fence = "`".repeat(Math.max(3, maxRun + 1));
    return `${fence}${lang}\n${code}\n${fence}`;
}

// LaTeX equations are translated into native Typst math (no package needed).
function typstEquation(eq: string, inline: boolean): string {
    const converted = latexToTypstMath(eq);
    if (!converted) return "";
    // Inline math hugs its dollars; padding them with spaces makes it a
    // display equation in Typst.
    return inline ? `$${converted}$` : `$ ${converted} $`;
}

function bytesToBase64(bytes: Uint8Array): string {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}

// Register an embedded image and return the identifier to reference it with.
// Keeping the base64 blobs as #let bindings in the preamble keeps the body
// readable when the file is opened in the Typst editor.
function addImageAsset(
    ctx: TypstContext,
    b64: string,
    format: string,
    width?: string,
): string {
    ctx.usesBased = true;
    const name = `img_${ctx.nextAssetId++}`;
    const args = [`base64.decode("${b64}")`, `format: "${format}"`];
    if (width) args.push(`width: ${width}`);
    ctx.assets.push(`#let ${name} = image(${args.join(", ")})`);
    return name;
}

// ── Inline CSS style (color / size / font / highlight) ─────────────────────

interface InlineCss {
    color?: string;
    bg?: string;
    sizePt?: number;
    font?: string;
}

function parseInlineCss(style: unknown): InlineCss {
    if (typeof style !== "string" || !style) return {};
    const out: InlineCss = {};
    for (const decl of style.split(";")) {
        const idx = decl.indexOf(":");
        if (idx < 0) continue;
        const key = decl.slice(0, idx).trim().toLowerCase();
        const val = decl.slice(idx + 1).trim();
        if (!key || !val) continue;
        if (key === "color") {
            const hex = cssColorToHex(val);
            if (hex) out.color = "#" + hex;
        } else if (key === "background-color") {
            const hex = cssColorToHex(val);
            if (hex) out.bg = "#" + hex;
        } else if (key === "font-size") {
            const pt = cssLengthToPt(val);
            if (pt) out.sizePt = pt;
        } else if (key === "font-family") {
            const first = val.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
            if (first) out.font = first;
        }
    }
    return out;
}

function cssLengthToPt(value: string): number | undefined {
    const m = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|pt|em|rem)?$/i);
    if (!m) return undefined;
    const n = Number.parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    const unit = (m[2] ?? "px").toLowerCase();
    const pt = unit === "pt" ? n : unit === "px" ? n * 0.75 : n * 12;
    return Math.round(pt * 10) / 10;
}

// ── Block conversion ────────────────────────────────────────────────────────

async function walkBlocks(
    nodes: SerializedNode[],
    list: ListContext | null,
    ctx: TypstContext,
): Promise<string[]> {
    const out: string[] = [];
    for (const node of nodes) {
        const result = await blockForNode(node, list, ctx);
        if (Array.isArray(result)) out.push(...result);
        else if (result) out.push(result);
    }
    return out;
}

async function blockForNode(
    node: SerializedNode,
    list: ListContext | null,
    ctx: TypstContext,
): Promise<string | string[] | null> {
    switch (node.type) {
        case "heading": {
            const tag = (node.tag as string) ?? "h1";
            const level = Math.min(6, Math.max(1, Number(tag.slice(1)) || 1));
            const content = await inlineRuns(node.children ?? [], ctx);
            return `${"=".repeat(level)} ${content}`;
        }
        case "paragraph":
        case "extended-paragraph": {
            // Like lexicalToDocx: split paragraphs that nest block content.
            if ((node.children ?? []).some((c) => BLOCK_LEVEL_TYPES.has(c.type))) {
                return await paragraphContainerBlocks(node, list, ctx);
            }
            const content = await inlineRuns(node.children ?? [], ctx);
            return paragraphBlock(node, content);
        }
        case "blockquote":
        case "quote": {
            const content = await inlineRuns(node.children ?? [], ctx);
            return [
                `#block(width: 100%, fill: ${rgb(QUOTE_BG_FILL)}, stroke: (left: 2pt + ${rgb(QUOTE_BORDER_COLOR)}), inset: (x: 12pt, y: 8pt))[`,
                `  #set text(fill: ${rgb(QUOTE_TEXT_COLOR)}, style: "italic")`,
                `  ${content}`,
                `]`,
            ].join("\n");
        }
        case "horizontalrule":
        case "horizontal-rule": {
            return `#line(length: 100%, stroke: 0.5pt + ${rgb(HR_BORDER_COLOR)})`;
        }
        case "list": {
            const lines = await listLines(node, list ? list.level + 1 : 0, ctx);
            return lines.length > 0 ? lines.join("\n") : null;
        }
        case "image": {
            return imageBlock(node, ctx);
        }
        case "drawing": {
            return await drawingBlock(node, ctx);
        }
        case "code": {
            const code =
                typeof node.code === "string" ? node.code : codeTextFromChildren(node);
            const language = typeof node.language === "string" ? node.language : "";
            return codeFence(code, language);
        }
        case "julia-cell": {
            return await juliaCellBlocks(node, ctx);
        }
        case "equation": {
            const eq = (node.equation as string) ?? "";
            const inline = (node.inline as boolean) ?? false;
            return typstEquation(eq, inline) || null;
        }
        case "table": {
            return await tableBlock(node, ctx);
        }
        case "quran-block": {
            return quranBlockBlocks(node);
        }
        case "reference-list": {
            if (ctx.bib) {
                // Typst allows one #bibliography per document; ignore any
                // stray duplicate reference-list nodes.
                if (ctx.bibEmitted) return null;
                ctx.bibEmitted = true;
                return bibliographyBlock(ctx.bib);
            }
            return referenceListBlocks(node);
        }
        case "tablerow":
        case "tablecell": {
            return null;
        }
        default: {
            if (node.children && node.children.length > 0) {
                return await walkBlocks(node.children, list, ctx);
            }
            return null;
        }
    }
}

// Wrap a paragraph's inline content with its alignment / indent / text-indent.
function paragraphBlock(node: SerializedNode, content: string): string {
    if (!content.trim()) {
        // Preserve intentionally blank lines as vertical space.
        return "#v(0.65em)";
    }
    const styleStr = typeof node.style === "string" ? (node.style as string) : "";
    const firstLinePt = firstLineIndentPt(styleStr);
    let out = (firstLinePt ? `#h(${firstLinePt}pt)` : "") + content;
    const format = node.format;
    const align =
        format === "center"
            ? "center"
            : format === "right" || format === "end"
                ? "right"
                : null;
    if (align) out = `#align(${align})[${out}]`;
    const indent =
        typeof node.indent === "number" && node.indent > 0 ? (node.indent as number) : 0;
    if (indent) out = `#pad(left: ${indent * 30}pt)[${out}]`; // 40px editor indent ≈ 30pt
    return out;
}

function firstLineIndentPt(style: string): number | undefined {
    const value = style
        .split(";")
        .map((decl) => decl.trim())
        .find((decl) => decl.toLowerCase().startsWith("text-indent:"))
        ?.split(":")
        .slice(1)
        .join(":")
        .trim();
    if (!value) return undefined;
    return cssLengthToPt(value);
}

// Paragraph that unexpectedly nests block-level children: group consecutive
// inline children into their own paragraphs and emit nested blocks standalone.
async function paragraphContainerBlocks(
    node: SerializedNode,
    list: ListContext | null,
    ctx: TypstContext,
): Promise<string[]> {
    const out: string[] = [];
    let inlineBuffer: SerializedNode[] = [];
    const flushInline = async () => {
        if (inlineBuffer.length === 0) return;
        out.push(paragraphBlock(node, await inlineRuns(inlineBuffer, ctx)));
        inlineBuffer = [];
    };
    for (const child of node.children ?? []) {
        if (BLOCK_LEVEL_TYPES.has(child.type)) {
            await flushInline();
            const block = await blockForNode(child, list, ctx);
            if (Array.isArray(block)) out.push(...block);
            else if (block) out.push(block);
        } else {
            inlineBuffer.push(child);
        }
    }
    await flushInline();
    return out;
}

// ── Lists ───────────────────────────────────────────────────────────────────

async function listLines(
    node: SerializedNode,
    level: number,
    ctx: TypstContext,
): Promise<string[]> {
    const listType = (node.listType as string) ?? "bullet";
    const marker = listType === "number" ? "+" : "-";
    const lines: string[] = [];
    for (const child of node.children ?? []) {
        if (child.type !== "listitem") continue;
        const inlineChildren: SerializedNode[] = [];
        const nestedLists: SerializedNode[] = [];
        for (const grandchild of child.children ?? []) {
            if (grandchild.type === "list") nestedLists.push(grandchild);
            else inlineChildren.push(grandchild);
        }
        const checkbox =
            listType === "check" ? (child.checked === true ? "☑ " : "☐ ") : "";
        const content = await inlineRuns(inlineChildren, ctx);
        lines.push(`${"  ".repeat(level)}${marker} ${checkbox}${content}`);
        for (const nested of nestedLists) {
            lines.push(...(await listLines(nested, level + 1, ctx)));
        }
    }
    return lines;
}

// ── Inline conversion ───────────────────────────────────────────────────────

async function inlineRuns(
    nodes: SerializedNode[],
    ctx: TypstContext,
): Promise<string> {
    let out = "";
    for (const node of nodes) {
        out += await inlineForNode(node, ctx);
    }
    return out;
}

async function inlineForNode(
    node: SerializedNode,
    ctx: TypstContext,
): Promise<string> {
    switch (node.type) {
        case "text": {
            return textNodeToTypst(node);
        }
        case "linebreak":
            return "\\ "; // Typst linebreak: backslash followed by whitespace
        case "tab":
            return "#h(2em)";
        case "link":
        case "autolink": {
            const url = (node.url as string) ?? "";
            const children = await inlineRuns(node.children ?? [], ctx);
            return `#link(${typstStr(url)})[${children || escapeMarkup(url)}]`;
        }
        case "citation": {
            // Native Typst citation when the reference resolves: numbering /
            // formatting then comes from the #bibliography style, and the
            // citation links to its entry. "narrative" keeps its in-prose form.
            const refId = typeof node.refId === "string" ? (node.refId as string) : "";
            const key = ctx.bib?.citeKeyByRefId.get(refId);
            if (key) {
                const prose = node.styleId === "narrative";
                return `#cite(label(${typstStr(key)})${prose ? `, form: "prose"` : ""})`;
            }
            const citationText = (node.text as string) ?? "";
            return citationText ? escapeMarkup(citationText) : "";
        }
        case "equation": {
            const eq = (node.equation as string) ?? "";
            const inline = (node.inline as boolean) ?? true;
            return typstEquation(eq, inline);
        }
        case "image": {
            // Inline position can't carry the placeholder hint comment (a
            // `//` would eat the rest of the line); the missing-file compile
            // error still points at the placeholder path.
            return `#box(${imageCallFromNode(node, ctx).call})`;
        }
        case "drawing": {
            const name = await drawingAssetFromNode(node, ctx);
            if (name) return `#box(${name})`;
            return `#emph[\\[Drawing\\]]`;
        }
        default: {
            if (node.children && node.children.length > 0) {
                return await inlineRuns(node.children, ctx);
            }
            return "";
        }
    }
}

function textNodeToTypst(node: SerializedNode): string {
    const text = (node.text as string) ?? "";
    const format = (node.format as number) ?? 0;
    let out: string;
    if ((format & FORMAT_CODE) !== 0) {
        out = `#raw(${typstStr(text)})`;
    } else {
        out = text.split("\n").map(escapeMarkup).join(" \\ ");
    }
    if ((format & FORMAT_BOLD) !== 0) out = `#strong[${out}]`;
    if ((format & FORMAT_ITALIC) !== 0) out = `#emph[${out}]`;
    if ((format & FORMAT_UNDERLINE) !== 0) out = `#underline[${out}]`;
    if ((format & FORMAT_STRIKETHROUGH) !== 0) out = `#strike[${out}]`;
    if ((format & FORMAT_SUBSCRIPT) !== 0) out = `#sub[${out}]`;
    if ((format & FORMAT_SUPERSCRIPT) !== 0) out = `#super[${out}]`;
    const css = parseInlineCss(node.style);
    const textArgs: string[] = [];
    if (css.color) textArgs.push(`fill: ${rgb(css.color)}`);
    if (css.sizePt) textArgs.push(`size: ${css.sizePt}pt`);
    if (css.font) textArgs.push(`font: ${typstStr(css.font)}`);
    if (textArgs.length > 0) out = `#text(${textArgs.join(", ")})[${out}]`;
    if (css.bg) out = `#highlight(fill: ${rgb(css.bg)})[${out}]`;
    return out;
}

// ── Images / drawings ───────────────────────────────────────────────────────

// Largest width (pt) an image may occupy; the content area with 2.5cm
// margins on A4 is ~455pt.
const TYPST_IMAGE_MAX_WIDTH_PT = 400;

function imageWidthArg(node: SerializedNode): string {
    const widthRaw = node.width;
    const widthPt =
        typeof widthRaw === "number" && widthRaw > 0
            ? Math.min(Math.round(widthRaw * 0.75), TYPST_IMAGE_MAX_WIDTH_PT)
            : undefined;
    return widthPt !== undefined ? `, width: ${widthPt}pt` : "";
}

// Extract a filesystem path from the image src, when it points at a file at
// all (Tauri asset protocol, file:// URL, or a plain absolute path).
function imageFsPath(src: string): string | null {
    const tauriPath = extractTauriAssetPath(src);
    if (tauriPath) return tauriPath;
    if (src.startsWith("file://")) {
        try {
            return decodeURI(src.replace(/^file:\/\//, ""));
        } catch {
            return src.replace(/^file:\/\//, "");
        }
    }
    if (src.startsWith("/") || /^[A-Za-z]:[\\/]/.test(src)) return src;
    return null;
}

// Relative path from the .typ file's directory to the image file, "/"
// separated for Typst. Returns null when no relative path exists (different
// Windows drives).
function relativePath(fromDir: string, toFile: string): string | null {
    const a = fromDir.replace(/\\/g, "/").split("/").filter(Boolean);
    const b = toFile.replace(/\\/g, "/").split("/").filter(Boolean);
    const isDrive = (s: string | undefined) => /^[A-Za-z]:$/.test(s ?? "");
    if (
        (isDrive(a[0]) || isDrive(b[0])) &&
        a[0]?.toLowerCase() !== b[0]?.toLowerCase()
    ) {
        return null;
    }
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const ups = a.length - i;
    return [...Array<string>(ups).fill(".."), ...b.slice(i)].join("/");
}

interface ImageCall {
    call: string; // image("…", width: …)
    /// Set when the source had no file path; a comment telling the user to
    /// point the placeholder at the real file.
    hint?: string;
}

// Images are referenced by file path so the .typ stays human-editable.
// When the editor only holds a pathless source (pasted data URL, blob,
// remote URL), a deliberately missing placeholder path is emitted — the
// compile error tells the user exactly which path to fill in.
function imageCallFromNode(node: SerializedNode, ctx: TypstContext): ImageCall {
    const src = (node.src as string) ?? "";
    const altText = (node.altText as string) ?? "";
    const widthArg = imageWidthArg(node);

    const fsPath = imageFsPath(src);
    if (fsPath) {
        const path = ctx.baseDir
            ? (relativePath(ctx.baseDir, fsPath) ?? fsPath)
            : fsPath;
        return { call: `image(${typstStr(path)}${widthArg})` };
    }

    ctx.placeholderCount++;
    const extMatch = src.match(/^data:image\/(png|jpe?g|gif|svg|webp)/i);
    const ext = extMatch ? extMatch[1].replace("jpeg", "jpg").toLowerCase() : "png";
    const placeholder = `MISSING-IMAGE-PATH-${ctx.placeholderCount}.${ext}`;
    const sourceKind = src.startsWith("data:")
        ? "a data URL"
        : src.startsWith("blob:")
            ? "an in-memory blob"
            : src
                ? `"${src.slice(0, 100)}"`
                : "empty";
    return {
        call: `image(${typstStr(placeholder)}${widthArg})`,
        hint:
            `TODO: replace "${placeholder}" with the image's real file path` +
            (altText ? ` (alt: ${altText})` : "") +
            ` — the editor stored ${sourceKind}, not a file.`,
    };
}

function imageBlock(node: SerializedNode, ctx: TypstContext): string {
    const { call, hint } = imageCallFromNode(node, ctx);
    const line = `#align(center)[#${call}]`;
    return hint ? `// ${hint}\n${line}` : line;
}

// A drawing carries an editable scene model; render it to SVG and embed it
// (Typst renders SVG natively, so no rasterization is needed).
async function drawingAssetFromNode(
    node: SerializedNode,
    ctx: TypstContext,
): Promise<string | null> {
    const scene = node.scene as Scene | undefined;
    if (!scene || !Array.isArray(scene.shapes)) return null;
    const data = await resolveImageSrc(sceneToDataUrl(scene));
    if (!data) return null;
    const widthRaw = node.width;
    const widthPt =
        typeof widthRaw === "number" && widthRaw > 0
            ? Math.min(Math.round(widthRaw * 0.75), TYPST_IMAGE_MAX_WIDTH_PT)
            : undefined;
    return addImageAsset(
        ctx,
        bytesToBase64(data),
        "svg",
        widthPt !== undefined ? `${widthPt}pt` : undefined,
    );
}

async function drawingBlock(node: SerializedNode, ctx: TypstContext): Promise<string> {
    const name = await drawingAssetFromNode(node, ctx);
    if (name) return `#align(center)[#${name}]`;
    return `#emph[\\[Drawing\\]]`;
}

// ── Code helpers ────────────────────────────────────────────────────────────

// Fallback for code blocks that serialize their text as highlight-token
// children instead of a `code` property.
function codeTextFromChildren(node: SerializedNode): string {
    let out = "";
    const walk = (n: SerializedNode) => {
        if (n.type === "linebreak") {
            out += "\n";
            return;
        }
        if (typeof n.text === "string") out += n.text;
        for (const child of n.children ?? []) walk(child);
    };
    for (const child of node.children ?? []) walk(child);
    return out;
}

// Export a Julia code cell honouring its on-screen display mode, matching
// the DOCX export: source, output, or both. Static plot snapshots (the
// base64 the cell captured) are embedded; live interactive state isn't
// available in a standalone file, so those fall back to a placeholder.
async function juliaCellBlocks(
    node: SerializedNode,
    ctx: TypstContext,
): Promise<string[]> {
    const displayMode = (node.displayMode as string) ?? "both";
    const code = (node.code as string) ?? "";
    const output = (node.output as string) ?? "";
    const plots = Array.isArray(node.plots)
        ? (node.plots as { format: string; data?: string; url?: string }[])
        : [];

    const out: string[] = [];
    if (displayMode !== "output") {
        out.push(codeFence(code, "julia"));
    }
    if (displayMode !== "code") {
        if (output) out.push(codeFence(output, ""));
        for (const plot of plots) {
            if (plot.data) {
                const format = plot.format === "svg" ? "svg" : "png";
                const name = addImageAsset(ctx, plot.data, format, "100%");
                out.push(`#align(center)[#${name}]`);
            } else if (plot.format === "plotly" || plot.format === "html") {
                out.push(`#emph[\\[Interactive plot omitted\\]]`);
            }
        }
    }
    return out;
}

// ── Tables ──────────────────────────────────────────────────────────────────

const DEFAULT_CELL_PX = 120;

async function tableBlock(node: SerializedNode, ctx: TypstContext): Promise<string> {
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
    const columns: string[] = [];
    for (let i = 0; i < totalCols; i++) {
        const px =
            typeof colWidthsPx[i] === "number" && colWidthsPx[i] > 0
                ? colWidthsPx[i]
                : DEFAULT_CELL_PX;
        columns.push(`${Math.round(px * 0.75)}pt`);
    }

    const cellLines: string[] = [];
    for (const rowNode of rowDefs) {
        const rowCells: string[] = [];
        for (const cellNode of rowNode.children ?? []) {
            if (cellNode.type !== "tablecell") continue;
            rowCells.push(await tableCellToTypst(cellNode, ctx));
        }
        if (rowCells.length > 0) cellLines.push(`  ${rowCells.join(", ")},`);
    }

    const table = [
        `#table(`,
        `  columns: (${columns.join(", ")}),`,
        `  stroke: 0.5pt + ${rgb(TABLE_BORDER_COLOR)},`,
        ...cellLines,
        `)`,
    ].join("\n");

    const format = node.format;
    if (format === "center") return `#align(center)[${table}]`;
    if (format === "right" || format === "end") return `#align(right)[${table}]`;
    return table;
}

async function tableCellToTypst(
    cellNode: SerializedNode,
    ctx: TypstContext,
): Promise<string> {
    const blocks = await walkBlocks(cellNode.children ?? [], null, ctx);
    let content = blocks.join("\n\n");
    const headerState =
        typeof cellNode.headerState === "number" ? (cellNode.headerState as number) : 0;
    if (headerState !== 0) content = `#strong[${content}]`;

    const args: string[] = [];
    const colSpan =
        typeof cellNode.colSpan === "number" && (cellNode.colSpan as number) > 1
            ? (cellNode.colSpan as number)
            : 0;
    const rowSpan =
        typeof cellNode.rowSpan === "number" && (cellNode.rowSpan as number) > 1
            ? (cellNode.rowSpan as number)
            : 0;
    if (colSpan) args.push(`colspan: ${colSpan}`);
    if (rowSpan) args.push(`rowspan: ${rowSpan}`);
    const backgroundColor =
        typeof cellNode.backgroundColor === "string"
            ? cssColorToHex(cellNode.backgroundColor as string)
            : null;
    const fill = backgroundColor
        ? "#" + backgroundColor
        : headerState !== 0
            ? HEADER_CELL_FILL
            : null;
    if (fill) args.push(`fill: ${rgb(fill)}`);

    return args.length > 0
        ? `table.cell(${args.join(", ")})[${content}]`
        : `[${content}]`;
}

// ── Reference list ──────────────────────────────────────────────────────────

// Typst's built-in citation styles, keyed by the app's bibliography styles.
const TYPST_BIB_STYLE: Record<BibStyle, string> = {
    apa: "apa",
    mla: "mla",
    chicago: "chicago-author-date",
    ieee: "ieee",
    harvard: "harvard-cite-them-right",
};

interface BibPlan {
    citeKeyByRefId: Map<string, string>;
    bibtex: string;
    style: BibStyle;
}

// Decide whether the document can use Typst's native citation system:
// citations become #cite(label(…)) tied to a #bibliography() whose BibTeX is
// embedded in the file. Requires a reference-list node and that every cited
// or listed refId resolves to a library reference with a unique cite key —
// otherwise return null and everything is baked as plain text instead.
function planBibliography(nodes: SerializedNode[]): BibPlan | null {
    let refList: SerializedNode | null = null;
    const citedIds: string[] = [];
    const walk = (n: SerializedNode) => {
        if (n.type === "reference-list" && !refList) refList = n;
        if (n.type === "citation" && typeof n.refId === "string") {
            citedIds.push(n.refId as string);
        }
        for (const child of n.children ?? []) walk(child);
    };
    for (const n of nodes) walk(n);
    if (!refList) return null;

    const listNode = refList as SerializedNode;
    const listIds = Array.isArray(listNode.refIds)
        ? (listNode.refIds as string[])
        : [];
    const allIds = [...new Set([...listIds, ...citedIds])];
    if (allIds.length === 0) return null;

    const byId = new Map(get(references).map((r) => [r.id, r]));
    const refs: Reference[] = [];
    const citeKeyByRefId = new Map<string, string>();
    const usedKeys = new Set<string>();
    for (const id of allIds) {
        const ref = byId.get(id);
        // Unresolvable or key-less/duplicate-key references would break the
        // compile — fall back to the static rendering for the whole document.
        if (!ref || !ref.citeKey || usedKeys.has(ref.citeKey)) return null;
        usedKeys.add(ref.citeKey);
        refs.push(ref);
        citeKeyByRefId.set(id, ref.citeKey);
    }

    const style = (
        typeof listNode.style === "string" ? listNode.style : "apa"
    ) as BibStyle;
    try {
        return { citeKeyByRefId, bibtex: toBibtex(refs), style };
    } catch {
        // A malformed library entry (e.g. persisted by an older app version)
        // must not kill the export — fall back to static rendering.
        return null;
    }
}

function bibliographyBlock(bib: BibPlan): string {
    // typstStr escapes backslashes/quotes; newlines are then folded into \n
    // escapes so the BibTeX rides inside a single-line Typst string.
    const src = typstStr(bib.bibtex).replace(/\n/g, "\\n");
    const style = TYPST_BIB_STYLE[bib.style] ?? "apa";
    return `#bibliography(bytes(${src}), style: ${typstStr(style)}, title: "References", full: true)`;
}

// Static fallback: bake the formatted entries as plain paragraphs (used when
// native citations aren't possible, e.g. a cited reference is missing from
// the library).
function referenceListBlocks(node: SerializedNode): string[] {
    const refIds = Array.isArray(node.refIds) ? (node.refIds as string[]) : [];
    const style = (typeof node.style === "string" ? node.style : "apa") as BibStyle;

    const byId = new Map(get(references).map((r) => [r.id, r]));
    const entries = refIds
        .map((id) => byId.get(id))
        .filter((r): r is Reference => !!r);

    const out: string[] = ["== References"];
    const numbered = isNumberedBibStyle(style);
    entries.forEach((ref, i) => {
        const text = formatBibliographyEntry(ref, style);
        const line = numbered ? `[${i + 1}] ${text}` : text;
        out.push(`#par(hanging-indent: 14pt)[${escapeMarkup(line)}]`);
    });
    return out;
}

// ── Quran block ─────────────────────────────────────────────────────────────

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

// Same fallback chain as QuranBlock.svelte / lexicalToDocx.
function surahDisplayName(surah: number): string {
    const labels = get(surahLabels);
    return (
        getSurahNameTashkeel(surah) ||
        labels[surah - 1]?.ar ||
        labels[surah - 1]?.en ||
        `Surah ${surah}`
    );
}

function ornament(): string {
    return `text(size: 7pt, fill: ${rgb(QUOTE_BORDER_COLOR)})[◆]`;
}

// Decorative arm: a hairline that fades toward the page edge, so the banner
// appears to emerge from the background like the editor's gradient arms.
// `fade` names the side of the banner the arm sits on.
function armRule(fade: "left" | "right"): string {
    const solid = rgb(GOLD_LIGHT);
    const transparent = rgb(GOLD_LIGHT + "00");
    const stops =
        fade === "left"
            ? `${transparent}, ${solid}`
            : `${solid}, ${transparent}`;
    return `line(length: 100%, stroke: 0.5pt + gradient.linear(${stops}))`;
}

// Decorative banner: fading gold arms — diamond — bordered surah-name panel —
// diamond — fading gold arms, mirroring the editor and the DOCX export.
// The panel is a thin double border (hairline gold outer ring around a
// lighter inner ring), like the editor's outer border + inset inner border.
// `top-edge: "bounds"` makes the box wrap the full ink extent of the Arabic
// glyphs — with the default cap-height edge, the tall diacritics poke into
// the border.
function surahBanner(name: string): string {
    return [
        `#block(width: 100%, above: 1.2em, below: 0.8em)[`,
        `  #grid(`,
        `    columns: (1fr, auto, auto, auto, 1fr),`,
        `    align: horizon,`,
        `    column-gutter: 6pt,`,
        `    ${armRule("left")},`,
        `    ${ornament()},`,
        `    box(stroke: 0.6pt + ${rgb(QUOTE_BORDER_COLOR)}, radius: 4pt, inset: 2.5pt)[`,
        `      #box(stroke: 0.5pt + ${rgb(GOLD_LIGHT)}, radius: 2.5pt, fill: ${rgb(QUOTE_BG_FILL)}, inset: (x: 16pt, y: 6pt))[`,
        `        #text(font: "Scheherazade New", size: 12pt, fill: ${rgb(QUOTE_TEXT_COLOR)}, top-edge: "bounds", bottom-edge: "bounds")[${escapeMarkup(name)}]`,
        `      ]`,
        `    ],`,
        `    ${ornament()},`,
        `    ${armRule("right")},`,
        `  )`,
        `]`,
    ].join("\n");
}

function versesBlock(verses: QuranVerseLike[], fontScale: number): string {
    const verseSize = Math.round(14 * fontScale * 10) / 10;
    const markerSize = Math.round(13 * fontScale * 10) / 10;
    const parts = verses.map(
        (v) =>
            `${escapeMarkup(v.arabic)} #text(size: ${markerSize}pt, fill: ${rgb(GOLD_DARK)})[﴿${toArabicNumerals(v.ayah)}﴾]`,
    );
    return [
        // The y-inset keeps the verses from sitting cramped against the
        // banner above and the closing rule below.
        `#block(width: 100%, inset: (y: 0.9em))[`,
        `  #set text(font: "Scheherazade New", size: ${verseSize}pt, fill: ${rgb(QUOTE_TEXT_COLOR)}, lang: "ar", dir: rtl)`,
        // Typst's default 0.65em leading makes Scheherazade's diacritic
        // stacks collide across wrapped lines; give the verses roomy leading.
        `  #set par(justify: true, leading: 1.4em)`,
        `  ${parts.join(" ")}`,
        `]`,
    ].join("\n");
}

function bottomRule(): string {
    return [
        `#block(width: 100%, above: 0.8em, below: 1.2em)[`,
        `  #grid(`,
        `    columns: (1fr, auto, 1fr),`,
        `    align: horizon,`,
        `    column-gutter: 6pt,`,
        `    ${armRule("left")},`,
        `    text(size: 7pt, fill: ${rgb(QUOTE_BORDER_COLOR)})[◆ ◆ ◆],`,
        `    ${armRule("right")},`,
        `  )`,
        `]`,
    ].join("\n");
}

function quranBlockBlocks(node: SerializedNode): string[] {
    const verses = Array.isArray(node.verses) ? (node.verses as QuranVerseLike[]) : [];
    if (verses.length === 0) return [];

    const rawScale = typeof node.fontScale === "number" ? (node.fontScale as number) : 1;
    const fontScale = Number.isFinite(rawScale)
        ? Math.min(2.0, Math.max(0.7, rawScale))
        : 1;

    // Group consecutive verses by surah (mirrors QuranBlock.svelte).
    const groups: Array<{ surah: number; verses: QuranVerseLike[] }> = [];
    for (const v of verses) {
        const last = groups[groups.length - 1];
        if (last && last.surah === v.surah) last.verses.push(v);
        else groups.push({ surah: v.surah, verses: [v] });
    }

    const out: string[] = [];
    for (const group of groups) {
        out.push(surahBanner(surahDisplayName(group.surah)));
        out.push(versesBlock(group.verses, fontScale));
    }
    out.push(bottomRule());
    return out;
}
