import { get, writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { openAppWindow } from '$lib/utils/appWindow';
import { fetchVerseTexts, type VerseText } from '$lib/data/verse-of-day';
import { fetchAyahMorphology, findVersesByRootOrLemma } from '$lib/data/arabic-study';
import {
    activeTafsirId,
    activeTranslatorId,
    availableTafsirAuthors,
    availableTranslators,
    type AyahTafsir,
} from '$lib/stores/translation.store';
import { translateVerses as aiTranslateVerses } from '$lib/stores/ai-grammar-topic.store';
import { AI_FEATURE_TAGS } from '$lib/stores/ai-chat.store';
import { runWorkbookJulia, runWorkbookLean } from '$lib/stores/workbook-code-nodes';
import type { LogicEdgeRole, LogicNodePayload, LogicRole } from '$lib/stores/logic/graph';
import type { LogicTheory } from '$lib/stores/logic/theory';

// A workbook is a board of cards — some of them plain notes, some of them
// windows onto the Qur'an. Any of the Qur'an/shape/output cards can be wired
// to another with a single input/output connection and grouped into a
// pipeline; ungrouped, a card just shows what it is pointed at on its own. It
// is the Verse Study canvas generalised: instead of one fixed hub-and-spoke
// layout around a single ayah, the reader lays out whatever they are working
// on and saves it as a file.

export type WorkbookNodeKind =
    | 'ayah'
    | 'data'
    | 'translation'
    | 'tafsir'
    | 'related'
    | 'filter'
    | 'limit'
    | 'dedupe'
    | 'julia'
    | 'lean'
    | 'view'
    | 'export'
    | 'title'
    | 'note'
    | 'image'
    // The Lean Logic Pipeline's single node kind. Everything a proof is made
    // of — theory roots, goals, premises, rule applications, evidence — is
    // this one kind with a `logic.role` discriminant, deliberately kept out of
    // `DATA_NODE_KINDS` so a proof card can never be dragged into the row
    // pipeline or handed to `transformNode`.
    | 'logic';

/** The node kinds that read/shape/show rows (verse or table) and so can be wired into a pipeline. */
export const DATA_NODE_KINDS: WorkbookNodeKind[] = [
    'ayah',
    'data',
    'translation',
    'tafsir',
    'related',
    'filter',
    'limit',
    'dedupe',
    'julia',
    'lean',
    'view',
    'export',
];

/**
 * The node kinds that are their own source — `ayah` reads its own picked
 * verses, `data` its own uploaded file — rather than shaping whatever is
 * wired in. Neither ever takes an incoming edge, so neither gets an input
 * port (see `hasInPort` in WorkbookBoard.svelte) and a wire drag can never
 * land on one as a target (see `endGesture`'s `to`-kind check there).
 */
export const SOURCE_NODE_KINDS: WorkbookNodeKind[] = ['ayah', 'data'];

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
    /** Free-text heading shown on the card. `julia`/`lean`: the node's own name, so the board reads clearly with more than one. */
    title?: string;
    /** `julia`/`lean`: the reader's own code, run against `rows` (the upstream `VerseRow[]`) with the answer expected in `result`. */
    code?: string;
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
    /**
     * `filter`, against a `VerseRow` input: which field the comparison
     * reads — `'text'`, `'surah'`, or `'ayah'`; unset means `'text'`.
     * Against a `TableRow` input (wired to a `data` node, directly or
     * through other shape nodes): an arbitrary column name from that
     * table; unset means its first column.
     */
    filterField?: string;
    /** `filter`: the comparison operator. Unset means `'contains'` (`text`) or `'eq'` (numeric). */
    filterOp?: 'contains' | 'not_contains' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
    /** `view`: how the resolved rows are laid out. */
    layout?: 'list' | 'columns';
    /**
     * `translation`: legacy single-pick fields from before more than one
     * translator could be compared at once — still read by `nodeTranslators()`
     * when `translators` is unset, never written by new code. `'other'` was
     * (and `translators[].id === 'other'` still is) an AI-supplied language,
     * named in `otherLanguage`/`translators[].language`.
     */
    translatorId?: number | 'other';
    otherLanguage?: string;
    /**
     * `translation`: the translators to read, each a bundled id or `'other'`
     * for an AI-supplied language (its own `language`, one per entry so more
     * than one can be compared side by side). Read through `nodeTranslators()`,
     * which also covers the legacy fields above; empty/unset follows the
     * reader's own active translator.
     */
    translators?: { id?: number | 'other'; language?: string }[];
    /** `tafsir`: legacy single-author field — still read by `nodeTafsirAuthorIds()`, never written. */
    tafsirAuthorId?: number;
    /**
     * `tafsir`: the bundled authors to read, one tafsir per entry so more
     * than one can be compared side by side; empty/unset follows the
     * reader's own chosen author.
     */
    tafsirAuthorIds?: (number | undefined)[];
    /**
     * `julia`/`lean`: whether this node's own REPL/infoview panel is open.
     * Shared with a wired `view` card downstream — see `view`'s `viewMode`
     * below — so the same REPL/infoview is never shown in two places at
     * once: a `view` card may only host it while this is false.
     */
    sidePanelOpen?: boolean;
    /**
     * `view`: what the card shows in place of its resolved rows when wired
     * directly to a `julia`/`lean` card — `'repl'` hosts the upstream Julia
     * node's REPL (only while that node's own `sidePanelOpen` is false),
     * `'infoview'` the same for a Lean node's infoview, `'plots'` the
     * upstream Julia node's most recent plot output (available regardless
     * of its `sidePanelOpen`, since a plot gallery doesn't duplicate
     * anything the REPL panel itself shows). Unset/`'rows'` is the default,
     * unrelated to what (if anything) is wired upstream.
     */
    viewMode?: 'rows' | 'repl' | 'infoview' | 'plots';
    /**
     * `data`: absolute path to the standalone `.sqlite` file the reader's
     * uploaded CSV/XLSX was imported into — one file per node, named by
     * this node's own id (see `import_data_file`/`read_data_table` in
     * `data_import.rs`). Unset until the reader picks a file. A `julia`
     * node anywhere downstream (even through Filter/Limit/Dedupe) is handed
     * this same path, so a reader with SQLite.jl/DataFrames.jl installed
     * can query the file directly instead of working only from `rows`.
     */
    dataSourcePath?: string;
    /** `data`: the file name as picked, for display — `dataSourcePath`'s own basename is this node's id, not fit to show. */
    dataFileName?: string;
    /** `data`: column metadata cached at import time, so the card can show a summary without a round trip to `read_data_table`. */
    dataColumns?: { name: string; type: string }[];
    /** `data`: row count cached the same way, for the same reason. */
    dataRowCount?: number;
    /**
     * `logic`: the proof-graph payload — role, proposition, chosen rule and so
     * on. Ports are *not* stored here: they are derived from the role, the
     * selected rule and the goal the card feeds (see `derivePorts`), so the
     * board can never drift out of step with the logic.
     */
    logic?: LogicNodePayload;
}

