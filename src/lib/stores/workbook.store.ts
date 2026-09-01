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
import { translateVerses as aiTranslateVerses } from '$lib/stores/ai-grammar-topic.store';
import { AI_FEATURE_TAGS } from '$lib/stores/ai-chat.store';

// A workbook is a board of cards — some of them plain notes, some of them
// windows onto the Qur'an. Any of the Qur'an/shape/output cards can be wired
// to another with a single input/output connection and grouped into a
// pipeline; ungrouped, a card just shows what it is pointed at on its own. It
// is the Verse Study canvas generalised: instead of one fixed hub-and-spoke
// layout around a single ayah, the reader lays out whatever they are working
// on and saves it as a file.

export type WorkbookNodeKind =
    | 'ayah'
    | 'translation'
    | 'tafsir'
    | 'related'
    | 'filter'
    | 'limit'
    | 'dedupe'
    | 'view'
    | 'title'
    | 'note'
    | 'image';

/** The node kinds that read/shape/show verse rows and so can be wired into a pipeline. */
export const DATA_NODE_KINDS: WorkbookNodeKind[] = [
    'ayah',
    'translation',
    'tafsir',
    'related',
    'filter',
    'limit',
    'dedupe',
    'view',
];

/**
 * Pre-generalisation step kind, kept only so `workbookFromSvg` can still read
 * a `pipeline` node saved by an older build and migrate it into today's
 * shape (see `migratePipelineNodes` below) — nothing new is ever written in
 * this shape.
 */
export type PipelineStepKind =
    | 'ayah'
    | 'translation'
    | 'tafsir'
    | 'related'
    | 'filter'
    | 'limit'
    | 'dedupe'
    | 'view';

/** Legacy shape read by `migratePipelineNodes` — see `PipelineStepKind`. */
export interface PipelineStep {
    id: string;
    kind: PipelineStepKind;
    /** Where the step sat on the old pipeline node's own mini-canvas. */
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

/**
 * Icon and colour family for each data node kind — `ayah` seeds a chain,
 * `translation`/`tafsir`/`related` enrich it, `filter`/`limit`/`dedupe` shape
 * it, `view` ends it. Shared by the toolbar, a card's accent strip, and its
 * port colour, so a kind reads the same wherever it shows up.
 */
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
    /**
     * `ayah`/`translation`/`tafsir`/`related`: the verses it is pointed at,
     * picked from the surah/ayah dropdowns rather than typed. Read through
     * `nodeRefs()`, which also covers `ref` below.
     */
    refs?: string[];
    /** Legacy single-verse field from before `refs` — still read by `nodeRefs()`, never written. */
    ref?: string;
    /** `title`/`note`: the text itself. `image`: a data URL. */
    text?: string;
    /** Legacy shape from before a pipeline's steps were board nodes — read once by `migratePipelineNodes`, never written. */
    steps?: PipelineStep[];
    /** `related`/`limit`: how many rows to keep. */
    limit?: number;
    /** `filter`: the comparison value — text to search for, or a number, depending on `filterField`. */
    query?: string;
    /** `filter`: which field the comparison reads. Unset means `'text'`. */
    filterField?: 'text' | 'surah' | 'ayah';
    /** `filter`: the comparison operator. Unset means `'contains'` (`text`) or `'eq'` (numeric). */
    filterOp?: 'contains' | 'not_contains' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
    /** `view`: how the resolved rows are laid out. */
    layout?: 'list' | 'columns';
    /**
     * `translation`: which bundled translator to read, `'other'` for an
     * AI-supplied language (see `otherLanguage`), or unset to follow the
     * reader's own active translator.
     */
    translatorId?: number | 'other';
    /** `translation` when `translatorId === 'other'`: the free-text language name. */
    otherLanguage?: string;
    /** `tafsir`: which bundled author to read, or unset to follow the reader's own chosen author. */
    tafsirAuthorId?: number;
}

