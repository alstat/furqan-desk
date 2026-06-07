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
import { browser } from '$app/environment';
import {
    selectedSurahIdx,
    morphologyAyahFilter,
    morphologyMultiSurahList,
} from './quran.svelte';
import { recitationPlaylist } from './recitation.store';
import {
    multiSurahTranslationMap,
    multiSurahTransliterationMap,
    multiSurahWordByWordMap,
} from './translation.store';
import { juliaActiveEnv } from './editor.store';
import type { SurahMorphology } from '$lib/types/morphology';

/** Kernel name for the notebook cells — kept distinct from the REPL pane's. */
const CELL_KERNEL = 'cell';

/** Whether the dedicated cell kernel has been spawned this session. */
let cellKernelStarted = false;

/**
 * Shared display preferences for every Julia code cell. Adjusting the font
 * size or line height on one cell updates all cells, since each cell reads
 * from these stores rather than keeping its own local state. Persisted to
 * localStorage so the user's last choice carries across sessions and files.
 */
function readNumber(key: string, fallback: number): number {
    if (!browser) return fallback;
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

export const juliaCellFontSize = writable(readNumber('juliaCellFontSize', 12));
juliaCellFontSize.subscribe(v => {
    if (browser) localStorage.setItem('juliaCellFontSize', String(v));
});

export const juliaCellLineHeight = writable(readNumber('juliaCellLineHeight', 1.4));
juliaCellLineHeight.subscribe(v => {
    if (browser) localStorage.setItem('juliaCellLineHeight', String(v));
});

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

/**
 * Live iframes for currently-mounted interactive plots, keyed by the plot's
 * identity (`url` for Bonito/WGLMakie, base64 `data` for PlotlyJS/Gadfly).
 * The DOCX exporter uses this so plots that are normally just embedded HTML
 * (Gadfly, PlotlyJS) can be snapshotted to PNG in their *current*
 * (rotated/panned/zoomed) state.
 */
export const juliaPlotIframes = new Map<string, HTMLIFrameElement>();

export function registerJuliaPlotIframe(
    key: string,
    el: HTMLIFrameElement | null,
): void {
    if (el) juliaPlotIframes.set(key, el);
    else juliaPlotIframes.delete(key);
}

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

/**
 * Apply an `AL.surah` / `AL.ayah` navigation command emitted by a cell (the
 * Julia display hook writes these as `__AL_CMD__:{"type":"display",…}` lines).
 * Mirrors the REPL pane's handling so the same APIs drive the MorphologyView
 * whether they're run from the REPL or a notebook cell. `onError` surfaces
 * load/validation problems back to the originating cell.
 */
function applyAlDisplayCommand(
    surahs: number[],
    ayahs: number[] | null,
    onError: (message: string) => void,
): void {
    if (surahs.length === 1 && ayahs === null) {
        // Simple single-surah navigation — let SurahWidget load it.
        morphologyMultiSurahList.set(null);
        morphologyAyahFilter.set(null);
        recitationPlaylist.set(null);
        multiSurahTranslationMap.set(null);
        multiSurahTransliterationMap.set(null);
        multiSurahWordByWordMap.set(null);
        selectedSurahIdx.set(surahs[0]);
        return;
    }

    // Load surahs, validate ayah numbers, display.
    void (async () => {
        const ayahFilter = ayahs;
        const loaded: SurahMorphology[] = [];
        for (const surahNum of surahs) {
            try {
                const data = await invoke<SurahMorphology>(
                    'get_surah_morphology',
                    { surahNumber: surahNum },
                );
                if (ayahFilter !== null) {
                    const maxAyah = Math.max(...data.ayahs.map((a) => a.ayah));
                    const missing = ayahFilter.filter((n) => n > maxAyah);
                    if (missing.length > 0) {
                        onError(
                            `Surah ${surahNum} has only ${maxAyah} ayahs — requested: ${missing.join(', ')}`,
                        );
                    }
                }
                loaded.push(data);
            } catch (e) {
                onError(`Failed to load surah ${surahNum}: ${e}`);
            }
        }
        if (loaded.length === 0) return;
        morphologyMultiSurahList.set(loaded);
        morphologyAyahFilter.set(ayahFilter);
        if (surahs.length === 1) selectedSurahIdx.set(surahs[0]);
        // Build an ordered playlist from the displayed ayahs.
        const playlist: { surah: number; ayah: number }[] = [];
        for (const surahData of loaded) {
            const surahAyahs = ayahFilter
                ? surahData.ayahs.filter((a) => ayahFilter.includes(a.ayah))
                : surahData.ayahs;
            for (const a of surahAyahs) {
                playlist.push({ surah: surahData.surah, ayah: a.ayah });
            }
        }
        recitationPlaylist.set(playlist.length > 0 ? playlist : null);
    })();
}

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
                    // Sidecar commands (plots, env, display) emitted by the
                    // Julia display hook. Plots render inline in the cell;
                    // `display` (AL.surah/AL.ayah) drives the MorphologyView,
                    // and `env` updates the active-environment indicator.
                    try {
                        const cmd = JSON.parse(line.slice('__AL_CMD__:'.length));
                        if (cmd.type === 'plot') {
                            plots.push({
                                format: cmd.format,
                                data: cmd.data,
                                url: cmd.url,
                            });
                        } else if (cmd.type === 'env') {
                            juliaActiveEnv.set(String(cmd.name ?? ''));
                        } else if (cmd.type === 'display') {
                            applyAlDisplayCommand(
                                cmd.surahs,
                                cmd.ayahs,
                                (message) => {
                                    text += text ? `\n${message}` : message;
                                    hasError = true;
                                    job.onUpdate({
                                        text,
                                        hasError,
                                        plots: [...plots],
                                    });
                                },
                            );
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
        if (/not installed|set the path/i.test(String(err))) {
            const { openJuliaInstallPrompt } = await import('./julia-install.store');
            openJuliaInstallPrompt();
        }
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
