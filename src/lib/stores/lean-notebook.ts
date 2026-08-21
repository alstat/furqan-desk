/**
 * Notebook-cell execution for the Lexical editor's Lean 4 code cells.
 *
 * Cells compile against their own dedicated runtime (`kernel: "cell"`),
 * separate from the one backing the standalone .lean editor's infoview — so a
 * long elaboration in one never blocks or cancels the other. Compiles are
 * queued and run strictly one at a time, because the Rust side cancels any
 * in-flight compile for a kernel when a new request arrives; without the queue
 * a "Run all" would leave every cell but the last with no output.
 */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import {
    leanCellRuntime,
    countBySeverity,
    type LeanDiagnostic,
    type LeanCompileResult,
} from './lean-compiler.store';

/**
 * Shared display preferences for every Lean code cell. Adjusting the font size
 * or line height on one cell updates all of them, since each cell reads from
 * these stores rather than keeping its own local state. Persisted so the
 * user's last choice carries across sessions and files.
 */
function readNumber(key: string, fallback: number): number {
    if (!browser) return fallback;
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

export const leanCellFontSize = writable(readNumber('leanCellFontSize', 12));
leanCellFontSize.subscribe((v) => {
    if (browser) localStorage.setItem('leanCellFontSize', String(v));
});

export const leanCellLineHeight = writable(readNumber('leanCellLineHeight', 1.4));
leanCellLineHeight.subscribe((v) => {
    if (browser) localStorage.setItem('leanCellLineHeight', String(v));
});

/**
 * Whether Lean cells recompile as you type. Shared across every cell so the
 * toggle in one cell's header governs the whole document, which is what makes
 * it read as a document-level mode rather than a per-cell quirk.
 */
export const leanCellLiveCompile = writable(
    browser ? localStorage.getItem('leanCellLiveCompile') === 'true' : false,
);
leanCellLiveCompile.subscribe((v) => {
    if (browser) localStorage.setItem('leanCellLiveCompile', String(v));
});

/**
 * Registry of every mounted Lean cell's run handler, keyed by its Lexical node
 * key. "Run all" uses this to drive each cell's own `run()` — so each cell
 * updates its own UI and persists its own result — in document order.
 */
export const leanCellRunners = new Map<string, () => Promise<void>>();

/**
 * Registry of every mounted Lean cell's output-clear handler. Used by "clear
 * all outputs" so a reset is visible across the whole document.
 */
export const leanCellClearers = new Map<string, () => void>();

/** The result a cell persists onto its node and renders beneath the code. */
export interface LeanCellResult {
    diagnostics: LeanDiagnostic[];
    /** Non-diagnostic output (panics, `main` stdout). */
    raw: string;
    ok: boolean;
    elapsedMs: number;
}

export const EMPTY_LEAN_RESULT: LeanCellResult = {
    diagnostics: [],
    raw: '',
    ok: true,
    elapsedMs: 0,
};

interface Job {
    code: string;
    resolve: (result: LeanCellResult | null) => void;
}

const queue: Job[] = [];
let active = false;

async function processQueue(): Promise<void> {
    if (active) return;
    const job = queue.shift();
    if (!job) return;

    active = true;
    try {
        const result: LeanCompileResult | null = await leanCellRuntime.compile(job.code);
        job.resolve(
            result === null
                ? null
                : {
                      diagnostics: result.diagnostics,
                      raw: result.raw,
                      ok: result.ok,
                      elapsedMs: result.elapsed_ms,
                  },
        );
    } finally {
        active = false;
        // Drain anything queued while this one was compiling.
        void processQueue();
    }
}

/**
 * Queue a Lean snippet for compilation against the cell runtime. Resolves with
 * the cell's result, or `null` when the compile was superseded (which only
 * happens if something cancelled the runtime mid-flight).
 */
export function runLeanCell(code: string): Promise<LeanCellResult | null> {
    return new Promise<LeanCellResult | null>((resolve) => {
        queue.push({ code, resolve });
        void processQueue();
    });
}

/**
 * Cancel the compile in flight and drop everything still queued. The Lean
 * runtime has no persistent state to reset, so unlike Julia's kernel restart
 * this only needs to stop work — the next run starts from a clean process
 * regardless.
 */
export async function cancelLeanCells(): Promise<void> {
    // Resolve pending jobs so their cells stop showing a spinner.
    while (queue.length > 0) queue.shift()!.resolve(null);
    await leanCellRuntime.cancel();
}

/** Whether the cell runtime currently has work queued or running. */
export function leanCellsBusy(): boolean {
    return active || queue.length > 0;
}

/** Summary counts for a cell's result, used by the cell header's status pill. */
export function summarizeLeanResult(result: LeanCellResult): {
    errors: number;
    warnings: number;
    infos: number;
} {
    return countBySeverity(result.diagnostics);
}