/** A node's verses, whichever field they came from — `refs` if it has any, else the old `ref`. */
export function nodeRefs(node: WorkbookNode): string[] {
    if (node.refs?.length) return node.refs;
    return node.ref ? [node.ref] : [];
}

/**
 * Canonical ayah counts per surah (Hafs), 1-based (index 0 is a placeholder).
 * Mirrors VOTD_SURAH_AYAH_COUNTS in src-tauri/src/commands.rs — static Qur'an
 * data, so a bundled copy is cheaper than a round trip just to size a dropdown.
 */
export const SURAH_AYAH_COUNTS = [
    0, 7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99,
    128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30,
    73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
    60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
    44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26,
    30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
    5, 4, 5, 6,
] as const;

/** A single connection: `from`'s one output feeds `to`'s one input. */
export interface WorkbookEdge {
    id: string;
    from: string;
    to: string;
}

/** A set of nodes framed together as one pipeline, purely for the visual boundary. */
export interface WorkbookGroup {
    id: string;
    name?: string;
    nodeIds: string[];
}

export interface WorkbookDoc {
    version: 1;
    title: string;
    nodes: WorkbookNode[];
    viewport: { x: number; y: number; zoom: number };
    edges: WorkbookEdge[];
    groups: WorkbookGroup[];
}

export function emptyWorkbook(title = 'Untitled workbook'): WorkbookDoc {
    return {
        version: 1,
        title,
        nodes: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        edges: [],
        groups: [],
    };
}

