<script lang="ts">
    import { appDarkMode } from "$lib/stores/editor.store";

    // setRatio receives the new top-pane height as a percentage (0–100) of the
    // stack; the parent clamps and persists it (left vs. right column store).
    let { setRatio }: { setRatio: (pct: number) => void } = $props();

    let dragging = $state(false);
    let hovering = $state(false);
    let cursorX = $state(0);

    function updateCursorX(e: PointerEvent, el: HTMLElement) {
        const rect = el.getBoundingClientRect();
        cursorX = e.clientX - rect.left;
    }

    function onPointerDown(e: PointerEvent) {
        const handle = e.currentTarget as HTMLElement;
        // The handle is nested inside a zero-height wrapper; the flex column that
        // owns the two stacked editors is the wrapper's parent.
        const stack = handle.parentElement?.parentElement;
        if (!stack) return;
        dragging = true;
        handle.setPointerCapture(e.pointerId);

        const rect = stack.getBoundingClientRect();

        const onMove = (ev: PointerEvent) => {
            updateCursorX(ev, handle);
            if (rect.height <= 0) return;
            const pct = ((ev.clientY - rect.top) / rect.height) * 100;
            setRatio(pct);
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
        document.body.style.cursor = "row-resize";
    }

    function onPointerMove(e: PointerEvent) {
        updateCursorX(e, e.currentTarget as HTMLElement);
    }

    function onDblClick() {
        setRatio(50);
    }

    // Highlight color — brand gold, themed for light/dark.
    let highlightColor = $derived($appDarkMode ? "229, 200, 144" : "212, 161, 64");
    let active = $derived(hovering || dragging);
    let highlightStrength = $derived(dragging ? 0.85 : 0.55);
</script>

<div
    class="relative z-1 self-stretch shrink-0 select-none"
    style="height: 0"
>
    <!-- Hit area: taller than visible, centered on the seam. -->
    <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the two Julia editors"
        tabindex="0"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerenter={() => (hovering = true)}
        onpointerleave={() => (hovering = false)}
        ondblclick={onDblClick}
        title="Drag to resize · Double-click to reset"
        class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 cursor-row-resize"
    ></div>
    <!-- Cursor-following highlight, only visible while hovering / dragging. -->
    <span
        class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-px
               transition-opacity duration-150"
        style="opacity: {active ? 1 : 0};
               background: radial-gradient(
                   circle at {cursorX}px 50%,
                   rgba({highlightColor}, {highlightStrength}) 0px,
                   rgba({highlightColor}, {highlightStrength * 0.5}) 40px,
                   rgba({highlightColor}, 0) 140px
               );"
    ></span>
</div>
