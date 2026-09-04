/**
 * Exports an annotated lesson — its cards, the reader's floating comments
 * and prompts, and the links between them — as a standalone `.svg`/`.pdf`.
 *
 * Self-contained: modeled on the Workbook's own `workbookToSvg`/`exportPdf`
 * (see `src/lib/stores/workbook.store.ts` and
 * `src/lib/components/workbook/WorkbookBoard.svelte`) but does not import
 * from or write into the Workbook's own document model.
 */

import { escapeXml } from "$lib/stores/workbook.store";
import { linkPath, linkEndpoints } from "./annotation-layout";

export interface ExportBox {
    /** Matches the annotation's `anchorKind`/`section:<id>` key for links. */
    key: string;
    title: string;
    body: string;
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface ExportAnnotation extends ExportBox {
    anchorKey: string;
}

/** Breaks a string into lines that fit `chars` per line, up to `max` lines. */
function wrap(text: string, chars: number, max: number): string[] {
    const words = (text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        if ((line + " " + word).trim().length > chars) {
            lines.push(line.trim());
            line = word;
            if (lines.length === max) break;
        } else {
            line = `${line} ${word}`;
        }
    }
    if (lines.length < max && line.trim()) lines.push(line.trim());
    return lines;
}

function boxSvg(box: ExportBox, minX: number, minY: number, fill: string, stroke: string): string {
    const x = Math.round(box.left - minX);
    const y = Math.round(box.top - minY);
    const parts = [
        `<rect x="${x}" y="${y}" width="${Math.round(box.width)}" height="${Math.round(box.height)}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
    ];
    if (box.title) {
        parts.push(
            `<text x="${x + 14}" y="${y + 24}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="600" fill="#3c3836">${escapeXml(box.title)}</text>`,
        );
    }
    for (const [i, line] of wrap(box.body, Math.floor(box.width / 7), 8).entries()) {
        parts.push(
            `<text x="${x + 14}" y="${y + 46 + i * 16}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#6b6560">${escapeXml(line)}</text>`,
        );
    }
    return parts.join("\n");
}

/** Builds the standalone SVG for a lesson's cards, notes, and their links. */
export function lessonToSvg(lessonTitle: string, cards: ExportBox[], annotations: ExportAnnotation[]): string {
    const pad = 40;
    const allBoxes: ExportBox[] = [...cards, ...annotations];
    const minX = Math.min(0, ...allBoxes.map((b) => b.left)) - pad;
    const minY = Math.min(0, ...allBoxes.map((b) => b.top)) - pad;
    const maxX = Math.max(600, ...allBoxes.map((b) => b.left + b.width)) + pad;
    const maxY = Math.max(400, ...allBoxes.map((b) => b.top + b.height)) + pad;
    const width = Math.round(maxX - minX);
    const height = Math.round(maxY - minY);

    const cardsByKey = new Map(cards.map((c) => [c.key, c]));
    const links = annotations
        .map((a) => {
            const anchor = cardsByKey.get(a.anchorKey);
            if (!anchor) return "";
            const ends = linkEndpoints(anchor, a);
            const x1 = Math.round(ends.x1 - minX);
            const y1 = Math.round(ends.y1 - minY);
            const x2 = Math.round(ends.x2 - minX);
            const y2 = Math.round(ends.y2 - minY);
            return `<path d="${linkPath(x1, y1, x2, y2, ends.dir)}" fill="none" stroke="#e5c890" stroke-width="2"/><circle cx="${x2}" cy="${y2}" r="3" fill="#e5c890"/>`;
        })
        .join("\n");

    const cardsSvg = cards.map((c) => boxSvg(c, minX, minY, "#fdf6e6", "#e6cf96")).join("\n");
    const annotationsSvg = annotations
        .map((a) => boxSvg(a, minX, minY, "#f5f1fb", "#cfc4e8"))
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<title>${escapeXml(lessonTitle)}</title>
<rect width="${width}" height="${height}" fill="#ffffff"/>
${links}
${cardsSvg}
${annotationsSvg}
</svg>`;
}

/** Prompts for a save path and writes the lesson's SVG there. */
export async function exportLessonSvg(
    lessonTitle: string,
    cards: ExportBox[],
    annotations: ExportAnnotation[],
): Promise<boolean> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
        defaultPath: `${lessonTitle || "lesson"}.svg`,
        filters: [{ name: "SVG", extensions: ["svg"] }],
    });
    if (!path) return false;
    await writeTextFile(path, lessonToSvg(lessonTitle, cards, annotations));
    return true;
}

/**
 * Writes the lesson's SVG to a temp file, wraps it in a one-page Typst
 * document, and compiles that to PDF via the same Rust command the Workbook
 * uses — keeping the export vector rather than a screenshot.
 */
export async function exportLessonPdf(
    lessonTitle: string,
    cards: ExportBox[],
    annotations: ExportAnnotation[],
): Promise<boolean> {
    const { invoke } = await import("@tauri-apps/api/core");
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile, writeTextFile, remove } = await import("@tauri-apps/plugin-fs");
    const { tempDir, join } = await import("@tauri-apps/api/path");

    const dir = await tempDir();
    const svgPath = await join(dir, `lesson-${Date.now()}.svg`);
    await writeTextFile(svgPath, lessonToSvg(lessonTitle, cards, annotations));
    const source =
        `#set page(margin: 12pt, width: auto, height: auto)\n` +
        `#image("${svgPath.replace(/\\/g, "/")}")\n`;
    const bytes = await invoke<ArrayBuffer>("compile_typst_pdf", { source, path: svgPath });
    const path = await save({
        defaultPath: `${lessonTitle || "lesson"}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (path) await writeFile(path, new Uint8Array(bytes));
    await remove(svgPath).catch(() => {});
    return Boolean(path);
}
