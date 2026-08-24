import { derived, readable } from "svelte/store";
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

/** Android also reports "Linux" in its user agent and has no window frame to draw. */
export const isLinuxCsd =
    typeof navigator !== "undefined" &&
    navigator.userAgent.includes("Linux") &&
    !navigator.userAgent.includes("Android");

/**
 * Whether the webview fell back to software compositing, where a transparent
 * window paints black outside the radius instead of see-through — see the
 * matching check in +layout.svelte, which is what actually drives the
 * rounding/margin classes on <html>. Kept here too so `csdRound` below can
 * agree with it without a second `invoke` call racing the first.
 */
const softwareCompositing = readable(false, (set) => {
    void (async () => {
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            set(await invoke("software_compositing"));
        } catch {
            /* not running inside Tauri (e.g. browser dev) */
        }
    })();
});

/** Mirrors +layout.svelte's `csdRound`: the frame only floats (rounds, and — see
 * `csdMarginPx` below — reserves its shadow margin) while unmaximised and able
 * to render true transparency. */
export const csdRound = derived(
    [windowMaximized, softwareCompositing],
    ([$windowMaximized, $softwareCompositing]) =>
        isLinuxCsd && !$windowMaximized && !$softwareCompositing,
);

/** Keep in sync with the `margin` on `html.linux-csd.csd-round.csd-dialog
 * .app-shell` in app.css — this is that same number, for the rare bit of
 * layout math (e.g. +page.svelte's JS-measured row height) that has to
 * account for app-shell being inset from the true window bounds by it. */
export const CSD_SHADOW_MARGIN_PX = 8;

/** 0 when the shell is full-bleed (maximised, or not Linux CSD at all);
 * otherwise the margin reserved on *each* side for the drop shadow. */
export const csdMarginPx = derived(csdRound, ($csdRound) =>
    $csdRound ? CSD_SHADOW_MARGIN_PX : 0,
);
