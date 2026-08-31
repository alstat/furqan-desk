import { get, writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { openAppWindow } from '$lib/utils/appWindow';
import { fetchVerseTexts, type VerseText } from '$lib/data/verse-of-day';
import { fetchAyahMorphology, findVersesByRootOrLemma } from '$lib/data/arabic-study';
import {
    activeTafsirId,
    activeTranslatorId,
    type AyahTafsir,
} from '$lib/stores/translation.store';

// A workbook is a board of cards — some of them plain notes, some of them
// windows onto the Qur'an, and one of them a pipeline that chains the others
// into a small dataflow. It is the Verse Study canvas generalised: instead of
// one fixed hub-and-spoke layout around a single ayah, the reader lays out
// whatever they are working on and saves it as a file.

export type WorkbookNodeKind =
    | 'ayah'
    | 'translation'
    | 'tafsir'
    | 'related'
    | 'pipeline'
    | 'title'
    | 'note'
    | 'image';

/** The steps a pipeline can run. */
export type PipelineStepKind =
    | 'ayah'
    | 'translation'
    | 'tafsir'
    | 'related'
    | 'filter'
    | 'limit'
    | 'dedupe'
    | 'view';

export interface PipelineStep {
    id: string;
    kind: PipelineStepKind;
    /**
     * Where the step sits on the pipeline's own canvas. Left-to-right position
     * *is* the running order — what the flow shows is what the flow does, so
     * there is no hidden ordering to disagree with the picture.
     */
    x: number;
    y: number;
    /** Optional zone label; steps sharing one are drawn inside it together. */
    group?: string;
    /** `ayah` step: the refs it starts from, e.g. ["1:2", "112:1"]. */
    refs?: string[];
    /** `related`/`limit`: how many rows to keep. */
    limit?: number;
    /** `filter` step: rows must contain this text somewhere. */
    query?: string;
    /** `view` step: how the result is laid out. */
    layout?: 'list' | 'columns';
}

/** What each step does, for the palette and the flow's own labels. */
export const STEP_META: Record<
    PipelineStepKind,
    { icon: string; kind: 'source' | 'enrich' | 'shape' | 'output' }
> = {
    ayah: { icon: 'solar:book-2-bold-duotone', kind: 'source' },
    translation: { icon: 'solar:translation-2-bold-duotone', kind: 'enrich' },
    tafsir: { icon: 'solar:notebook-bold-duotone', kind: 'enrich' },
    related: { icon: 'solar:link-circle-bold-duotone', kind: 'enrich' },
    filter: { icon: 'solar:filter-bold-duotone', kind: 'shape' },
    limit: { icon: 'solar:sort-vertical-bold-duotone', kind: 'shape' },
    dedupe: { icon: 'solar:copy-bold-duotone', kind: 'shape' },
    view: { icon: 'solar:eye-bold-duotone', kind: 'output' },
};

export const STEP_KINDS = Object.keys(STEP_META) as PipelineStepKind[];

/** Steps run left to right, so the flow reads the way it runs. */
export function orderedSteps(steps: PipelineStep[]): PipelineStep[] {
    return [...steps].sort((a, b) => a.x - b.x || a.y - b.y);
}

export interface WorkbookNode {
    id: string;
    kind: WorkbookNodeKind;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Free-text heading shown on the card. */
    title?: string;
    /** `ayah`/`translation`/`tafsir`/`related`: the verse it is pointed at. */
    ref?: string;
    /** `title`/`note`: the text itself. `image`: a data URL. */
    text?: string;
    /** `pipeline`: its ordered steps. */
    steps?: PipelineStep[];
}

export interface WorkbookDoc {
    version: 1;
    title: string;
    nodes: WorkbookNode[];
    viewport: { x: number; y: number; zoom: number };
}

export function emptyWorkbook(title = 'Untitled workbook'): WorkbookDoc {
    return { version: 1, title, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
}

const NODE_DEFAULTS: Record<WorkbookNodeKind, { width: number; height: number }> = {
    ayah: { width: 320, height: 180 },
    translation: { width: 320, height: 180 },
    tafsir: { width: 340, height: 220 },
    related: { width: 320, height: 220 },
    pipeline: { width: 520, height: 360 },
    title: { width: 320, height: 64 },
    note: { width: 260, height: 140 },
    image: { width: 280, height: 200 },
};

export function makeNode(kind: WorkbookNodeKind, x: number, y: number): WorkbookNode {
    const size = NODE_DEFAULTS[kind];
    return {
        id: crypto.randomUUID(),
        kind,
        x,
        y,
        width: size.width,
        height: size.height,
        ref: kind === 'ayah' || kind === 'translation' || kind === 'tafsir' || kind === 'related'
            ? '1:1'
            : undefined,
        text: kind === 'title' ? 'Heading' : kind === 'note' ? '' : undefined,
        steps:
            kind === 'pipeline'
                ? [
                      {
                          id: crypto.randomUUID(),
                          kind: 'ayah',
                          refs: ['1:2', '112:1'],
                          x: 16,
                          y: 24,
                          group: 'Source',
                      },
                      { id: crypto.randomUUID(), kind: 'translation', x: 160, y: 24 },
                      { id: crypto.randomUUID(), kind: 'view', layout: 'list', x: 304, y: 24 },
                  ]
                : undefined,
    };
}

// ── Reading the Qur'an for a node ───────────────────────────────────────────

export interface VerseRow {
    surah: number;
    ayah: number;
    arabic: string;
    translation?: string | null;
    tafsir?: string | null;
    /** Set when the row was reached from another verse. */
    fromRef?: string;
}

export function parseRef(ref: string): { surah: number; ayah: number } | null {
    const match = /(\d{1,3})\s*:\s*(\d{1,3})/.exec(ref ?? '');
    if (!match) return null;
    return { surah: Number(match[1]), ayah: Number(match[2]) };
}

/** Arabic (and the reader's translation, when one is chosen) for a list of refs. */
export async function loadVerses(refs: string[]): Promise<VerseRow[]> {
    const parsed = refs.map(parseRef).filter((r): r is { surah: number; ayah: number } => !!r);
    if (parsed.length === 0) return [];
    const texts = await fetchVerseTexts(parsed, get(activeTranslatorId) ?? undefined);
    return texts.map((verse: VerseText) => ({
        surah: verse.surah,
        ayah: verse.ayah,
        arabic: verse.arabic,
        translation: verse.translation,
    }));
}

/** Fills in the tafsir for each row, from the reader's chosen author. */
export async function attachTafsir(rows: VerseRow[]): Promise<VerseRow[]> {
    const authorId = get(activeTafsirId);
    if (authorId == null) return rows.map((row) => ({ ...row, tafsir: null }));
    const bySurah = new Map<number, AyahTafsir[]>();
    for (const surah of new Set(rows.map((row) => row.surah))) {
        try {
            bySurah.set(
                surah,
                await invoke<AyahTafsir[]>('get_surah_tafsir', { surah, authorId }),
            );
        } catch {
            bySurah.set(surah, []);
        }
    }
    return rows.map((row) => ({
        ...row,
        tafsir: bySurah.get(row.surah)?.find((entry) => entry.ayah === row.ayah)?.text ?? null,
    }));
}

/**
 * Verses sharing a root or lemma with each input row. The root comes from the
 * row's own morphology — the first content word that has one — so the match is
 * the corpus's, not a guess.
 */
export async function relatedTo(rows: VerseRow[], limit = 3): Promise<VerseRow[]> {
    const out: VerseRow[] = [];
    for (const row of rows) {
        try {
            const morphology = await fetchAyahMorphology(row.surah, row.ayah);
            let root: string | null = null;
            let lemma: string | null = null;
            for (const word of morphology.words) {
                const hit = word.tokens.find((tok) => tok.features.root || tok.features.lemma);
                if (hit) {
                    root = hit.features.root ?? null;
                    lemma = hit.features.lemma ?? null;
                    break;
                }
            }
            if (!root && !lemma) continue;
            const matches = await findVersesByRootOrLemma(root, lemma, row.surah, row.ayah);
            const refs = matches.slice(0, limit).map((m) => `${m.surah}:${m.ayah}`);
            for (const verse of await loadVerses(refs)) {
                out.push({ ...verse, fromRef: `${row.surah}:${row.ayah}` });
            }
        } catch {
            // A verse with no morphology simply contributes nothing.
        }
    }
    return out;
}

// ── The pipeline ────────────────────────────────────────────────────────────

export interface PipelineResult {
    rows: VerseRow[];
    layout: 'list' | 'columns';
    /** One line per step, so a reader can see what the pipeline actually did. */
    trace: string[];
}

/**
 * Runs the steps in order, each one transforming the rows the last produced —
 * Alteryx-style. `ayah` seeds, `translation`/`tafsir` enrich, `related` replaces
 * the rows with what they led to, and `view` ends it by choosing the layout.
 */
export async function runPipeline(steps: PipelineStep[]): Promise<PipelineResult> {
    let rows: VerseRow[] = [];
    let layout: 'list' | 'columns' = 'list';
    const trace: string[] = [];

    for (const step of orderedSteps(steps)) {
        switch (step.kind) {
            case 'ayah': {
                rows = await loadVerses(step.refs ?? []);
                trace.push(`Ayah → ${rows.length} verse(s)`);
                break;
            }
            case 'translation': {
                // Translations arrive with the verse text, so a translation step
                // after `related` only needs to re-read rows that lack one.
                const missing = rows.some((row) => !row.translation);
                if (missing) {
                    const refreshed = await loadVerses(
                        rows.map((row) => `${row.surah}:${row.ayah}`),
                    );
                    const byRef = new Map(
                        refreshed.map((row) => [`${row.surah}:${row.ayah}`, row.translation]),
                    );
                    rows = rows.map((row) => ({
                        ...row,
                        translation:
                            row.translation ?? byRef.get(`${row.surah}:${row.ayah}`) ?? null,
                    }));
                }
                trace.push(`Translation → ${rows.filter((r) => r.translation).length} translated`);
                break;
            }
            case 'tafsir': {
                rows = await attachTafsir(rows);
                trace.push(`Tafsir → ${rows.filter((r) => r.tafsir).length} with commentary`);
                break;
            }
            case 'related': {
                rows = await relatedTo(rows, step.limit ?? 3);
                trace.push(`Related verses → ${rows.length} verse(s)`);
                break;
            }
            case 'filter': {
                const needle = (step.query ?? '').trim().toLowerCase();
                if (needle) {
                    rows = rows.filter((row) =>
                        [row.arabic, row.translation, row.tafsir]
                            .filter(Boolean)
                            .some((text) => String(text).toLowerCase().includes(needle)),
                    );
                }
                trace.push(`Filter → ${rows.length} row(s)`);
                break;
            }
            case 'limit': {
                rows = rows.slice(0, Math.max(1, step.limit ?? 5));
                trace.push(`Limit → ${rows.length} row(s)`);
                break;
            }
            case 'dedupe': {
                const seen = new Set<string>();
                rows = rows.filter((row) => {
                    const key = `${row.surah}:${row.ayah}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                trace.push(`Dedupe → ${rows.length} row(s)`);
                break;
            }
            case 'view': {
                layout = step.layout ?? 'list';
                trace.push(`View → ${rows.length} row(s), ${layout}`);
                break;
            }
        }
    }
    return { rows, layout, trace };
}

// ── The file: an SVG that is also the document ──────────────────────────────

const METADATA_ID = 'ayahlab-workbook';

const escapeXml = (text: string) =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Breaks a string into lines that fit `chars` per line, up to `max` lines. */
function wrap(text: string, chars: number, max: number): string[] {
    const words = (text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        if ((line + ' ' + word).trim().length > chars) {
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

const NODE_FILL: Record<WorkbookNodeKind, { fill: string; stroke: string }> = {
    ayah: { fill: '#fdf6e6', stroke: '#e6cf96' },
    translation: { fill: '#eef6f4', stroke: '#a9cfc6' },
    tafsir: { fill: '#f2f0fa', stroke: '#cfc4e8' },
    related: { fill: '#eef4f7', stroke: '#a8c8d8' },
    pipeline: { fill: '#f7f5f0', stroke: '#c9c2b4' },
    title: { fill: '#ffffff00', stroke: '#ffffff00' },
    note: { fill: '#fffbe8', stroke: '#e8dca8' },
    image: { fill: '#f4f4f4', stroke: '#dcdcdc' },
};

/**
 * Serialises the board to a standalone SVG. The document itself rides along in
 * `<metadata>`, so the same file the reader exports is the file the app reopens
 * — no second format to keep in step, and nothing lost on a round trip.
 */
export function workbookToSvg(doc: WorkbookDoc): string {
    const pad = 40;
    const nodes = doc.nodes;
    const minX = Math.min(0, ...nodes.map((n) => n.x)) - pad;
    const minY = Math.min(0, ...nodes.map((n) => n.y)) - pad;
    const maxX = Math.max(600, ...nodes.map((n) => n.x + n.width)) + pad;
    const maxY = Math.max(400, ...nodes.map((n) => n.y + n.height)) + pad;
    const width = Math.round(maxX - minX);
    const height = Math.round(maxY - minY);

    const body = nodes
        .map((node) => {
            const colors = NODE_FILL[node.kind];
            const x = Math.round(node.x - minX);
            const y = Math.round(node.y - minY);
            const parts: string[] = [];
            if (node.kind !== 'title') {
                parts.push(
                    `<rect x="${x}" y="${y}" width="${Math.round(node.width)}" height="${Math.round(
                        node.height,
                    )}" rx="14" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.5"/>`,
                );
            }
            const heading =
                node.kind === 'title'
                    ? node.text ?? ''
                    : node.title || defaultTitle(node);
            if (heading) {
                const size = node.kind === 'title' ? 26 : 12;
                const weight = node.kind === 'title' ? 700 : 600;
                parts.push(
                    `<text x="${x + 14}" y="${y + (node.kind === 'title' ? 34 : 24)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${size}" font-weight="${weight}" fill="#3c3836">${escapeXml(
                        heading,
                    )}</text>`,
                );
            }
            const bodyText = node.kind === 'note' ? node.text ?? '' : node.ref ?? '';
            for (const [i, line] of wrap(bodyText, Math.floor(node.width / 7), 6).entries()) {
                parts.push(
                    `<text x="${x + 14}" y="${y + 46 + i * 16}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#6b6560">${escapeXml(
                        line,
                    )}</text>`,
                );
            }
            if (node.kind === 'pipeline') {
                for (const [i, step] of (node.steps ?? []).entries()) {
                    const sx = x + 14 + i * 96;
                    parts.push(
                        `<rect x="${sx}" y="${y + 58}" width="86" height="30" rx="8" fill="#ffffff" stroke="#c9c2b4"/>` +
                            `<text x="${sx + 8}" y="${y + 78}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#3c3836">${escapeXml(
                                step.kind,
                            )}</text>`,
                    );
                    if (i > 0) {
                        parts.push(
                            `<line x1="${sx - 10}" y1="${y + 73}" x2="${sx}" y2="${
                                y + 73
                            }" stroke="#c9c2b4" stroke-width="1.5"/>`,
                        );
                    }
                }
            }
            if (node.kind === 'image' && node.text) {
                parts.push(
                    `<image x="${x + 8}" y="${y + 8}" width="${Math.round(
                        node.width - 16,
                    )}" height="${Math.round(node.height - 16)}" preserveAspectRatio="xMidYMid meet" href="${escapeXml(
                        node.text,
                    )}"/>`,
                );
            }
            return parts.join('\n');
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<title>${escapeXml(doc.title)}</title>
<metadata id="${METADATA_ID}">${escapeXml(JSON.stringify(doc))}</metadata>
<rect width="${width}" height="${height}" fill="#ffffff"/>
${body}
</svg>`;
}

function defaultTitle(node: WorkbookNode): string {
    switch (node.kind) {
        case 'ayah':
            return 'Ayah';
        case 'translation':
            return 'Translation';
        case 'tafsir':
            return 'Tafsir';
        case 'related':
            return 'Related verses';
        case 'pipeline':
            return 'Pipeline';
        case 'image':
            return 'Image';
        default:
            return '';
    }
}

/** Reads a workbook back out of an SVG this app wrote. */
export function workbookFromSvg(svg: string): WorkbookDoc | null {
    const match = new RegExp(
        `<metadata id="${METADATA_ID}">([\\s\\S]*?)</metadata>`,
    ).exec(svg);
    if (!match) return null;
    try {
        const json = match[1]
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
        const doc = JSON.parse(json) as WorkbookDoc;
        if (!Array.isArray(doc.nodes)) return null;
        return doc;
    } catch {
        return null;
    }
}

// ── The window ──────────────────────────────────────────────────────────────

const WORKBOOK_WINDOW = 'workbook';

/** Asks an already-open workbook window to load a file. */
export const WORKBOOK_OPEN_EVENT = 'workbook:open';

/**
 * A workbook gets a window of its own, like the Verse Study canvas.
 *
 * The file to open rides on the query string for a window that has to be
 * created, and on an event for one that is already up: focusing an existing
 * window re-runs none of its mount code, so a path passed only in the URL would
 * be silently ignored and the reader would be looking at whatever board was
 * already open.
 */
export function openWorkbookWindow(path?: string): Promise<boolean> {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    return openAppWindow({
        label: WORKBOOK_WINDOW,
        url: `/workbook/?${params}`,
        title: 'Workbook',
        width: 1280,
        height: 860,
        minWidth: 900,
        minHeight: 620,
        onExisting: async (win) => {
            if (path) await win.emit(WORKBOOK_OPEN_EVENT, { path });
        },
    });
}

/** In-app fallback panel, for when there is no Tauri window to open. */
export const workbookOpen = writable(false);
