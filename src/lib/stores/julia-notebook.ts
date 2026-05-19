/**
 * Notebook-cell execution for the Lexical editor's Julia code cells.
 *
 * Cells run against their own dedicated Julia kernel (`kernel: "cell"`),
 * separate from the kernel backing the Julia REPL pane — so variables and
 * loaded packages are not shared between the two. Variables defined in one
 * cell are still visible to later cells. Executions are queued and run
 * strictly one at a time, and the `julia-output` events produced by a run
 * are collected and handed back to the cell that triggered it.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { get, writable } from 'svelte/store';

/** Kernel name for the notebook cells — kept distinct from the REPL pane's. */
const CELL_KERNEL = 'cell';

/** Whether the dedicated cell kernel has been spawned this session. */
let cellKernelStarted = false;

/**
 * Shared display preferences for every Julia code cell. Adjusting the font
 * size or line height on one cell updates all cells, since each cell reads
 * from these stores rather than keeping its own local state.
 */
export const juliaCellFontSize = writable(12);
export const juliaCellLineHeight = writable(1.4);

/**
 * Registry of every mounted Julia cell's run handler, keyed by its Lexical
 * node key. "Run all" uses this to drive each cell's own `run()` (so each
 * cell updates its UI and persists its result) in document order.
 */
export const juliaCellRunners = new Map<string, () => Promise<void>>();

/**
 * Registry of every mounted Julia cell's output-clear handler, keyed by its
 * Lexical node key. Restarting the kernel uses this to wipe every cell's
 * output, reinforcing that kernel state has been reset.
 */
export const juliaCellClearers = new Map<string, () => void>();

export interface JuliaCellPlot {
    format: 'png' | 'svg' | 'html' | 'plotly';
    /** base64 payload — image bytes for `png`/`svg`, an HTML document for `plotly`. */
    data?: string;
    /** localhost URL of an interactive (WGLMakie/Bonito) plot for `html`. */
    url?: string;
}

export interface JuliaCellResult {
    text: string;
    hasError: boolean;
    plots: JuliaCellPlot[];
}

type CellUpdate = (partial: JuliaCellResult) => void;

interface Job {
    code: string;
    onUpdate: CellUpdate;
    resolve: (result: JuliaCellResult) => void;
}

const queue: Job[] = [];
let active = false;
/** Force-resolves the in-flight cell (if any) — used when restarting the kernel. */
let abortActiveJob: (() => void) | null = null;

async function ensureReplStarted(): Promise<void> {
    if (!cellKernelStarted) {
        const { openFolderPath } = await import('./tabs.store');
        await invoke('start_julia_repl', { cwd: get(openFolderPath), kernel: CELL_KERNEL });
        cellKernelStarted = true;
    }
}

async function processQueue(): Promise<void> {
    if (active) return;
    const job = queue.shift();
    if (!job) return;

    active = true;

    let text = '';
    let hasError = false;
    const plots: JuliaCellPlot[] = [];

    let finished = false;
    const finish = (unlisten: () => void) => {
        if (finished) return;
        finished = true;
        abortActiveJob = null;
        unlisten();
        active = false;
        job.resolve({ text, hasError, plots });
        // Drain any cells queued while this one was running.
        void processQueue();
    };

    const unlisten = await listen<{
        kernel: string;
        chunk: string;
        is_done: boolean;
        error: string | null;
    }>('julia-output', (event) => {
        // Ignore output from the REPL pane's kernel — only handle our own.
        if (event.payload.kernel !== CELL_KERNEL) return;
        const { chunk, is_done, error } = event.payload;
        if (chunk) {
            const rest: string[] = [];
            for (const line of chunk.split('\n')) {
                if (line.startsWith('__AL_CMD__:')) {
                    // Sidecar commands (plots, env, …) emitted by the Julia
                    // display hook. Only plots are surfaced inside a cell.
                    try {
                        const cmd = JSON.parse(line.slice('__AL_CMD__:'.length));
                        if (cmd.type === 'plot') {
                            plots.push({
                                format: cmd.format,
                                data: cmd.data,
                                url: cmd.url,
                            });
                        }
                    } catch {
                        /* ignore malformed sidecar command */
                    }
                } else {
                    rest.push(line);
                }
            }
            const displayChunk = rest.join('\n');
            if (displayChunk) {
                text += text ? `\n${displayChunk}` : displayChunk;
            }
            if (error !== null) hasError = true;
            job.onUpdate({ text, hasError, plots: [...plots] });
        }
        if (is_done) {
            finish(unlisten);
        }
    });

    // Let a kernel restart resolve this cell even if `__JULIA_DONE__` never
    // arrives (because the kernel process was killed).
    abortActiveJob = () => finish(unlisten);

    try {
        await ensureReplStarted();
        await invoke('run_julia_code', { code: job.code, kernel: CELL_KERNEL });
    } catch (err) {
        text += text ? `\n${err}` : String(err);
        hasError = true;
        finish(unlisten);
    }
}

/**
 * Queue a Julia snippet for execution. `onUpdate` is called as output
 * streams in; the returned promise resolves with the final result.
 */
export function runJuliaCell(code: string, onUpdate: CellUpdate): Promise<JuliaCellResult> {
    return new Promise<JuliaCellResult>((resolve) => {
        queue.push({ code, onUpdate, resolve });
        void processQueue();
    });
}

/**
 * Interrupt the cell currently running in the Julia kernel. SIGINT raises an
 * `InterruptException`; the kernel finishes the cell and stays alive, so
 * defined variables and loaded packages are preserved. Rejects on platforms
 * where interrupts aren't supported (callers should restart the kernel then).
 */
export function interruptJuliaCell(): Promise<void> {
    return invoke('interrupt_julia', { kernel: CELL_KERNEL });
}

/**
 * Restart the Julia kernel: kill the process, drop queued cells, and force-
 * resolve any in-flight cell. The next `runJuliaCell` spawns a fresh kernel.
 */
export async function restartJuliaKernel(): Promise<void> {
    queue.length = 0;
    abortActiveJob?.();
    try {
        await invoke('stop_julia_repl', { kernel: CELL_KERNEL });
    } finally {
        cellKernelStarted = false;
        active = false;
    }
}
