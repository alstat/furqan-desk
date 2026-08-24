import { writable } from 'svelte/store';
import { openAppWindow } from '$lib/utils/appWindow';

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
function openTerminalWindow(): Promise<boolean> {
    return openAppWindow({
        label: TERMINAL_WINDOW,
        url: '/terminal/',
        title: 'Terminal',
        width: 900,
        height: 560,
        minWidth: 640,
        minHeight: 360,
    });
}

/** Open the terminal, or focus it if it is already open. */
export async function openTerminal(): Promise<void> {
    if (await openTerminalWindow()) return;
    // Fallback: the floating panel inside the main window.
    terminalDialogOpen.set(true);
}
