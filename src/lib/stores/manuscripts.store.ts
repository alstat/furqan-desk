import { get, writable } from 'svelte/store';
import { browser } from '$app/environment';

export const manuscriptsEnabled = writable<boolean>(true);

export const manuscriptViewerOpen = writable(false);
export const manuscriptDemoOpen = writable(false);
export const manuscriptAyah = writable<{ surah: number; ayah: number } | null>(null);

/** Label of the viewer's own OS window. */
export const MANUSCRIPT_WINDOW = 'manuscripts';

/**
 * The viewer runs in a window of its own so it behaves like a native document
 * window — its own entry in the dock/taskbar, its own place on screen, and it
 * stays put while you keep reading in the main window.
 *
 * Which ayah to show rides on the query string, because the new window boots a
 * fresh JS context that shares no memory with this one.
 */
async function openManuscriptWindow(): Promise<boolean> {
    if (!browser) return false;
    try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

        const existing = await WebviewWindow.getByLabel(MANUSCRIPT_WINDOW);
        if (existing) {
            // Already open: point it at the new ayah rather than starting over.
            await existing.unminimize().catch(() => {});
            await existing.setFocus();
            const ref = get(manuscriptAyah);
            if (ref) await existing.emit('manuscript-ayah', ref);
            return true;
        }

        const params = new URLSearchParams();
        const ref = get(manuscriptAyah);
        if (ref) {
            params.set('surah', String(ref.surah));
            params.set('ayah', String(ref.ayah));
        }

        // Frameless: the viewer's own header doubles as the title bar, the same
        // trade the main window makes. macOS keeps its traffic lights by
        // overlaying them on that header; Windows and Linux have no equivalent,
        // so they go undecorated and the header draws its own controls.
        const isMac = navigator.userAgent.includes('Mac');
        const chrome = isMac
            ? { titleBarStyle: 'overlay' as const, hiddenTitle: true }
            : { decorations: false };

        const win = new WebviewWindow(MANUSCRIPT_WINDOW, {
            // Trailing slash: the build emits `manuscripts/index.html`, which is
            // what Tauri's asset protocol resolves this path to.
            url: `/manuscripts/?${params}`,
            title: 'Manuscripts',
            width: 1100,
            height: 800,
            minWidth: 820,
            minHeight: 600,
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
                console.error('manuscript window failed to open', e);
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

/**
 * Show the manuscripts for an ayah, or for whatever `manuscriptAyah` already
 * holds when called without one.
 */
export async function openManuscriptViewer(ref?: { surah: number; ayah: number }) {
    if (ref) manuscriptAyah.set(ref);
    if (await openManuscriptWindow()) return;
    // Fallback: the floating panel inside the main window.
    manuscriptViewerOpen.set(true);
}