// Fields `transformNode` never reads for any node kind — pure geometry
// (dragging/resizing a card), its free-text `title`, or UI-only state
// (`sidePanelOpen`/`viewMode` toggling a REPL/infoview panel, `layout`
// switching a `view` card's own list/columns rendering). A recompute gate
// keyed on every *other* field, via `pipelineNodeKey` below, means moving a
// card around the board (or opening its REPL) never re-triggers Julia/Lean
// or any other transform — only an edit that could actually change what
// `transformNode` produces does.
const PIPELINE_IRRELEVANT_NODE_FIELDS = [
    'x',
    'y',
    'width',
    'height',
    'title',
    'sidePanelOpen',
    'viewMode',
    'layout',
    'text',
    'steps',
] as const;

/**
 * A string that changes if and only if some field `transformNode` actually
 * reads for this node changes — see `PIPELINE_IRRELEVANT_NODE_FIELDS`. Used
 * to gate Live-mode recomputes (both the board's own `resolveNodeOutputs`
 * pass and each card's own local `reload()`) on real edits rather than on
 * every commit to the board, geometry and panel toggles included.
 */
export function pipelineNodeKey(node: WorkbookNode): string {
    const copy: Record<string, unknown> = { ...node };
    for (const field of PIPELINE_IRRELEVANT_NODE_FIELDS) delete copy[field];
    return JSON.stringify(copy);
}

/** A node's verses, whichever field they came from — `refs` if it has any, else the old `ref`. */
export function nodeRefs(node: WorkbookNode): string[] {
    if (node.refs?.length) return node.refs;
    return node.ref ? [node.ref] : [];
}

/**
 * A translation node's picks, whichever field they came from — `translators`
 * if it has any, else the old single `translatorId`/`otherLanguage`, else one
 * empty pick (unset id — follow the reader's own active translator) so the
 * card always shows at least one row.
 */
