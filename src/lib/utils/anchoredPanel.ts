/**
 * Placement for a panel that drops out of a toolbar button.
 *
 * The Quran buttons sit at the right end of the window header, so their panels
 * hang below and right-align with the button rather than floating in the middle
 * of the screen — the shape a menu is expected to take.
 */

/**
 * Gap between a trigger (or the bar it sits in) and the panel it opens. Shared
 * so every anchored panel in the app sits the same distance from its button.
 */
export const PANEL_GAP = 8;
/** Smallest distance the panel keeps from the window edges. */
const MARGIN = 8;

export interface PanelPosition {
    x: number;
    y: number;
    /** Room left below the panel's top edge, for `max-height`. */
    maxHeight: number;
}

/**
 * Place `width` pixels of panel under `anchor`, right-aligned with it and kept
 * fully on screen. Without an anchor — a keyboard shortcut, say — it falls back
 * to the top-right corner, where the buttons are.
 *
 * `barBottom` is where the bar holding the trigger ends. The buttons sit inside
 * the window header, so hanging the panel off the button alone would tuck it
 * against — or under — the header's bottom border. Clearing the bar instead
 * leaves a visible gap between the two.
 *
 * `gap` is that clearance. Pass 0 for a panel meant to hang *from* the bar
 * rather than float below it, so its top edge meets the bar's bottom border.
 */
export function anchorBelow(
    anchor: DOMRect | null | undefined,
    width: number,
    barBottom = 0,
    gap = PANEL_GAP,
): PanelPosition {
    if (typeof window === "undefined") return { x: 0, y: 0, maxHeight: 0 };

    const rightEdge = Math.max(MARGIN, window.innerWidth - width - MARGIN);
    const x = anchor
        ? Math.min(Math.max(MARGIN, anchor.right - width), rightEdge)
        : rightEdge;
    const y = Math.max(anchor?.bottom ?? 0, barBottom) + gap;

    return {
        x,
        y,
        // Never taller than the room below it, so a long list scrolls inside
        // the panel instead of running off the bottom of the screen.
        maxHeight: Math.max(160, window.innerHeight - y - MARGIN),
    };
}
