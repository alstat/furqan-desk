/**
 * Shared layout math for lesson-card annotations (comments and prompts).
 *
 * Anchor cards live in normal scrolling document flow, not on a pan/zoom
 * canvas, so their position is tracked via `offsetLeft`/`offsetTop` relative
 * to a single `position: relative` ancestor rather than
 * `getBoundingClientRect()` — that stays correct while the pane scrolls and
 * remains valid for cards currently off-screen (needed at export time).
 */

import type { AnnotationAnchorKind } from "$lib/stores/arabic-study.store";

/** Matches `FloatingAnnotationCard`'s fixed `w-64` width. */
export const ANNOTATION_CARD_WIDTH = 256;
/** Gap kept between a card and the note/prompt floating beside it. */
export const ANNOTATION_GAP = 24;

export interface AnchorRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * A comment or prompt on screen: the stored row's fields plus the bits only
 * the client needs — a stable local key for `{#each ... (id)}` before the
 * first save gives it a `storedId`, and in-flight generation state.
 */
export interface AnnotationDraft {
    id: number;
    storedId?: number;
    anchorKind: AnnotationAnchorKind;
    anchorSectionId: number | null;
    kind: "comment" | "prompt";
    title: string;
    brief: string;
    content: string;
    offsetX: number;
    offsetY: number;
    loading: boolean;
    error: string;
    controller: AbortController | null;
}

function measure(el: HTMLElement): AnchorRect {
    return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
}

/**
 * The same "flexible link" curve as the Workbook canvas: two anchor points
 * become one cubic bezier with horizontal tangents, bent just enough that
 * short or overlapping links do not kink.
 */
/**
 * `dir` is which way the curve leaves its first point: `1` for a point on a
 * box's right edge (bulge rightward, out and away from the box), `-1` for
 * one on a left edge. Without it, a link whose anchor is on the *left* would
 * still bulge rightward first — back into the box it's leaving — before
 * curving out to its target, instead of leaving cleanly from the outside.
 */
export function linkPath(x1: number, y1: number, x2: number, y2: number, dir: 1 | -1 = 1): string {
    const bend = Math.max(24, Math.abs(x2 - x1) / 2) * dir;
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

/**
 * Where a link should meet its anchor card and its floating card: whichever
 * side of the anchor the floating card is actually sitting on, since a card
 * moved to the left should hook onto the anchor's left edge, not its right —
 * and `dir` (for `linkPath`) with it, so the curve bulges outward on that
 * same side instead of dipping back into the anchor first.
 */
export function linkEndpoints(
    anchor: AnchorRect,
    card: { left: number; top: number; width: number },
): { x1: number; y1: number; x2: number; y2: number; dir: 1 | -1 } {
    const onLeft = card.left + card.width / 2 < anchor.left + anchor.width / 2;
    return {
        x1: onLeft ? anchor.left : anchor.left + anchor.width,
        y1: anchor.top + anchor.height / 2,
        x2: onLeft ? card.left + card.width : card.left,
        y2: card.top + 16,
        dir: onLeft ? -1 : 1,
    };
}

/** One per `GrammarCurriculum` instance — tracks every annotatable card. */
export function createAnchorRegistry() {
    const elements = new Map<string, HTMLElement>();

    /** Svelte action: `use:anchors.ref={key}` on a card's root element. */
    function ref(node: HTMLElement, key: string) {
        let currentKey = key;
        elements.set(currentKey, node);
        return {
            update(nextKey: string) {
                if (elements.get(currentKey) === node) elements.delete(currentKey);
                currentKey = nextKey;
                elements.set(currentKey, node);
            },
            destroy() {
                if (elements.get(currentKey) === node) elements.delete(currentKey);
            },
        };
    }

    function measureAll(): Record<string, AnchorRect> {
        const out: Record<string, AnchorRect> = {};
        for (const [key, el] of elements) out[key] = measure(el);
        return out;
    }

    return { ref, measureAll };
}
