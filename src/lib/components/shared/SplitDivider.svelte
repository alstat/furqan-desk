<script lang="ts">
    import { editorSplitRatio, appDarkMode } from "$lib/stores/editor.store";
    import { surahOrientation } from "$lib/stores/quran.svelte";

    let dragging = $state(false);
    let hovering = $state(false);
    let cursorY = $state(0);

    function updateCursorY(e: PointerEvent, el: HTMLElement) {
        const rect = el.getBoundingClientRect();
        cursorY = e.clientY - rect.top;
    }

    function onPointerDown(e: PointerEvent) {
        const handle = e.currentTarget as HTMLElement;
        // The handle is nested inside a zero-width wrapper; the flex row that
        // owns the editor + sidebar is the wrapper's parent.
        const row = handle.parentElement?.parentElement;
        if (!row) return;
        dragging = true;
        handle.setPointerCapture(e.pointerId);

        const rect = row.getBoundingClientRect();
        const isRtl = $surahOrientation() === "flex-row-reverse";

        const onMove = (ev: PointerEvent) => {
            updateCursorY(ev, handle);
            if (rect.width <= 0) return;
            const offset = ev.clientX - rect.left;
            const pct = isRtl
                ? (offset / rect.width) * 100
                : ((rect.width - offset) / rect.width) * 100;
            editorSplitRatio.set(pct);
        };

        const onUp = (ev: PointerEvent) => {
            dragging = false;
            try { handle.releasePointerCapture(ev.pointerId); } catch {}
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
    }

    function onPointerMove(e: PointerEvent) {
        updateCursorY(e, e.currentTarget as HTMLElement);
    }

    function onDblClick() {
        editorSplitRatio.set(50);
    }

    // Highlight color — brand gold, themed for light/dark.
    let highlightColor = $derived($appDarkMode ? "229, 200, 144" : "212, 161, 64");
    let active = $derived(hovering || dragging);
    let highlightStrength = $derived(dragging ? 0.85 : 0.55);
</script>

<div
    class="relative z-1 self-stretch shrink-0 select-none"
    style="width: 0"
>
    <!-- Hit area: wider than visible, centered on the seam. -->
    <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize editor and panel"
        tabindex="0"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerenter={() => (hovering = true)}
        onpointerleave={() => (hovering = false)}
        ondblclick={onDblClick}
        title="Drag to resize · Double-click to reset"
        class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-3 cursor-col-resize"
    ></div>
    <!-- Cursor-following highlight, only visible while hovering / dragging. -->
    <span
        class="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px
               transition-opacity duration-150"
        style="opacity: {active ? 1 : 0};
               background: radial-gradient(
                   circle at 50% {cursorY}px,
                   rgba({highlightColor}, {highlightStrength}) 0px,
                   rgba({highlightColor}, {highlightStrength * 0.5}) 40px,
                   rgba({highlightColor}, 0) 140px
               );"
    ></span>
</div>
