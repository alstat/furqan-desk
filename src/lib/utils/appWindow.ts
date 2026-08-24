/**
 * Opening one of the app's secondary windows.
 *
 * Every panel that can be pulled out into an OS window of its own — terminal,
 * manuscripts, postcard, drawing, plots, translation, tafsir, AI chat — needs
 * the same six things: focus the window if it is already open, work out the
 * per-platform title-bar treatment, create it, and resolve a boolean once Tauri
 * says it exists (or does not). That was copied into each store, which is how a
 * one-line change like "Linux windows are transparent too" turned into a
 * seven-file edit with seven chances to miss one.
 *
 * `false` means "no window" — either the create failed, or we are not inside
 * Tauri at all (browser dev). Every caller treats that as "fall back to the
 * floating in-app panel".
 */
import type { WebviewWindow } from '@tauri-apps/api/webviewWindow';

/**
 * How long to wait for Tauri to confirm the window before giving up.
 *
 * Creation happens on the Rust side and reports back by event; if neither event
 * arrives the caller must still hear something, or the button that opened the
 * window stays dead for the rest of the session.
 */
const CREATE_TIMEOUT_MS = 4000;

/**
 * Title-bar treatment, decided per platform.
 *
 * The window is frameless because the panel's own header doubles as its title
 * bar. macOS keeps its native traffic lights by overlaying them on that header;
 * Windows and Linux have no equivalent, so they run undecorated and the header
 * draws its own controls (see WindowControls.svelte).
 *
 * Linux goes transparent as well: its frame is drawn in CSS, and the drop
 * shadow needs the margin around the frame to be genuinely see-through (see
 * `.csd-dialog` in app.css). Windows keeps an opaque frame — it casts no such
 * shadow. Android reports "Linux" too and draws none of this.
 */
function windowChrome() {
    const ua = navigator.userAgent;
    if (ua.includes('Mac')) {
        return { titleBarStyle: 'overlay' as const, hiddenTitle: true };
    }
    const isLinux = ua.includes('Linux') && !ua.includes('Android');
    return { decorations: false, transparent: isLinux };
}

export interface AppWindowSpec {
    /** Tauri window label. Also what `getByLabel` matches on, so it must be stable. */
    label: string;
    /**
     * Route to load. Needs its trailing slash: the build emits
     * `<route>/index.html`, which is what Tauri's asset protocol resolves to.
     */
    url: string;
    title: string;
    width: number;
    height: number;
    minWidth?: number;
    minHeight?: number;
    /**
     * The window was already open and has just been focused — a chance to point
     * it at whatever the user asked for this time (a different ayah, another
     * drawing) instead of leaving them looking at the last one.
     */
    onExisting?: (win: WebviewWindow) => void | Promise<void>;
    /** The window reported itself created. */
    onCreated?: () => void;
    /** The window went away, however it went away. */
    onDestroyed?: () => void;
}

/** Open a secondary window, or focus it if it is already open. */
export async function openAppWindow(spec: AppWindowSpec): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

        const existing = await WebviewWindow.getByLabel(spec.label);
        if (existing) {
            // Bring it forward rather than starting a second one on top of it —
            // whatever state it holds (a running shell, a half-finished card) is
            // never thrown away by a stray click on the button that opened it.
            await existing.unminimize().catch(() => {});
            await existing.setFocus();
            await spec.onExisting?.(existing);
            return true;
        }

        const win = new WebviewWindow(spec.label, {
            url: spec.url,
            title: spec.title,
            width: spec.width,
            height: spec.height,
            minWidth: spec.minWidth,
            minHeight: spec.minHeight,
            resizable: true,
            focus: true,
            ...windowChrome(),
        });

        // Creation is asynchronous on the Rust side; a failure arrives here
        // rather than as a rejected constructor.
        return await new Promise<boolean>((resolve) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            let settled = false;
            const settle = (ok: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(ok);
            };
            void win.once('tauri://created', () => {
                spec.onCreated?.();
                settle(true);
            });
            void win.once('tauri://error', (e) => {
                console.error(`${spec.label} window failed to open`, e);
                settle(false);
            });
            if (spec.onDestroyed) void win.once('tauri://destroyed', spec.onDestroyed);
            timer = setTimeout(() => settle(false), CREATE_TIMEOUT_MS);
        });
    } catch {
        // Not running inside Tauri (browser dev), or the webview API is
        // unavailable — the caller falls back to the in-app panel.
        return false;
    }
}