export function nodeTranslators(node: WorkbookNode): { id?: number | 'other'; language?: string }[] {
    if (node.translators?.length) return node.translators;
    if (node.translatorId !== undefined) return [{ id: node.translatorId, language: node.otherLanguage }];
    return [{}];
}

/**
 * A tafsir node's author picks, whichever field they came from — `tafsirAuthorIds`
 * if it has any, else the old single `tafsirAuthorId`, else one unset pick so
 * the card always shows at least one row.
 */
export function nodeTafsirAuthorIds(node: WorkbookNode): (number | undefined)[] {
    if (node.tafsirAuthorIds?.length) return node.tafsirAuthorIds;
    if (node.tafsirAuthorId !== undefined) return [node.tafsirAuthorId];
    return [undefined];
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

/** A single connection: `from`'s output feeds `to`'s one input. A node's output can feed several edges (fan-out to more than one downstream node); a node's input takes at most one — see the port-drag handling in WorkbookBoard.svelte. */
export interface WorkbookEdge {
    id: string;
    from: string;
    to: string;
    /**
     * Named ports, added with the logic dialect. Absent on every edge written
     * by a version-1 build, which is read as `out` → `in` with role `data` —
     * see `migrateEdges`. Data cards still have exactly one unnamed input, so
     * nothing about their behaviour changes; a logic rule card derives one
     * port per obligation, which is what lets a four-premise rule have four
     * separately replaceable incoming connections.
     */
    fromPort?: string;
    toPort?: string;
    role?: LogicEdgeRole;
}

/** A set of nodes framed together as one pipeline, purely for the visual boundary. */
export interface WorkbookGroup {
    id: string;
    name?: string;
    nodeIds: string[];
}

/**
 * The Theory library and proof selection a board carries. Kept on the document
 * (and so inside the exported SVG) rather than in app-level storage, so a
 * workbook file remains self-contained: someone opening it gets the exact
 * Theory revision the proof was checked against, not whatever their own copy
 * of that Theory has since become.
 */
export interface WorkbookLogicState {
    /** Published, immutable Theory revisions. */
    theories: LogicTheory[];
    activeTheoryId?: string;
    selectedProofRootId?: string;
}

export interface WorkbookDoc {
    /**
     * 1 predates the logic dialect. 2 adds named edge ports and `logic` state;
     * a version-1 document is migrated on load (see `migrateEdges`) and written
     * back as 2, while the reader still accepts 1 indefinitely.
     */
    version: 1 | 2;
    title: string;
    nodes: WorkbookNode[];
    viewport: { x: number; y: number; zoom: number };
    edges: WorkbookEdge[];
    groups: WorkbookGroup[];
    logic?: WorkbookLogicState;
}

export const WORKBOOK_SCHEMA_VERSION = 2 as const;

export function emptyWorkbook(title = 'Untitled workbook'): WorkbookDoc {
    return {
        version: WORKBOOK_SCHEMA_VERSION,
        title,
        nodes: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        edges: [],
        groups: [],
    };
}

// One size for every kind, Ayah's own (slightly narrower than it used to
// be) as the basis — a card wired to another reads as one consistent shape
// moving through the pipeline, rather than some links being visibly bigger
// or smaller than others for no reason tied to their content.
export const NODE_SIZE = { width: 260, height: 150 };
/** Proof cards carry a proposition plus its plain-language reading, so they start taller than a data card. */
export const LOGIC_NODE_SIZE = { width: 300, height: 176 };
const NODE_DEFAULTS: Record<WorkbookNodeKind, { width: number; height: number }> = {
    ayah: NODE_SIZE,
    data: NODE_SIZE,
    translation: NODE_SIZE,
    tafsir: NODE_SIZE,
    related: NODE_SIZE,
    filter: NODE_SIZE,
    limit: NODE_SIZE,
    dedupe: NODE_SIZE,
    julia: NODE_SIZE,
    lean: NODE_SIZE,
    view: NODE_SIZE,
    export: NODE_SIZE,
    title: NODE_SIZE,
    note: NODE_SIZE,
    image: NODE_SIZE,
    logic: LOGIC_NODE_SIZE,
};

/** A fresh Julia/Lean node is already a working pass-through until edited. */
const CODE_PLACEHOLDER: Partial<Record<WorkbookNodeKind, string>> = {
    julia: 'result = rows',
    lean: 'def result := rows',
};

export function makeNode(
    kind: WorkbookNodeKind,
    x: number,
    y: number,
    /** `logic` only: which kind of proof card this is. Ignored for every other kind. */
    logicRole: LogicRole = 'goal',
): WorkbookNode {
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
        code: CODE_PLACEHOLDER[kind],
        logic: kind === 'logic' ? { role: logicRole, plainLanguage: '', source: '' } : undefined,
    };
}

