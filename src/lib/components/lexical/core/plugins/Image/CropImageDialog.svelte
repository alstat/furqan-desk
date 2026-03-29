<script lang="ts">
    import { onDestroy } from "svelte";
    import { $getNodeByKey as getNodeByKey } from "lexical";
    import type { LexicalEditor } from "lexical";
    import Icon from "@iconify/svelte";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import DialogPanelHeader from "$lib/components/shared/DialogPanelHeader.svelte";
    import { $isImageNode as isImageNode } from "./ImageNode.js";

    interface Props {
        src: string;
        editor: LexicalEditor;
        nodeKey: string;
        onClose: () => void;
    }

    let { src, editor, nodeKey, onClose }: Props = $props();

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    const PANEL_W = 480;

    let x = $state(Math.max(0, (window.innerWidth - PANEL_W) / 2));
    let y = $state(Math.max(8, (window.innerHeight - 520) * 0.25));
    let zIndex = $state(bringToFront());
    let isDragging = $state(false);
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;

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

    // ── crop state ────────────────────────────────────────────────────────────
    let imgEl = $state<HTMLImageElement | null>(null);
    let imgLoaded = $state(false);
    let imgDisplayW = $state(0);
    let imgDisplayH = $state(0);
    let cropX = $state(0);
    let cropY = $state(0);
    let cropW = $state(0);
    let cropH = $state(0);
    let cropError = $state("");

    let isExternalUrl = $derived(
        !src.startsWith("data:") && !src.startsWith("blob:"),
    );
    let naturalCropW = $derived(
        imgDisplayW > 0
            ? Math.round((cropW * (imgEl?.naturalWidth ?? 0)) / imgDisplayW)
            : 0,
    );
    let naturalCropH = $derived(
        imgDisplayH > 0
            ? Math.round((cropH * (imgEl?.naturalHeight ?? 0)) / imgDisplayH)
            : 0,
    );

    function onImgLoad() {
        if (!imgEl) return;
        const rect = imgEl.getBoundingClientRect();
        imgDisplayW = rect.width;
        imgDisplayH = rect.height;
        cropX = 0;
        cropY = 0;
        cropW = imgDisplayW;
        cropH = imgDisplayH;
        imgLoaded = true;
    }

    // ── crop drag interactions ────────────────────────────────────────────────
    type Handle = "nw" | "ne" | "sw" | "se" | "move";

    let activeHandle: Handle | null = null;
    let handleStartX = 0,
        handleStartY = 0;
    let handleStartCrop = { x: 0, y: 0, w: 0, h: 0 };
    const MIN_SIZE = 20;

    function startCropDrag(e: PointerEvent, handle: Handle) {
        e.stopPropagation();
        e.preventDefault();
        activeHandle = handle;
        handleStartX = e.clientX;
        handleStartY = e.clientY;
        handleStartCrop = { x: cropX, y: cropY, w: cropW, h: cropH };
        window.addEventListener("pointermove", onCropDrag);
        window.addEventListener("pointerup", stopCropDrag, { once: true });
    }

    function onCropDrag(e: PointerEvent) {
        if (!activeHandle) return;
        const dx = e.clientX - handleStartX;
        const dy = e.clientY - handleStartY;
        const { x: sx, y: sy, w: sw, h: sh } = handleStartCrop;

        if (activeHandle === "move") {
            cropX = Math.max(0, Math.min(imgDisplayW - cropW, sx + dx));
            cropY = Math.max(0, Math.min(imgDisplayH - cropH, sy + dy));
        } else if (activeHandle === "nw") {
            const newX = Math.max(0, Math.min(sx + sw - MIN_SIZE, sx + dx));
            const newY = Math.max(0, Math.min(sy + sh - MIN_SIZE, sy + dy));
            cropW = sx + sw - newX;
            cropH = sy + sh - newY;
            cropX = newX;
            cropY = newY;
        } else if (activeHandle === "ne") {
            const newY = Math.max(0, Math.min(sy + sh - MIN_SIZE, sy + dy));
            cropW = Math.max(MIN_SIZE, Math.min(imgDisplayW - sx, sw + dx));
            cropH = sy + sh - newY;
            cropY = newY;
        } else if (activeHandle === "sw") {
            const newX = Math.max(0, Math.min(sx + sw - MIN_SIZE, sx + dx));
            cropW = sx + sw - newX;
            cropH = Math.max(MIN_SIZE, Math.min(imgDisplayH - sy, sh + dy));
            cropX = newX;
        } else if (activeHandle === "se") {
            cropW = Math.max(MIN_SIZE, Math.min(imgDisplayW - sx, sw + dx));
            cropH = Math.max(MIN_SIZE, Math.min(imgDisplayH - sy, sh + dy));
        }
    }

    function stopCropDrag() {
        activeHandle = null;
        window.removeEventListener("pointermove", onCropDrag);
    }

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("pointermove", onDrag);
            window.removeEventListener("pointermove", onCropDrag);
        }
    });

    // ── apply crop ────────────────────────────────────────────────────────────
    function applyCrop() {
        if (!imgEl) return;
        cropError = "";
        const rect = imgEl.getBoundingClientRect();
        const scaleX = imgEl.naturalWidth / rect.width;
        const scaleY = imgEl.naturalHeight / rect.height;
        const canvas = document.createElement("canvas");
        const nCropW = Math.round(cropW * scaleX);
        const nCropH = Math.round(cropH * scaleY);
        canvas.width = nCropW;
        canvas.height = nCropH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        try {
            ctx.drawImage(
                imgEl,
                cropX * scaleX,
                cropY * scaleY,
                nCropW,
                nCropH,
                0,
                0,
                nCropW,
                nCropH,
            );
            const dataUrl = canvas.toDataURL("image/png");
            editor.update(() => {
                const node = getNodeByKey(nodeKey);
                if (isImageNode(node)) {
                    node.setSrc(dataUrl);
                    node.setWidthAndHeight("inherit", "inherit");
                }
            });
            onClose();
        } catch {
            cropError = "Cannot crop this image: cross-origin restriction.";
        }
    }
