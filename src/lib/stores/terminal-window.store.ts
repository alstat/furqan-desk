import { get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { openAppWindow } from '$lib/utils/appWindow';
import { openFolderPath } from './tabs.store';

/**
 * Visibility of the in-app terminal panel. Only the fallback path uses this —
 * when the app runs inside Tauri the terminal gets an OS window of its own.
 */
export const terminalDialogOpen = writable(false);

/** Folder changes are broadcast on this so an open terminal window keeps up. */
const CWD_EVENT = 'terminal:cwd';

/** Label of the terminal's own OS window. */
export const TERMINAL_WINDOW = 'terminal';

/**
 * The terminal runs in a window of its own so it behaves like a native terminal
 * — its own entry in the dock/taskbar, and it stays put beside the reader
 * instead of floating over it.
 *
 * The shells are PTYs owned by the Rust side, so this window talks to them over
 * the same commands and `pty-output` events the panel always used. The one
 * thing it cannot work out for itself is where to start them: the folder the
 * File Explorer has open lives in the main window's memory, and this window
 * boots a fresh JS context. It rides in on the query string, and later changes
 * follow over `CWD_EVENT` (see `installTerminalCwdHost`). With neither, the
 * shell starts in $HOME — see `start_pty` in pty.rs.
 */
function openTerminalWindow(): Promise<boolean> {
    const folder = browser ? get(openFolderPath) : null;
    const params = new URLSearchParams();
    if (folder) params.set('cwd', folder);

    return openAppWindow({
        label: TERMINAL_WINDOW,
        url: `/terminal/${params.toString() ? `?${params}` : ''}`,
        title: 'Terminal',
        width: 900,
        height: 560,
        minWidth: 640,
        minHeight: 360,
        // Already open: it may have booted before this folder was picked, so
        // hand it the current one — the next shell it starts uses it.
        onExisting: async () => {
            const { emit } = await import('@tauri-apps/api/event');
            await emit(CWD_EVENT, get(openFolderPath) ?? '');
        },
    });
}

/**
 * Main window: publish the open folder so the terminal window starts new shells
 * where the File Explorer is pointing, even if the folder changed after the
 * window was opened.
 */
export function installTerminalCwdHost(): void {
    if (!browser) return;
    let last: string | null = get(openFolderPath);
    openFolderPath.subscribe((folder) => {
        if (folder === last) return;
        last = folder;
        void (async () => {
            try {
                const { emit } = await import('@tauri-apps/api/event');
                await emit(CWD_EVENT, folder ?? '');
            } catch {
                /* not running inside Tauri */
            }
        })();
    });
}

/**
 * Terminal window: adopt the folder the main window is showing. Returns a
 * disposer for the listener.
 */
export async function installTerminalCwdClient(): Promise<() => void> {
    if (!browser) return () => {};
    try {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen<string>(CWD_EVENT, (e) => {
            openFolderPath.set(e.payload || null);
        });
    } catch {
        return () => {};
    }
}

/** Open the terminal, or focus it if it is already open. */
export async function openTerminal(): Promise<void> {
    if (await openTerminalWindow()) return;
    // Fallback: the floating panel inside the main window.
    terminalDialogOpen.set(true);
}