/** The default heading for a proof card, by role. */
function logicRoleTitle(node: WorkbookNode): string {
    switch (node.logic?.role) {
        case 'theory-root':
            return 'Theory';
        case 'proof-root':
            return 'Conclusion';
        case 'goal':
            return 'Goal';
        case 'premise':
            return 'Premise';
        case 'rule':
            return 'Rule';
        case 'evidence':
            return 'Evidence';
        case 'imported-theorem':
            return 'Imported theorem';
        case 'custom-lean':
            return 'Custom Lean';
        default:
            return 'Logic';
    }
}

// ── Reading the Qur'an for a node ───────────────────────────────────────────

export interface VerseRow {
    surah: number;
    ayah: number;
    arabic: string;
    /** The first (or only) translation — always set alongside `translations` for whatever read it. */
    translation?: string | null;
    /** Set when a translation node has one or more translators picked — one entry per translator, for comparing them side by side. */
    translations?: { label: string; text: string | null }[];
    /** The first (or only) tafsir — always set alongside `tafsirs` for whatever read it. */
    tafsir?: string | null;
    /** Set when a tafsir node has one or more authors picked — one entry per author, for comparing them side by side. */
    tafsirs?: { label: string; text: string | null }[];
    /** Set when the row was reached from another verse. */
    fromRef?: string;
}

/** One row of a `data` node's imported CSV/XLSX table, or of a Julia node's output when it isn't Qur'an-shaped. */
export interface TableRow {
    /** Discriminates against `VerseRow` — always `true`, never absent. */
    table: true;
    /** Column name → cell value, straight from the imported file/SQLite row. */
    cells: Record<string, string | number | null>;
}

/**
 * Every row shape a card in a pipeline can carry — a Qur'an verse, or one
 * row of an uploaded `data` node's table. Filter/Limit/Dedupe/View branch on
 * `isTableRow` to handle both; Translate/Tafsir/Related only make sense for
 * `VerseRow` and drop anything else that reaches them (see `transformNode`).
 */
export type WorkbookRow = VerseRow | TableRow;