</script>

<div
    use:portal
    role="dialog"
    aria-modal="true"
    aria-label="Crop Image"
    tabindex="-1"
    class="fixed flex flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
    style="left:{x}px; top:{y}px; width:{PANEL_W}px; z-index:{zIndex};"
    onpointerdown={() => {
        zIndex = bringToFront();
    }}
    onkeydown={(e) => {
        if (e.key === "Escape") onClose();
    }}
>
    <DialogPanelHeader
        icon="solar:crop-bold-duotone"
        title="Crop Image"
        {isDragging}
        {onClose}
        onpointerdown={startDrag}
    />

    <!-- Body -->
    <div
        class="px-5 py-4 bg-brand-sand-50 dark:bg-[#232634] flex flex-col gap-3"
    >
        {#if isExternalUrl}
            <div
                class="flex items-start gap-1.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2"
            >
                <Icon
                    icon="solar:danger-circle-bold"
                    width="0.85rem"
                    class="text-amber-500 shrink-0 mt-0.5"
                />
                <p class="text-[11px] text-amber-700 dark:text-amber-400">
                    External URL images may not be croppable due to browser
                    security restrictions.
                </p>
            </div>
        {/if}

        <!-- Image + crop overlay -->
        <div
            class="flex items-center justify-center rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] overflow-hidden p-2"
        >
            <!-- Wrapper sizes itself to the img so absolute children align perfectly -->
            <div class="relative" style="display:inline-block; line-height:0;">
                <img
                    bind:this={imgEl}
                    {src}
                    alt="crop preview"
                    class="block max-w-full select-none"
                    style="max-height:320px; max-width:{PANEL_W - 60}px;"
                    onload={onImgLoad}
                    draggable="false"
                />
                {#if imgLoaded}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="absolute border-2 border-white"
                        style="left:{cropX}px; top:{cropY}px; width:{cropW}px; height:{cropH}px; box-shadow:0 0 0 9999px rgba(0,0,0,0.45); cursor:move;"
                        onpointerdown={(e) => startCropDrag(e, "move")}
                    >
                        <!-- NW handle -->
                        <div
                            class="absolute -top-1.5 -left-1.5 h-3 w-3 rounded-sm bg-white border border-brand-sand-200 shadow"
                            style="cursor:nw-resize;"
                            onpointerdown={(e) => startCropDrag(e, "nw")}
                        ></div>
                        <!-- NE handle -->
                        <div
                            class="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-sm bg-white border border-brand-sand-200 shadow"
                            style="cursor:ne-resize;"
                            onpointerdown={(e) => startCropDrag(e, "ne")}
                        ></div>
                        <!-- SW handle -->
                        <div
                            class="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-sm bg-white border border-brand-sand-200 shadow"
                            style="cursor:sw-resize;"
                            onpointerdown={(e) => startCropDrag(e, "sw")}
                        ></div>
                        <!-- SE handle -->
                        <div
                            class="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-sm bg-white border border-brand-sand-200 shadow"
                            style="cursor:se-resize;"
                            onpointerdown={(e) => startCropDrag(e, "se")}
                        ></div>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Dimensions readout -->
        {#if imgLoaded}
            <p
                class="text-center text-[11px] text-brand-charcoal-300 dark:text-[#626880]"
            >
                {naturalCropW} × {naturalCropH} px
            </p>
        {/if}

        {#if cropError}
            <p class="flex items-center gap-1 text-[11px] text-red-500">
                <Icon
                    icon="solar:danger-circle-bold"
                    width="0.75rem"
                />{cropError}
            </p>
        {/if}

        <!-- Actions -->
        <div class="flex items-center gap-2 mt-1">
            <button
                onclick={onClose}
                class="cursor-pointer flex-1 flex items-center justify-center gap-1.5 rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#292c3c] py-1.5 text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#838ba7] hover:bg-brand-sand-100 dark:hover:bg-[#414559] transition-colors"
            >
                Cancel
            </button>
            <button
                onclick={applyCrop}
                disabled={!imgLoaded}
                class="cursor-pointer flex-1 flex items-center justify-center gap-1.5 rounded-full bg-brand-gold-400 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
            >
                <Icon icon="solar:crop-bold" width="0.8rem" />
                Apply Crop
            </button>
        </div>
    </div>
</div>
