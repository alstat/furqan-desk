// Zoom helpers for the Typst preview panes (side-by-side and embedded).
//
// Zoom is implemented by widening the page column (the SVGs track its width),
// so glyphs stay vector-crisp and the selectable text layer keeps working.
// A level of 1 means "page fits the pane width".

import { tick } from "svelte";
import { get, type Writable } from "svelte/store";

export const PREVIEW_MIN_ZOOM = 0.5;
export const PREVIEW_MAX_ZOOM = 4;
/** Multiplier applied per zoom-button click. */
export const PREVIEW_ZOOM_STEP = 1.25;

export function clampPreviewZoom(z: number): number {
    return Math.min(PREVIEW_MAX_ZOOM, Math.max(PREVIEW_MIN_ZOOM, z));
}

/**
 * Set the zoom level, keeping the content point under (originX, originY) —
 * pane-relative coordinates, defaulting to the pane centre — stationary by
 * compensating the scroll offsets after the re-layout.
 */
export async function zoomPreviewTo(
    zoom: Writable<number>,
    scrollEl: HTMLElement | null,
    next: number,
    originX?: number,
    originY?: number,
): Promise<void> {
    const prev = get(zoom);
    const z = clampPreviewZoom(next);
    if (z === prev) return;
    if (!scrollEl) {
        zoom.set(z);
        return;
    }
    const rect = scrollEl.getBoundingClientRect();
    const ax = originX ?? rect.width / 2;
    const ay = originY ?? rect.height / 2;
    const { scrollLeft, scrollTop } = scrollEl;
    zoom.set(z);
    await tick();
    const f = z / prev;
    scrollEl.scrollLeft = (scrollLeft + ax) * f - ax;
    scrollEl.scrollTop = (scrollTop + ay) * f - ay;
}

/**
 * Wire trackpad pinch-to-zoom on a preview scroll pane. Handles both ways
 * engines report a pinch: ctrl+wheel events (Chromium / WebView2, and
 * ctrl/⌘+scroll with a mouse) and WebKit's proprietary GestureEvents
 * (macOS WKWebView). Returns a cleanup function for use in `$effect`.
 */
export function attachPinchZoom(
    scrollEl: HTMLElement,
    zoom: Writable<number>,
): () => void {
    const zoomAt = (next: number, clientX: number, clientY: number) => {
        const rect = scrollEl.getBoundingClientRect();
        void zoomPreviewTo(
            zoom,
            scrollEl,
            next,
            clientX - rect.left,
            clientY - rect.top,
        );
    };

    const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01));
        zoomAt(get(zoom) * factor, e.clientX, e.clientY);
    };

    // WebKit GestureEvent: `scale` is relative to the gesture's start.
    type GestureEvent = Event & {
        scale: number;
        clientX: number;
        clientY: number;
    };
    let gestureStartZoom = 1;
    const onGestureStart = (e: Event) => {
        e.preventDefault();
        gestureStartZoom = get(zoom);
    };
    const onGestureChange = (e: Event) => {
        e.preventDefault();
        const g = e as GestureEvent;
        zoomAt(gestureStartZoom * g.scale, g.clientX, g.clientY);
    };

    // Explicit non-passive listeners: preventDefault must work, and Svelte
    // registers wheel handlers passively.
    scrollEl.addEventListener("wheel", onWheel, { passive: false });
    scrollEl.addEventListener("gesturestart", onGestureStart);
    scrollEl.addEventListener("gesturechange", onGestureChange);
    return () => {
        scrollEl.removeEventListener("wheel", onWheel);
        scrollEl.removeEventListener("gesturestart", onGestureStart);
        scrollEl.removeEventListener("gesturechange", onGestureChange);
    };
}
