import { readable } from "svelte/store";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Whether the window currently fills the screen — maximised or fullscreen.
 *
 * Two things need this and they must agree: the maximise button swaps its glyph
 * for the "restore" one, and on Linux the app draws its own rounded frame (see
 * `.csd-floating` in app.css) which has to square off when the window is edge
 * to edge, exactly as GNOME's own decorations do. Sharing one `onResized`
 * listener keeps them from disagreeing for a frame after a fast toggle.
 *
 * Outside Tauri — browser dev — nothing subscribes to a window, so this stays
 * false and the frame simply never rounds.
 */
export const windowMaximized = readable(false, (set) => {
    let unlisten: (() => void) | undefined;
    let stopped = false;

    void (async () => {
        try {
            const w = getCurrentWindow();
            const read = async () =>
                set((await w.isMaximized()) || (await w.isFullscreen()));
            await read();
            const un = await w.onResized(read);
            // The store may have been dropped while we were awaiting.
            if (stopped) un();
            else unlisten = un;
        } catch {
            /* not running inside Tauri */
        }
    })();

    return () => {
        stopped = true;
        unlisten?.();
    };
});
