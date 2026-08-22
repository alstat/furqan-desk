<script lang="ts">
    import { fly } from "svelte/transition";
    import { getCommands } from "$lexical/core/commands.js";
    import { getEditor } from "$lexical/core/composerContext.js";
    import ColorPicker from "./ColorPicker.svelte";
    import { tick, onDestroy } from "svelte";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import DialogPanelHeader from "$lib/components/shared/DialogPanelHeader.svelte";

    const editor = getEditor();

    interface Props {
        color: string;
        title: string;
        showModal?: boolean;
    }

    let { color, title, showModal = $bindable(false) }: Props = $props();

    let onChangeCb:
        | ((value: string, skipHistoryStack: boolean) => void)
        | undefined;
    let pendingAnchor: HTMLElement | undefined;

    export function open(
        callback: (value: string, skipHistoryStack: boolean) => void,
        anchor?: HTMLElement,
    ) {
        onChangeCb = callback;
        pendingAnchor = anchor;
        showModal = true;
    }

    async function close() {
        showModal = false;
        onChangeCb = undefined;
        await tick();
        getCommands().FocusEditor.execute(editor);
    }

    function onColorChange(value: string, skipHistoryStack: boolean) {
        onChangeCb?.(value, skipHistoryStack);
    }

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    // ── Drag ─────────────────────────────────────────────────────────────────
    const PANEL_W = 272;

    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;
    let initialized = false;

    function positionNearAnchor(rect: DOMRect) {
        const GAP = 12;
        const PANEL_H = 290;
        const margin = 8;

        let newY = rect.bottom + GAP;
        if (newY + PANEL_H > window.innerHeight - margin) {
            newY = Math.max(margin, rect.top - PANEL_H - GAP);
        }

        let newX = rect.left;
        if (newX + PANEL_W > window.innerWidth - margin) {
            newX = window.innerWidth - PANEL_W - margin;
        }
        newX = Math.max(margin, newX);

        x = newX;
        y = newY;
    }

    $effect(() => {
        if (showModal && !initialized) {
            if (pendingAnchor) {
                positionNearAnchor(pendingAnchor.getBoundingClientRect());
            } else {
                x = Math.max(0, (window.innerWidth - PANEL_W) / 2);
                y = Math.max(0, (window.innerHeight - 220) / 2);
            }
            zIndex = bringToFront();
            initialized = true;
        }
        if (!showModal) {
            initialized = false;
            pendingAnchor = undefined;
        }
    });

    function startDrag(e: PointerEvent) {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startX = x;
        startY = y;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", stopDrag, { once: true });
    }

    function onDrag(e: PointerEvent) {
        x = Math.max(
            0,
            Math.min(
                window.innerWidth - PANEL_W,
                startX + (e.clientX - dragStartX),
            ),
        );
        y = Math.max(
            0,
            Math.min(
                window.innerHeight - 60,
                startY + (e.clientY - dragStartY),
            ),
        );
    }

    function stopDrag() {
        isDragging = false;
        window.removeEventListener("pointermove", onDrag);
    }

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("pointermove", onDrag);
        }
    });
</script>

{#if showModal}
    <!-- Floating panel -->
    <div
        use:portal
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabindex="-1"
        class="fixed flex flex-col overflow-hidden rounded-xl
               bg-white dark:bg-[#292c3c]
               border border-brand-sand-200 dark:border-[#414559]
               shadow-xl dark:shadow-black/40"
        style="left:{x}px; top:{y}px; width:{PANEL_W}px; z-index:{zIndex};"
        onpointerdown={() => {
            zIndex = bringToFront();
        }}
        onkeydown={(e) => {
            if (e.key === "Escape") close();
        }}
        transition:fly={{ y: 8, duration: 180, opacity: 0 }}
    >
        <!-- Header -->
        <DialogPanelHeader
            icon="fluent:paint-bucket-16-filled"
            {title}
            {isDragging}
            onClose={close}
            onpointerdown={startDrag}
        />

        <!-- Body -->
        <div class="px-2 py-2 bg-white dark:bg-[#292c3c]">
            <ColorPicker {color} onChange={onColorChange} />
        </div>
    </div>
{/if}
