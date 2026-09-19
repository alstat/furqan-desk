/**
 * The shared chrome of every editor and pane header.
 *
 * Julia, Lean and Typst each carry an editor header (file name on the left,
 * controls on the right) and each has a pane below or beside it with a header
 * of its own — the Julia REPL, the Lean infoview, the Typst preview. In a split
 * two or three of these sit side by side, so any difference between them reads
 * as a mistake: a control a pixel taller here, a header a pixel deeper there,
 * and nothing lines up across the seam.
 *
 * They were all written separately and had drifted. These are the one
 * definition they now share, so a change to the height of a header or a control
 * happens in a single place and reaches every surface at once.
 */

/**
 * Height of every header row, editor and pane alike. Stated, never inherited
 * from whatever happens to be tallest inside — that is what let them drift.
 */
export const HEADER_ROW_HEIGHT = 'h-8';

/** Editor header: file name and controls, no rule beneath it. */
export const EDITOR_HEADER_ROW = `flex ${HEADER_ROW_HEIGHT} shrink-0 items-center justify-between gap-2 px-2`;

/** Pane header (REPL, infoview, preview): the same row, with its rule. */
export const PANE_HEADER_ROW = `flex ${HEADER_ROW_HEIGHT} shrink-0 items-center justify-between gap-2 border-b border-brand-sand-200 dark:border-[#414559] px-4`;

/**
 * The same header with no rule, for a pane sitting under an editor in a split.
 *
 * On its own a pane is a bordered box and the rule separates its header from
 * its body. In a split it is a flush panel under the editor, where that rule —
 * together with the one above the header — reads as a stack of lines between
 * two things that are already plainly separate.
 */
export const PANE_HEADER_ROW_FLAT = `flex ${HEADER_ROW_HEIGHT} shrink-0 items-center justify-between gap-2 px-4`;

/**
 * The gap left under an editor when nothing follows it in its column — that is,
 * when its REPL or preview has moved to the panel on the right.
 *
 * It matches the gap at the editor's sides, so the editor is inset from its
 * panel by the same distance all the way round.
 *
 * On paper the side gap is 12px — the editor's own `mx-2` (8px) plus the
 * `px-1` (4px) its column carries — but `mb-3` read as visibly tighter than
 * the sides, so this is 16px: tuned against the rendered result rather than the
 * arithmetic. The likely reason the two differ is that the sides are measured
 * to a drawn panel border while the bottom is measured to the window frame,
 * whose own border and rounding sit slightly differently. If the side inset
 * ever changes, re-check this by eye rather than recomputing it.
 *
 * Only used where nothing sits below the editor; in a split the pane beneath it
 * butts straight on, so there is no gap to size.
 */
export const EDITOR_BOTTOM_GUTTER = 'mb-4';

/**
 * Opening height of a pane docked under its editor — the Julia REPL, the Lean
 * infoview, the Typst preview.
 *
 * Shared because these panes are anchored to the bottom of their column, so a
 * pane's height is what decides where its header sits. Julia and Lean opened at
 * 256 and Typst at 200, which put the Typst header 56px below the other two
 * whenever a Typst pane was paired with one of them. The user can still drag
 * any of them anywhere; this is only where they start.
 */
export const PANE_DEFAULT_HEIGHT = 256;

/**
 * A control in either header. `h-5` inside an `h-8` row leaves 6px above and
 * below, which is what keeps a row of pills from reading as a packed strip.
 * The height is on the pill rather than the padding so every control is the
 * same size whether its label is text, an icon, or both.
 */
export const HEADER_PILL =
	'flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-[0.625rem] font-medium transition-colors';

/** Unselected control. */
export const HEADER_PILL_IDLE =
	'bg-brand-sand-200 dark:bg-[#414559] text-brand-charcoal-500 dark:text-[#838ba7] hover:bg-brand-sand-400 dark:hover:bg-[#51566a]';

/** Selected or primary control. */
export const HEADER_PILL_ACCENT =
	'bg-brand-gold-100 dark:bg-[#e5c890]/15 text-brand-gold-600 dark:text-brand-gold-400 hover:bg-brand-gold-200 dark:hover:bg-[#e5c890]/25';
