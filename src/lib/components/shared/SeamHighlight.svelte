<!--
  The glow that follows the cursor along a seam.

  Every draggable seam in the app wears the same one: a hairline of brand gold
  that is brightest where the pointer is and fades out along the seam, showing
  up on hover and strengthening while the seam is actually being dragged. It
  says which line will move, and says it on the line itself.

  A hairline rather than a bar because the seam it marks is a hairline: on the
  REPL prompt it lies exactly over the box's top border, so the line that lights
  up is the line that moves. That is worth keeping — a highlight a few pixels
  off the border reads as a different edge entirely, which is what an earlier
  version of the prompt seam did.

  Presentational only: the parent owns the pointer handlers, since the drag
  itself differs everywhere (a percentage of a column, a pixel height, a ratio),
  and passes in whether the seam is live and where along it the cursor sits.
-->
<script lang="ts">
    import { appDarkMode } from "$lib/stores/editor.store";

    let {
        active = false,
        dragging = false,
        cursor = 0,
        orientation = "horizontal",
    }: {
        /** Hover or drag or keyboard focus — anything that makes the seam live. */
        active?: boolean;
        /** Brighter while the seam is being dragged. */
        dragging?: boolean;
        /** Where the pointer is along the seam, in px from its own start. */
        cursor?: number;
        /** The seam's own direction: a row divider is horizontal. */
        orientation?: "horizontal" | "vertical";
    } = $props();

    const color = $derived($appDarkMode ? "229, 200, 144" : "212, 161, 64");
    const strength = $derived(dragging ? 0.85 : 0.55);
    const center = $derived(
        orientation === "horizontal" ? `${cursor}px 50%` : `50% ${cursor}px`,
    );
</script>

<span
    class="pointer-events-none absolute transition-opacity duration-150 {orientation ===
    'horizontal'
        ? 'inset-x-0 top-1/2 h-px -translate-y-1/2'
        : 'inset-y-0 left-1/2 w-px -translate-x-1/2'}"
    style="opacity: {active ? 1 : 0};
           background: radial-gradient(
               circle at {center},
               rgba({color}, {strength}) 0px,
               rgba({color}, {strength * 0.5}) 40px,
               rgba({color}, 0) 140px
           );"
></span>
