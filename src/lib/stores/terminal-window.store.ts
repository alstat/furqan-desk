import { writable } from 'svelte/store';

/**
 * Visibility of the in-app terminal panel. Only the fallback path uses this —
 * when the app runs inside Tauri the terminal gets an OS window of its own.
 */
export const terminalDialogOpen = writable(false);

/** Label of the terminal's own OS window. */
export const TERMINAL_WINDOW = 'terminal';

/**
 * The terminal runs in a window of its own so it behaves like a native terminal
 * — its own entry in the dock/taskbar, and it stays put beside the reader
 * instead of floating over it.
 *
 * Nothing needs handing over: the shells are PTYs owned by the Rust side, and
 * this window talks to them over the same commands and `pty-output` events the
 * panel always used.
 */
async function openTerminalWindow(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

        const existing = await WebviewWindow.getByLabel(TERMINAL_WINDOW);
        if (existing) {
            // Already open: bring it forward rather than starting a second
            // shell on top of the running one.
            await existing.unminimize().catch(() => {});
            await existing.setFocus();
            return true;
        }

        // Frameless: the terminal's own header doubles as the title bar, the
        // same trade the main window makes. macOS keeps its traffic lights by
        // overlaying them on that header; Windows and Linux have no equivalent,
        // so they go undecorated and the header draws its own controls.
        const isMac = navigator.userAgent.includes('Mac');
        const chrome = isMac
            ? { titleBarStyle: 'overlay' as const, hiddenTitle: true }
            : { decorations: false };

        const win = new WebviewWindow(TERMINAL_WINDOW, {
            // Trailing slash: the build emits `terminal/index.html`, which is
            // what Tauri's asset protocol resolves this path to.
            url: '/terminal/',
            title: 'Terminal',
            width: 900,
            height: 560,
            minWidth: 640,
            minHeight: 360,
            resizable: true,
            focus: true,
            ...chrome,
        });

        // Creation is asynchronous on the Rust side; a failure arrives here
        // rather than as a rejected constructor.
        return await new Promise<boolean>((resolve) => {
            let settled = false;
            const settle = (ok: boolean) => {
                if (settled) return;
                settled = true;
                resolve(ok);
            };
            void win.once('tauri://created', () => settle(true));
            void win.once('tauri://error', (e) => {
                console.error('terminal window failed to open', e);
                settle(false);
            });
            // Never leave the button dead if neither event arrives.
            setTimeout(() => settle(false), 4000);
        });
    } catch {
        // Not running inside Tauri (browser dev), or the webview API is
        // unavailable — the caller falls back to the in-app panel.
        return false;
    }
}

/** Open the terminal, or focus it if it is already open. */
export async function openTerminal(): Promise<void> {
    if (await openTerminalWindow()) return;
    // Fallback: the floating panel inside the main window.
    terminalDialogOpen.set(true);
}
