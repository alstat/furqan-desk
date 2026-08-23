import { get } from 'svelte/store';
import { juliaPlots, type JuliaPlot } from './editor.store';

/** Label of the plot viewer's own OS window. */
export const JULIA_PLOT_WINDOW = 'julia-plots';

/**
 * Unlike the other secondary windows, this one cannot rebuild its own contents.
 * The manuscript viewer refetches from Rust and the terminal talks to PTYs Rust
 * owns, but plots exist only as entries in `juliaPlots`, appended by whichever
 * window is running the REPL. A fresh window starts with an empty store.
 *
 * So the store is mirrored across windows over Tauri events. Both sides send
 * the whole list on change and apply whatever they receive; a plot arrives, is
 * deleted or the list is cleared only at user pace, so the simplicity is worth
 * more than diffing. `applyingRemote` stops an applied update from being
 * echoed straight back.
 */
const PLOTS_EVENT = 'julia-plots:changed';
const REQUEST_EVENT = 'julia-plots:request';

let applyingRemote = false;
let installed = false;

/**
 * Mirror `juliaPlots` between this window and the others. Safe to call from any
 * window and more than once; outside Tauri it does nothing.
 */
export async function installPlotSync(): Promise<void> {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    try {
        const { emit, listen } = await import('@tauri-apps/api/event');

        await listen<JuliaPlot[]>(PLOTS_EVENT, (e) => {
            applyingRemote = true;
            try {
                juliaPlots.set(e.payload);
            } finally {
                applyingRemote = false;
            }
        });

        // A window that has just opened asks for the current list; whoever has
        // one answers. The asker ignores its own request because its list is
        // empty at that point.
        await listen(REQUEST_EVENT, () => {
            const plots = get(juliaPlots);
            if (plots.length) void emit(PLOTS_EVENT, plots);
        });

        juliaPlots.subscribe((plots) => {
            if (applyingRemote) return;
            void emit(PLOTS_EVENT, plots);
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
async function openPlotWindow(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

        const existing = await WebviewWindow.getByLabel(JULIA_PLOT_WINDOW);
        if (existing) {
            await existing.unminimize().catch(() => {});
            await existing.setFocus();
            return true;
        }

        // Frameless: the viewer's own header doubles as the title bar, the same
        // trade the main window makes. macOS keeps its traffic lights by
        // overlaying them on that header; Windows and Linux have no equivalent,
        // so they go undecorated and the header draws its own controls.
        const isMac = navigator.userAgent.includes('Mac');
        const chrome = isMac
            ? { titleBarStyle: 'overlay' as const, hiddenTitle: true }
            : { decorations: false };

        const win = new WebviewWindow(JULIA_PLOT_WINDOW, {
            // Trailing slash: the build emits `julia-plots/index.html`, which is
            // what Tauri's asset protocol resolves this path to.
            url: '/julia-plots/',
            title: 'Plots',
            width: 720,
            height: 620,
            minWidth: 420,
            minHeight: 360,
            resizable: true,
            focus: true,
            ...chrome,
        });

        return await new Promise<boolean>((resolve) => {
            let settled = false;
            const settle = (ok: boolean) => {
                if (settled) return;
                settled = true;
                resolve(ok);
            };
            void win.once('tauri://created', () => settle(true));
            void win.once('tauri://error', (e) => {
                console.error('plot window failed to open', e);
                settle(false);
            });
            setTimeout(() => settle(false), 4000);
        });
    } catch {
        return false;
    }
}

/** Open the plot viewer, or focus it if it is already open. */
export async function openJuliaPlotViewer(): Promise<boolean> {
    return openPlotWindow();
}
