/**
 * Notebook-cell execution for the Lexical editor's Julia code cells.
 *
 * Cells share the single global Julia REPL process (the same kernel the
 * Julia REPL pane uses), so variables defined in one cell are visible to
 * later cells and to the REPL. Executions are queued and run strictly one
 * at a time, and the `julia-output` events produced by a run are collected
 * and handed back to the cell that triggered it.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { get, writable } from 'svelte/store';
import { juliaIsRunning } from './julia-terminal.store';

/**
 * Shared display preferences for every Julia code cell. Adjusting the font
 * size or line height on one cell updates all cells, since each cell reads
 * from these stores rather than keeping its own local state.
 */
export const juliaCellFontSize = writable(12);
export const juliaCellLineHeight = writable(1.4);

export interface JuliaCellPlot {
    format: 'png' | 'svg';
    data: string;
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

async function ensureReplStarted(): Promise<void> {
    const { juliaReplStarted } = await import('./editor.store');
    if (!get(juliaReplStarted)) {
        const { openFolderPath } = await import('./tabs.store');
        await invoke('start_julia_repl', { cwd: get(openFolderPath) });
        juliaReplStarted.set(true);
    }
}

async function processQueue(): Promise<void> {
    if (active) return;
    const job = queue.shift();
    if (!job) return;

    active = true;
    juliaIsRunning.set(true);

    let text = '';
    let hasError = false;
    const plots: JuliaCellPlot[] = [];

    const finish = (unlisten: () => void) => {
        unlisten();
        active = false;
        juliaIsRunning.set(false);
        job.resolve({ text, hasError, plots });
        // Drain any cells queued while this one was running.
        void processQueue();
    };

    const unlisten = await listen<{
        chunk: string;
        is_done: boolean;
        error: string | null;
    }>('julia-output', (event) => {
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
                            plots.push({ format: cmd.format, data: cmd.data });
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

    try {
        await ensureReplStarted();
        await invoke('run_julia_code', { code: job.code });
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