const NODE_DEFAULTS: Record<WorkbookNodeKind, { width: number; height: number }> = {
    ayah: { width: 320, height: 180 },
    translation: { width: 320, height: 180 },
    tafsir: { width: 340, height: 220 },
    related: { width: 320, height: 220 },
    filter: { width: 260, height: 140 },
    limit: { width: 240, height: 120 },
    dedupe: { width: 220, height: 100 },
    view: { width: 320, height: 220 },
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
        refs: kind === 'ayah' || kind === 'related' ? ['1:1'] : undefined,
        text: kind === 'title' ? 'Heading' : kind === 'note' ? '' : undefined,
        limit: kind === 'limit' ? 5 : kind === 'related' ? 3 : undefined,
        layout: kind === 'view' ? 'list' : undefined,
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

/**
 * Arabic (and a translation, when one is available) for a list of refs.
 * `translatorId` picks a specific bundled translator; left unset, it follows
 * the reader's own active one.
 */
export async function loadVerses(refs: string[], translatorId?: number): Promise<VerseRow[]> {
    const parsed = refs.map(parseRef).filter((r): r is { surah: number; ayah: number } => !!r);
    if (parsed.length === 0) return [];
    const texts = await fetchVerseTexts(parsed, translatorId ?? get(activeTranslatorId) ?? undefined);
    return texts.map((verse: VerseText) => ({
        surah: verse.surah,
        ayah: verse.ayah,
        arabic: verse.arabic,
        translation: verse.translation,
    }));
}

/**
 * Fills in the tafsir for each row. `authorId` picks a specific bundled
 * author; left unset, it follows the reader's own chosen one.
 */
export async function attachTafsir(rows: VerseRow[], authorId?: number | null): Promise<VerseRow[]> {
    const id = authorId ?? get(activeTafsirId);
    if (id == null) return rows.map((row) => ({ ...row, tafsir: null }));
    const bySurah = new Map<number, AyahTafsir[]>();
    for (const surah of new Set(rows.map((row) => row.surah))) {
        try {
            bySurah.set(
                surah,
                await invoke<AyahTafsir[]>('get_surah_tafsir', { surah, authorId: id }),
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

// ── The pipeline: what a node shows, wired or standalone ────────────────────

/**
 * What one node contributes, given what flows into it. `input` is empty for
 * a node with nothing feeding it: `ayah` and `related` fall back to their own
 * `refs` in that case, since they can stand alone; `translation` and `tafsir`
 * cannot — a verse's surah/ayah has to come from upstream (an `ayah` card,
 * directly or by way of a `translation` card, which passes it straight
 * through) — so they return nothing rather than guess at one. Every other
 * kind with no input has nothing to shape and returns rows unchanged (empty).
 */
export async function transformNode(
    node: WorkbookNode,
    input: VerseRow[],
): Promise<VerseRow[]> {
    switch (node.kind) {
        case 'ayah': {
            if (input.length) return input;
            return loadVerses(nodeRefs(node));
        }
        case 'translation': {
            // No self-source: a Translate card only ever translates what
            // flows into it (an Ayah card, typically) — see the module doc.
            if (!input.length) return [];
            if (node.translatorId === 'other') {
                const language = (node.otherLanguage ?? '').trim();
                if (!language) return input.map((row) => ({ ...row, translation: null }));
                const byRef = await aiTranslateVerses({
                    verses: input.map((row) => ({ ref: `${row.surah}:${row.ayah}`, arabic: row.arabic })),
                    language,
                    feature: AI_FEATURE_TAGS.workbookTranslate,
                });
                return input.map((row) => ({
                    ...row,
                    translation: byRef[`${row.surah}:${row.ayah}`] ?? null,
                }));
            }
            const translatorId = typeof node.translatorId === 'number' ? node.translatorId : undefined;
            const refreshed = await loadVerses(
                input.map((row) => `${row.surah}:${row.ayah}`),
                translatorId,
            );
            const byRef = new Map(refreshed.map((row) => [`${row.surah}:${row.ayah}`, row.translation]));
            return input.map((row) => ({
                ...row,
                translation: byRef.get(`${row.surah}:${row.ayah}`) ?? null,
            }));
        }
        case 'tafsir': {
            // No self-source either — an Ayah card upstream (directly, or by
            // way of a Translate card, which passes surah/ayah straight
            // through) is what supplies the verses.
            if (!input.length) return [];
            return attachTafsir(input, node.tafsirAuthorId);
        }
        case 'related': {
            const rows = input.length ? input : await loadVerses(nodeRefs(node));
            return relatedTo(rows, node.limit ?? 3);
        }
        case 'filter': {
            const field = node.filterField ?? 'text';
            const op = node.filterOp ?? (field === 'text' ? 'contains' : 'eq');
            const raw = (node.query ?? '').trim();
            if (!raw) return input;
            if (field === 'text') {
                const needle = raw.toLowerCase();
                const matches = (row: VerseRow) =>
                    [row.arabic, row.translation, row.tafsir]
                        .filter(Boolean)
                        .some((text) => String(text).toLowerCase().includes(needle));
                return input.filter((row) => (op === 'not_contains' ? !matches(row) : matches(row)));
            }
            const value = Number(raw);
            if (Number.isNaN(value)) return input;
            const compare: Record<string, (a: number) => boolean> = {
                eq: (a) => a === value,
                neq: (a) => a !== value,
                gt: (a) => a > value,
                gte: (a) => a >= value,
                lt: (a) => a < value,
                lte: (a) => a <= value,
            };
            const test = compare[op] ?? compare.eq;
            return input.filter((row) => test(field === 'surah' ? row.surah : row.ayah));
        }
        case 'limit':
            return input.slice(0, Math.max(1, node.limit ?? 5));
        case 'dedupe': {
            const seen = new Set<string>();
            return input.filter((row) => {
                const key = `${row.surah}:${row.ayah}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }
        case 'view':
            return input;
        default:
            return [];
    }
}

/**
 * What every data node on the board currently shows, resolved in one pass:
 * a node with no incoming edge is its own source (or, for the shape/output
 * kinds, empty); a node with one is fed the upstream node's own resolved
 * rows, recursively. Memoised per node id and guarded against a cycle (a
 * wire loop resolves to empty rows rather than hanging).
 */
export async function resolveNodeOutputs(doc: WorkbookDoc): Promise<Map<string, VerseRow[]>> {
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    const incoming = new Map(doc.edges.map((e) => [e.to, e.from]));
    const resolved = new Map<string, VerseRow[]>();
    const resolving = new Set<string>();

    async function resolve(id: string): Promise<VerseRow[]> {
        const cached = resolved.get(id);
        if (cached) return cached;
        const node = byId.get(id);
        if (!node || resolving.has(id)) return [];
        resolving.add(id);
        const upstreamId = incoming.get(id);
        const input = upstreamId ? await resolve(upstreamId) : [];
        const rows = await transformNode(node, input);
        resolving.delete(id);
        resolved.set(id, rows);
        return rows;
    }

    for (const node of doc.nodes) {
        if (DATA_NODE_KINDS.includes(node.kind)) await resolve(node.id);
    }
    return resolved;
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
    filter: { fill: '#f4f2fa', stroke: '#c3b6ea' },
    limit: { fill: '#f4f2fa', stroke: '#c3b6ea' },
    dedupe: { fill: '#f4f2fa', stroke: '#c3b6ea' },
    view: { fill: '#eef7f0', stroke: '#9dd4c8' },
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
            const bodyText = node.kind === 'note' ? node.text ?? '' : nodeRefs(node).join(', ');
            for (const [i, line] of wrap(bodyText, Math.floor(node.width / 7), 6).entries()) {
                parts.push(
                    `<text x="${x + 14}" y="${y + 46 + i * 16}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#6b6560">${escapeXml(
                        line,
                    )}</text>`,
                );
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
            return 'Translate';
        case 'tafsir':
            return 'Tafsir';
        case 'related':
            return 'Related verses';
        case 'filter':
            return 'Filter';
        case 'limit':
            return 'Limit';
        case 'dedupe':
            return 'Dedupe';
        case 'view':
            return 'View';
        case 'image':
            return 'Image';
        default:
            return '';
    }
}

/**
 * Converts every old `pipeline` node — a container with its own `steps` —
 * into today's shape: each step becomes a top-level node positioned where it
 * sat inside the old container, wired to the next by an edge in the old
 * left-to-right order, and the whole set framed as one group. An old board
 * still opens with nothing lost; this shape is never written back out.
 */
function migratePipelineNodes(doc: WorkbookDoc): WorkbookDoc {
    type LegacyNode = Omit<WorkbookNode, 'kind'> & { kind: string; steps?: PipelineStep[] };
    const legacy = (doc.nodes as LegacyNode[]).filter((n) => n.kind === 'pipeline');
    if (legacy.length === 0) return doc;

    const nodes = doc.nodes.filter((n) => (n as LegacyNode).kind !== 'pipeline');
    const edges = [...doc.edges];
    const groups = [...doc.groups];

    for (const old of legacy) {
        const steps = orderedSteps(old.steps ?? []);
        const idFor = new Map<string, string>();
        const newIds: string[] = [];
        for (const step of steps) {
            const id = crypto.randomUUID();
            idFor.set(step.id, id);
            newIds.push(id);
            const size = NODE_DEFAULTS[step.kind];
            nodes.push({
                id,
                kind: step.kind,
                x: old.x + step.x,
                y: old.y + step.y,
                width: size.width,
                height: size.height,
                refs: step.refs,
                limit: step.limit,
                query: step.query,
                layout: step.layout,
            });
        }
        for (let i = 1; i < steps.length; i++) {
            edges.push({
                id: crypto.randomUUID(),
                from: idFor.get(steps[i - 1].id)!,
                to: idFor.get(steps[i].id)!,
            });
        }
        if (newIds.length) groups.push({ id: crypto.randomUUID(), name: old.title, nodeIds: newIds });
    }

    return { ...doc, nodes, edges, groups };
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
        if (!Array.isArray(doc.edges)) doc.edges = [];
        if (!Array.isArray(doc.groups)) doc.groups = [];
        return migratePipelineNodes(doc);
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
