import { get } from 'svelte/store';
import { openAppWindow } from '$lib/utils/appWindow';
import { juliaPlots, type JuliaPlot } from './editor.store';

/** Label of the plot viewer's own OS window. */
export const JULIA_PLOT_WINDOW = 'julia-plots';

/**
 * Unlike the other secondary windows, this one cannot rebuild its own contents.
 * The manuscript viewer refetches from Rust and the terminal talks to PTYs Rust
 * owns, but plots exist only as entries in `juliaPlots`, appended by whichever
 * window is running the REPL. A fresh window starts with an empty store.
 *
 * So the store is mirrored across windows over Tauri events. What travels is a
 * message describing the change rather than the whole list: `plot.data` is
 * base64 image bytes — or, for plotly, an entire HTML document — so resending
 * every plot on every change costs one full session's worth of images per new
 * plot, broadcast to every open window. Appending one plot now sends one plot,
 * and dropping plots sends nothing but ids.
 *
 * The full list still travels on request, which is how a window that just
 * opened gets a starting point, and as the fallback for any change the diff
 * below cannot describe. `applyingRemote` stops an applied update from being
 * echoed straight back.
 */
const PLOTS_EVENT = 'julia-plots:changed';
const REQUEST_EVENT = 'julia-plots:request';

type PlotSyncMessage =
    /** The whole list, for a window that just asked or a change we cannot describe. */
    | { kind: 'all'; plots: JuliaPlot[] }
    /** One plot appended. */
    | { kind: 'add'; plot: JuliaPlot }
    /** Plots were removed or cleared: these are the ids that survive, in order. */
    | { kind: 'keep'; ids: string[] };

let applyingRemote = false;
let installed = false;

/** Describe `next` in terms of `prev`, as small a message as the change allows. */
function diffPlots(prev: JuliaPlot[], next: JuliaPlot[]): PlotSyncMessage {
    const prevIds = prev.map((p) => p.id);
    const nextIds = next.map((p) => p.id);

    const appended =
        nextIds.length === prevIds.length + 1 &&
        prevIds.every((id, i) => nextIds[i] === id);
    if (appended) return { kind: 'add', plot: next[next.length - 1] };

    // Nothing new, so whatever happened was a removal, a clear, or a reorder of
    // plots the other side already has.
    const prevSet = new Set(prevIds);
    if (nextIds.every((id) => prevSet.has(id))) return { kind: 'keep', ids: nextIds };

    return { kind: 'all', plots: next };
}

function applyRemote(message: PlotSyncMessage): void {
    applyingRemote = true;
    try {
        if (message.kind === 'all') {
            juliaPlots.set(message.plots);
        } else if (message.kind === 'add') {
            const plot = message.plot;
            juliaPlots.update((plots) =>
                plots.some((p) => p.id === plot.id) ? plots : [...plots, plot],
            );
        } else {
            const keep = new Set(message.ids);
            juliaPlots.update((plots) => plots.filter((p) => keep.has(p.id)));
        }
    } finally {
        applyingRemote = false;
    }
}

/**
 * Mirror `juliaPlots` between this window and the others. Safe to call from any
 * window and more than once; outside Tauri it does nothing.
 */
export async function installPlotSync(): Promise<void> {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    try {
        const { emit, listen } = await import('@tauri-apps/api/event');

        await listen<PlotSyncMessage>(PLOTS_EVENT, (e) => applyRemote(e.payload));

        // A window that has just opened asks for the current list; whoever has
        // one answers. The asker ignores its own request because its list is
        // empty at that point.
        await listen(REQUEST_EVENT, () => {
            const plots = get(juliaPlots);
            if (plots.length) void emit(PLOTS_EVENT, { kind: 'all', plots });
        });

        // Seeded before subscribing so the callback Svelte fires immediately —
        // with the value we just read — is recognised as "nothing changed" and
        // sent nowhere. It used to be published like any other change, which
        // meant a plot window opening with an empty store broadcast that empty
        // list and wiped the plots out of the window that had them.
        let lastSeen = get(juliaPlots);
        juliaPlots.subscribe((plots) => {
            const previous = lastSeen;
            lastSeen = plots;
            if (applyingRemote || plots === previous) return;
            void emit(PLOTS_EVENT, diffPlots(previous, plots));
        });
    } catch {
        // Not running inside Tauri (browser dev) — the single-window store is
        // all there is, and it already works.
    }
}

/** Ask the other windows for the current plot list. */
export async function requestPlots(): Promise<void> {
    try {
        const { emit } = await import('@tauri-apps/api/event');
        await emit(REQUEST_EVENT, null);
    } catch {
        /* not inside Tauri */
    }
}

/**
 * The viewer runs in a window of its own so a plot can sit beside the code that
 * produced it instead of floating over it.
 */
function openPlotWindow(): Promise<boolean> {
    return openAppWindow({
        label: JULIA_PLOT_WINDOW,
        url: '/julia-plots/',
        title: 'Plots',
        width: 720,
        height: 620,
        minWidth: 420,
        minHeight: 360,
    });
}

/** Open the plot viewer, or focus it if it is already open. */
export async function openJuliaPlotViewer(): Promise<boolean> {
    return openPlotWindow();
}