export function isTableRow(row: WorkbookRow): row is TableRow {
    return (row as TableRow).table === true;
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

// ── Reading an uploaded file for a `data` node ──────────────────────────────

export interface DataColumnMeta {
    name: string;
    type: string;
}

/** What `import_data_file` (data_import.rs) hands back once the file's own sqlite copy is written. */
interface DataImportResultRaw {
    sqlite_path: string;
    table_name: string;
    columns: DataColumnMeta[];
    row_count: number;
}

/** What `read_data_table` hands back — the same file, read whole. */
interface DataTableRaw {
    columns: DataColumnMeta[];
    rows: (string | number | null)[][];
}

/**
 * Imports a CSV/XLSX/TSV/ODS file the reader picked into a `.sqlite` file
 * dedicated to this node (see `data_import.rs`), replacing whatever it
 * imported before. The node fields this fills in (`dataSourcePath` etc.) are
 * committed by the caller, same as any other `onChange`.
 */
export async function importDataFile(
    nodeId: string,
    path: string,
): Promise<{ dataSourcePath: string; dataColumns: DataColumnMeta[]; dataRowCount: number }> {
    const result = await invoke<DataImportResultRaw>('import_data_file', { nodeId, path });
    return {
        dataSourcePath: result.sqlite_path,
        dataColumns: result.columns,
        dataRowCount: result.row_count,
    };
}

/** A `data` node's own imported table, read back from its `.sqlite` file as `TableRow[]` for the pipeline. */
async function loadDataTable(node: WorkbookNode): Promise<TableRow[]> {
    if (!node.dataSourcePath) return [];
    try {
        const table = await invoke<DataTableRaw>('read_data_table', { sqlitePath: node.dataSourcePath });
        return table.rows.map((cells) => ({
            table: true as const,
            cells: Object.fromEntries(table.columns.map((col, i) => [col.name, cells[i] ?? null])),
        }));
    } catch {
        // A missing/moved/corrupt file (the board was reopened on another
        // machine, or the reader deleted the source) — same "nothing to
        // show" fallback as an `ayah` node whose refs don't resolve.
        return [];
    }
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
    input: WorkbookRow[],
    /**
     * The nearest upstream `data` node's `.sqlite` path, if any — resolved
     * by `resolveNodeOutputs` by walking the wiring, not derivable from
     * `input` alone (Filter/Limit/Dedupe hops in between don't carry it).
     * Only `julia` reads this.
     */
    sqlitePath?: string,
): Promise<WorkbookRow[]> {
    switch (node.kind) {
        case 'ayah': {
            if (input.length) return input;
            return loadVerses(nodeRefs(node));
        }
        case 'data': {
            // Self-sourcing, same as `ayah` — its own upload, not something
            // wired in. A node wired into a `data` card (unusual, but not
            // forbidden) is passed through unchanged instead.
            if (input.length) return input;
            return loadDataTable(node);
        }
        case 'translation': {
            // No self-source: a Translate card only ever translates what
            // flows into it (an Ayah card, typically) — see the module doc.
            // Only makes sense for verse rows — a `data` node's table rows
            // reaching here (wired in by mistake) have no surah/ayah to
            // translate, so they're dropped rather than guessed at.
            const rows = input.filter((row): row is VerseRow => !isTableRow(row));
            if (!rows.length) return [];
            // One or more translators can be picked (the + button in the
            // card); each becomes one entry in `translations`, so the View
            // card can show them side by side.
            const picks = nodeTranslators(node);
            const translators = get(availableTranslators);
            const perPick = await Promise.all(
                picks.map(async (pick) => {
                    if (pick.id === 'other') {
                        const language = (pick.language ?? '').trim();
                        if (!language) return { label: pick.language || 'Other', byRef: new Map<string, string | null>() };
                        const byRef = await aiTranslateVerses({
                            verses: rows.map((row) => ({ ref: `${row.surah}:${row.ayah}`, arabic: row.arabic })),
                            language,
                            feature: AI_FEATURE_TAGS.workbookTranslate,
                        });
                        return { label: language, byRef: new Map(Object.entries(byRef)) };
                    }
                    const id = typeof pick.id === 'number' ? pick.id : undefined;
                    const label =
                        id !== undefined
                            ? (translators.find((t) => t.id === id)?.name ?? `#${id}`)
                            : (translators.find((t) => t.id === get(activeTranslatorId))?.name ?? 'Default');
                    const refreshed = await loadVerses(rows.map((row) => `${row.surah}:${row.ayah}`), id);
                    const byRef = new Map(refreshed.map((row) => [`${row.surah}:${row.ayah}`, row.translation]));
                    return { label, byRef };
                }),
            );
            return rows.map((row) => {
                const key = `${row.surah}:${row.ayah}`;
                const translations = perPick.map((p) => ({ label: p.label, text: p.byRef.get(key) ?? null }));
                return { ...row, translation: translations[0]?.text ?? null, translations };
            });
        }
        case 'tafsir': {
            // No self-source either — an Ayah card upstream (directly, or by
            // way of a Translate card, which passes surah/ayah straight
            // through) is what supplies the verses. Same table-row drop as
            // `translation` above, for the same reason.
            const rows = input.filter((row): row is VerseRow => !isTableRow(row));
            if (!rows.length) return [];
            // One or more authors can be picked (the + button), each an
            // entry in `tafsirs`.
            const ids = nodeTafsirAuthorIds(node);
            const authors = get(availableTafsirAuthors);
            const perAuthor = await Promise.all(
                ids.map(async (id) => {
                    const label =
                        id !== undefined
                            ? (authors.find((a) => a.id === id)?.name ?? `#${id}`)
                            : (authors.find((a) => a.id === get(activeTafsirId))?.name ?? 'Default');
                    const withTafsir = await attachTafsir(rows, id);
                    const byRef = new Map(withTafsir.map((row) => [`${row.surah}:${row.ayah}`, row.tafsir]));
                    return { label, byRef };
                }),
            );
            return rows.map((row) => {
                const key = `${row.surah}:${row.ayah}`;
                const tafsirs = perAuthor.map((a) => ({ label: a.label, text: a.byRef.get(key) ?? null }));
                return { ...row, tafsir: tafsirs[0]?.text ?? null, tafsirs };
            });
        }
        case 'related': {
            // No self-source: reads only what is wired in (an Ayah card,
            // directly or by way of a Translate card) — same table-row drop
            // as translation/tafsir above.
            const rows = input.filter((row): row is VerseRow => !isTableRow(row));
            if (!rows.length) return [];
            return relatedTo(rows, node.limit ?? 3);
        }
        case 'filter': {
            const op = node.filterOp ?? 'contains';
            const raw = (node.query ?? '').trim();
            if (!raw) return input;
            // A `data` node's table rows: `filterField` is an arbitrary
            // column name (its first column if unset). Numeric-looking
            // columns compare numerically (so gt/gte/lt/lte mean something);
            // anything else falls back to string comparison — contains/
            // not_contains do a case-insensitive substring match, the rest
            // compare lexicographically.
            if (input.length && isTableRow(input[0])) {
                const rows = input as TableRow[];
                const column = node.filterField || Object.keys(rows[0]?.cells ?? {})[0];
                if (!column) return input;
                const value = Number(raw);
                const numericQuery = raw !== '' && !Number.isNaN(value);
                const needle = raw.toLowerCase();
                const compareNum: Record<string, (a: number) => boolean> = {
                    eq: (a) => a === value,
                    neq: (a) => a !== value,
                    gt: (a) => a > value,
                    gte: (a) => a >= value,
                    lt: (a) => a < value,
                    lte: (a) => a <= value,
                };
                return rows.filter((row) => {
                    const cell = row.cells[column];
                    // Numeric comparison only for the ordering/equality
                    // operators, and only once both sides actually parse as
                    // numbers — contains/not_contains always fall through to
                    // a substring match, numeric cell or not.
                    if (numericQuery && typeof cell === 'number' && op in compareNum) {
                        return compareNum[op](cell);
                    }
                    const text = cell == null ? '' : String(cell).toLowerCase();
                    switch (op) {
                        case 'not_contains':
                            return !text.includes(needle);
                        case 'eq':
                            return text === needle;
                        case 'neq':
                            return text !== needle;
                        case 'gt':
                            return text > needle;
                        case 'gte':
                            return text >= needle;
                        case 'lt':
                            return text < needle;
                        case 'lte':
                            return text <= needle;
                        default:
                            return text.includes(needle);
                    }
                });
            }
            const field = node.filterField ?? 'text';
            const rows = input as VerseRow[];
            if (field === 'text') {
                const needle = raw.toLowerCase();
                const matches = (row: VerseRow) =>
                    [
                        row.arabic,
                        row.translation,
                        row.tafsir,
                        ...(row.translations?.map((t) => t.text) ?? []),
                        ...(row.tafsirs?.map((t) => t.text) ?? []),
                    ]
                        .filter(Boolean)
                        .some((text) => String(text).toLowerCase().includes(needle));
                return rows.filter((row) => (op === 'not_contains' ? !matches(row) : matches(row)));
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
            return rows.filter((row) => test(field === 'surah' ? row.surah : row.ayah));
        }
        case 'limit':
            // Kind-agnostic — works the same whether `input` is verse or
            // table rows.
            return input.slice(0, Math.max(1, node.limit ?? 5));
        case 'dedupe': {
            // A `data` node's table rows have no natural ref to key on, so
            // the whole row (every cell) has to match for two to count as
            // duplicates.
            const seen = new Set<string>();
            return input.filter((row) => {
                const key = isTableRow(row) ? JSON.stringify(row.cells) : `${row.surah}:${row.ayah}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }
        case 'julia':
            // No self-source — a processor node only ever acts on what flows
            // into it. Compatibility with whatever's wired downstream
            // (Filter, View, ...) is handled entirely inside
            // runWorkbookJulia. `sqlitePath` reaches Julia code even when
            // `input` is empty (e.g. every row got filtered out but the
            // reader's own code still wants to query the file directly).
            return input.length || sqlitePath ? runWorkbookJulia(node, input, sqlitePath) : [];
        case 'lean': {
            // Lean has no practical way to run SQL without a package that
            // isn't part of a stock install (see workbook-code-nodes.ts), so
            // it only ever works from verse rows, same as
            // translation/tafsir/related above — no `sqlitePath` threading.
            const rows = input.filter((row): row is VerseRow => !isTableRow(row));
            return rows.length ? runWorkbookLean(node, rows) : [];
        }
        case 'view':
            return input;
        case 'export':
            // A sink, same as `view` — its export buttons read the card's own
            // already-resolved rows directly rather than reshaping them here.
            return input;
        default:
            return [];
    }
}

/** Flattens rows to CSV text — Export's "Save as CSV"/"Copy as CSV". Multiple translations/tafsirs join the same way Lean's flattened output does, so the two conventions stay in sync. */
export function rowsToCsv(rows: WorkbookRow[]): string {
    const csvField = (value: string): string =>
        /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
    if (rows.length && isTableRow(rows[0])) {
        // A `data` node's own columns as the header, in first-seen order —
        // later rows missing a column (a ragged CSV) just leave it blank.
        const tableRows = rows as TableRow[];
        const columns: string[] = [];
        const seen = new Set<string>();
        for (const row of tableRows) {
            for (const key of Object.keys(row.cells)) {
                if (!seen.has(key)) {
                    seen.add(key);
                    columns.push(key);
                }
            }
        }
        const lines = [columns.map(csvField).join(',')];
        for (const row of tableRows) {
            lines.push(columns.map((col) => csvField(row.cells[col] == null ? '' : String(row.cells[col]))).join(','));
        }
        return lines.join('\r\n');
    }
    const verseRows = rows as VerseRow[];
    const flatten = (entries: { label: string; text: string | null }[] | undefined, fallback: string | null | undefined): string => {
        if (entries?.length) {
            return entries.map((e) => (e.label ? `${e.label}: ${e.text ?? ''}` : (e.text ?? ''))).join(' | ');
        }
        return fallback ?? '';
    };
    const header = ['Surah', 'Ayah', 'Arabic', 'Translation', 'Tafsir'];
    const lines = [header.map(csvField).join(',')];
    for (const row of verseRows) {
        lines.push(
            [
                String(row.surah),
                String(row.ayah),
                row.arabic,
                flatten(row.translations, row.translation),
                flatten(row.tafsirs, row.tafsir),
            ]
                .map(csvField)
                .join(','),
        );
    }
    return lines.join('\r\n');
}

/**
 * What every data node on the board currently shows, resolved in one pass:
 * a node with no incoming edge is its own source (or, for the shape/output
 * kinds, empty); a node with one is fed the upstream node's own resolved
 * rows, recursively. Memoised per node id and guarded against a cycle (a
 * wire loop resolves to empty rows rather than hanging).
 */
export async function resolveNodeOutputs(doc: WorkbookDoc): Promise<Map<string, WorkbookRow[]>> {
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    const incoming = new Map(doc.edges.map((e) => [e.to, e.from]));
    const resolved = new Map<string, WorkbookRow[]>();
    const resolving = new Set<string>();

    /**
     * The nearest `data` node reachable by walking straight up the wiring
     * from `id` — through as many Filter/Limit/Dedupe/etc. hops as it takes
     * — so a `julia` node gets a real SQL-queryable file even when it isn't
     * wired directly to the `data` node itself. `seen` guards a wire loop.
     */
    function nearestDataSqlitePath(id: string, seen: Set<string> = new Set()): string | undefined {
        if (seen.has(id)) return undefined;
        seen.add(id);
        const node = byId.get(id);
        if (!node) return undefined;
        if (node.kind === 'data') return node.dataSourcePath;
        const upstreamId = incoming.get(id);
        return upstreamId ? nearestDataSqlitePath(upstreamId, seen) : undefined;
    }

    async function resolve(id: string): Promise<WorkbookRow[]> {
        const cached = resolved.get(id);
        if (cached) return cached;
        const node = byId.get(id);
        if (!node || resolving.has(id)) return [];
        resolving.add(id);
        const upstreamId = incoming.get(id);
        const input = upstreamId ? await resolve(upstreamId) : [];
        const sqlitePath = node.kind === 'julia' ? nearestDataSqlitePath(id) : undefined;
        const rows = await transformNode(node, input, sqlitePath);
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

export const escapeXml = (text: string) =>
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
    data: { fill: '#e8f6f6', stroke: '#a0d4d4' },
    translation: { fill: '#eef6f4', stroke: '#a9cfc6' },
    tafsir: { fill: '#f2f0fa', stroke: '#cfc4e8' },
    related: { fill: '#eef4f7', stroke: '#a8c8d8' },
    filter: { fill: '#f4f2fa', stroke: '#c3b6ea' },
    limit: { fill: '#f4f2fa', stroke: '#c3b6ea' },
    dedupe: { fill: '#f4f2fa', stroke: '#c3b6ea' },
    julia: { fill: '#f3ecfa', stroke: '#c9a8e0' },
    lean: { fill: '#e9f1fb', stroke: '#a9c6e8' },
    view: { fill: '#eef7f0', stroke: '#9dd4c8' },
    export: { fill: '#fdf1e6', stroke: '#e0b98f' },
    title: { fill: '#ffffff00', stroke: '#ffffff00' },
    note: { fill: '#fffbe8', stroke: '#e8dca8' },
    image: { fill: '#f4f4f4', stroke: '#dcdcdc' },
    logic: { fill: '#f0f4fb', stroke: '#b3c4e0' },
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
            const bodyText =
                node.kind === 'note'
                    ? (node.text ?? '')
                    : node.kind === 'data'
                      ? (node.dataFileName ?? '')
                      : node.kind === 'logic'
                        // The exported SVG is also the saved file, so a proof
                        // has to be readable in it: show the plain-language
                        // reading if the author wrote one, else the formal text.
                        ? (node.logic?.plainLanguage?.trim() || node.logic?.source || '')
                        : nodeRefs(node).join(', ');
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
        case 'data':
            return 'Data';
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
        case 'logic':
            return logicRoleTitle(node);
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

/**
 * Brings a version-1 document up to version 2.
 *
 * Purely additive: every node, edge, group and viewport survives untouched.
 * A version-1 edge had node ids only, which meant "this node's single output
 * feeds that node's single input" — so it is read as exactly that, `out` →
 * `in` with role `data`. Nothing about how the row pipeline resolves is
 * changed by this; the ports are recorded so the one connection model can
 * describe both dialects.
 */
function migrateToV2(doc: WorkbookDoc): WorkbookDoc {
    if (doc.version === WORKBOOK_SCHEMA_VERSION) {
        // Already v2, but a hand-edited or partially-written file may still be
        // missing port fields; fill them in the same way.
        return { ...doc, edges: migrateEdges(doc.edges) };
    }
    return {
        ...doc,
        version: WORKBOOK_SCHEMA_VERSION,
        edges: migrateEdges(doc.edges),
        logic: doc.logic ?? undefined,
    };
}

function migrateEdges(edges: WorkbookEdge[]): WorkbookEdge[] {
    return edges.map((edge) =>
        edge.fromPort && edge.toPort
            ? edge
            : { ...edge, fromPort: edge.fromPort ?? 'out', toPort: edge.toPort ?? 'in', role: edge.role ?? 'data' },
    );
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
        return migrateToV2(migratePipelineNodes(doc));
    } catch {
        return null;
    }
}

// ── The window ──────────────────────────────────────────────────────────────

const WORKBOOK_WINDOW = 'workbook';

/**
 * Asks an already-open workbook window to add a tab — blank, or loading a
 * path — rather than replacing whatever the reader already has open. This is
 * what turns a second "Create Workbook" into a new tab instead of a second
 * window.
 */
export const WORKBOOK_NEW_TAB_EVENT = 'workbook:new-tab';

/**
 * The pop-out/reattach handshake for dragging a tab between Workbook windows
 * (see WorkbookTabStrip.svelte, which drives all four of these):
 *  1. A freshly popped-out window announces itself ready with `tab-ready`,
 *     carrying the id of the tab it was opened to receive.
 *  2. The window that popped it out replies with `seed-tab`, carrying that
 *     tab's document — the only way data reaches a brand new window, since
 *     `openAppWindow` has no channel for arbitrary init payloads.
 *  3. While a single-tab window is being dragged by its tab, the dragged
 *     window polls window positions and tells whichever window it is
 *     hovering over via `drop-hover`, so that window can show a highlight.
 *  4. On drop over a target, the dragged window hands over its whole tab
 *     list with `attach-tabs` and closes itself.
 * All four are window-scoped (`emitTo`), not the app-global `emit` other
 * events in this file use — this chatter is only ever meant for one other
 * specific window, never every open window in the app.
 */
export const WORKBOOK_TAB_READY_EVENT = 'workbook:tab-ready';
export const WORKBOOK_SEED_TAB_EVENT = 'workbook:seed-tab';
export const WORKBOOK_DROP_HOVER_EVENT = 'workbook:drop-hover';
export const WORKBOOK_ATTACH_TABS_EVENT = 'workbook:attach-tabs';

/**
 * A workbook gets a window of its own, like the Verse Study canvas — but
 * only the first one opened; every "Create Workbook" after that adds a tab
 * to it instead, which is why this always targets the one fixed label.
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
            await win.emit(WORKBOOK_NEW_TAB_EVENT, { path });
        },
    });
}

/** In-app fallback panel, for when there is no Tauri window to open. */
export const workbookOpen = writable(false);
