<script lang="ts">
    import { fly } from "svelte/transition";
    import { onDestroy } from "svelte";
    import Icon from "@iconify/svelte";
    import {
        juliaPlots,
        juliaViewerOpen,
        type JuliaPlot,
    } from "$lib/stores/editor.store";
    import { bringToFront } from "$lib/stores/window-manager.store";

    let currentIndex = $state(0);

    let plots = $derived($juliaPlots);
    let currentPlot = $derived<JuliaPlot | undefined>(plots[currentIndex]);
    let hasPlots = $derived(plots.length > 0);

    // Panel position (viewport px)
    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let initialized = false;
    let panelW = $state(384);
    let panelH = $state(400);
    const MIN_W = 280;
    const MIN_H = 200;

    // Drag
    let isDragging = $state(false);
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;

    // Resize
    type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
    let isResizing = $state(false);
    let resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
    let resizeStartX = 0,
        resizeStartY = 0;
    let resizeStartW = 0,
        resizeStartH = 0;
    let resizeStartPanelX = 0,
        resizeStartPanelY = 0;

    // Zoom
    let imgScale = $state(1);
    let imgTranslateX = $state(0);
    let imgTranslateY = $state(0);
    let isPanning = $state(false);
    let panStartX = 0,
        panStartY = 0,
        panOriginX = 0,
        panOriginY = 0;
    const MIN_SCALE = 1,
        MAX_SCALE = 8;
    let zoomed = $state(false);

    function resetZoom() {
        imgScale = 1;
        imgTranslateX = 0;
        imgTranslateY = 0;
    }

    function onWheel(e: WheelEvent) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        imgScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, imgScale * delta));
        if (imgScale === MIN_SCALE) {
            imgTranslateX = 0;
            imgTranslateY = 0;
        }
    }

    function startPan(e: PointerEvent) {
        if (imgScale <= 1) return;
        if ((e.target as HTMLElement).closest("button")) return;
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panOriginX = imgTranslateX;
        panOriginY = imgTranslateY;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    function onPan(e: PointerEvent) {
        if (!isPanning) return;
        imgTranslateX = panOriginX + (e.clientX - panStartX);
        imgTranslateY = panOriginY + (e.clientY - panStartY);
    }
    function stopPan() {
        isPanning = false;
    }

    // Reset zoom when plot changes
    $effect(() => {
        currentPlot;
        resetZoom();
    });

    // Keep currentIndex in bounds when plots array changes
    $effect(() => {
        if (currentIndex >= plots.length && plots.length > 0) {
            currentIndex = plots.length - 1;
        }
    });

    // Auto-open panel and jump to latest when a new plot arrives
    $effect(() => {
        if (plots.length > 0) {
            currentIndex = plots.length - 1;
            $juliaViewerOpen = true;
        }
    });

    // Initial centering effect
    $effect(() => {
        if ($juliaViewerOpen && !initialized && typeof window !== "undefined") {
            x = Math.max(0, (window.innerWidth - panelW) / 2);
            y = Math.max(0, (window.innerHeight - panelH) / 2);
            zIndex = bringToFront();
            initialized = true;
        }
    });

    function prev() {
        if (currentIndex > 0) currentIndex--;
    }

    function next() {
        if (currentIndex < plots.length - 1) currentIndex++;
    }

    function clearPlots() {
        juliaPlots.set([]);
        currentIndex = 0;
    }

    function removeCurrent() {
        juliaPlots.update((ps) => ps.filter((_, i) => i !== currentIndex));
        if (currentIndex > 0) currentIndex--;
    }

    // Drag handlers
    function startDrag(e: PointerEvent) {
        if ((e.target as HTMLElement).closest("button")) return;
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
                window.innerWidth - panelW,
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

    // Resize handlers
    function startResize(e: PointerEvent, dir: ResizeDir) {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        resizeDir = dir;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartW = panelW;
        resizeStartH = panelH;
        resizeStartPanelX = x;
        resizeStartPanelY = y;
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onResize);
        window.addEventListener("pointerup", stopResize, { once: true });
    }
    function onResize(e: PointerEvent) {
        const dx = e.clientX - resizeStartX;
        const dy = e.clientY - resizeStartY;
        let newW = resizeStartW,
            newH = resizeStartH;
        let newX = resizeStartPanelX,
            newY = resizeStartPanelY;
        if (resizeDir.e) newW = Math.max(MIN_W, resizeStartW + dx);
        if (resizeDir.s) newH = Math.max(MIN_H, resizeStartH + dy);
        if (resizeDir.w) {
            newW = Math.max(MIN_W, resizeStartW - dx);
            newX = resizeStartPanelX + (resizeStartW - newW);
        }
        if (resizeDir.n) {
            newH = Math.max(MIN_H, resizeStartH - dy);
            newY = resizeStartPanelY + (resizeStartH - newH);
        }
        panelW = newW;
        panelH = newH;
        x = Math.max(0, Math.min(window.innerWidth - MIN_W, newX));
        y = Math.max(0, Math.min(window.innerHeight - 60, newY));
    }
    function stopResize() {
        isResizing = false;
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onResize);
    }

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("pointermove", onDrag);
            window.removeEventListener("pointermove", onResize);
        }
    });
</script>

<!-- Fullscreen overlay -->
{#if zoomed && currentPlot}
    <div
        role="dialog"
        aria-modal="true"
        aria-label="Plot fullscreen view"
        tabindex="-1"
        class="fixed inset-0 bg-black/92 flex items-center justify-center cursor-zoom-out"
        style="z-index: {zIndex + 1};"
        onclick={() => (zoomed = false)}
        onkeydown={(e) => e.key === "Escape" && (zoomed = false)}
    >
        {#if currentPlot.format === "svg"}
            <div
                role="presentation"
                class="max-w-[94vw] max-h-[94vh] overflow-auto"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
            >
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html atob(currentPlot.data)}
            </div>
        {:else}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <img
                src="data:image/png;base64,{currentPlot.data}"
                alt="Julia plot fullscreen"
                class="max-w-[94vw] max-h-[94vh] object-contain rounded-xl shadow-2xl"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
            />
        {/if}
        <button
            onclick={() => (zoomed = false)}
            class="absolute top-4 right-4 cursor-pointer text-gray-100 dark:text-gray-700 hover:dark:text-gray-100/70 hover:text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 transition-colors"
            aria-label="Close fullscreen"
        >
            <Icon icon="solar:close-circle-bold-duotone" width="1.8rem" />
        </button>
    </div>
{/if}

<!-- Floating panel -->
{#if $juliaViewerOpen}
    <div
        transition:fly={{ y: 8, duration: 180, opacity: 0 }}
        class="fixed flex flex-col overflow-hidden rounded-3xl
               bg-white dark:bg-[#292c3c]
               border border-brand-sand-200 dark:border-[#414559]
               shadow-xl dark:shadow-black/40"
        style="left:{x}px; top:{y}px; width:{panelW}px; height:{panelH}px; z-index:{zIndex};"
        onpointerdown={() => {
            zIndex = bringToFront();
        }}
    >
        <!-- Header -->
        <div
            class="flex items-center justify-between px-4 py-1.75 shrink-0
               border-b border-brand-gold-200 dark:border-[#414559]
               bg-brand-gold-100 dark:bg-[#292c3c]
               select-none rounded-t-3xl
               {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
            onpointerdown={startDrag}
            role="banner"
        >
            <div class="flex items-center gap-2">
                <Icon
                    icon="solar:chart-bold-duotone"
                    width="1.1rem"
                    class="text-brand-gold-500"
                />
                <span
                    class="text-[11px] py-2 font-semibold uppercase tracking-wide
			             text-brand-charcoal-500 dark:text-[#838ba7]"
                >
                    Julia Plots
                    {#if hasPlots}
                        <span
                            class="ml-1 text-brand-charcoal-400 dark:text-[#626880] normal-case"
                        >
                            ({currentIndex + 1} / {plots.length})
                        </span>
                    {/if}
                </span>
            </div>

            <div class="flex items-center gap-2">
                {#if hasPlots}
                    <button
                        onclick={removeCurrent}
                        class="cursor-pointer text-[11px] font-semibold text-brand-charcoal-300
					       dark:text-[#838ba7] hover:text-red-500 dark:hover:text-red-400
					       transition-colors"
                        title="Remove this plot"
                    >
                        <Icon
                            icon="solar:trash-bin-minimalistic-bold-duotone"
                            width="0.75rem"
                        />
                    </button>
                    <button
                        onclick={clearPlots}
                        class="cursor-pointer text-[11px] font-semibold text-brand-charcoal-300
					       dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]
					       transition-colors"
                        title="Clear all plots"
                    >
                        Clear all
                    </button>
                {/if}
                <!-- Close button -->
                <button
                    onclick={() => ($juliaViewerOpen = false)}
                    class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg
                           bg-brand-gold-200 dark:bg-[#414559]
                           text-brand-gold-600 dark:text-[#c6d0f5]
                           hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    aria-label="Close plot viewer"
                    title="Close"
                >
                    <Icon
                        icon="solar:close-circle-bold-duotone"
                        width="0.85rem"
                    />
                </button>
            </div>
        </div>

        <!-- Plot display area -->
        <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
            {#if !hasPlots}
                <div
                    class="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6
			            text-brand-charcoal-300 dark:text-[#626880]"
                >
                    <Icon
                        icon="solar:chart-bold-duotone"
                        width="2rem"
                        class="opacity-30"
                    />
                    <p class="text-[11px] italic text-center">
                        No plots yet.<br />
                        Run Julia code that produces a figure to see it here.
                    </p>
                </div>
            {:else if currentPlot}
                <!-- Image viewport -->
                <div
                    role="img"
                    aria-label="Julia plot viewer"
                    class="flex-1 min-h-0 overflow-hidden flex items-center justify-center relative
			            bg-white dark:bg-[#1e2030] p-2
			            {currentPlot && imgScale > 1 ? 'cursor-grab' : 'cursor-default'}"
                    onwheel={currentPlot ? onWheel : undefined}
                    onpointerdown={currentPlot ? startPan : undefined}
                    onpointermove={currentPlot ? onPan : undefined}
                    onpointerup={stopPan}
                >
                    {#if currentPlot.format === "svg"}
                        <div
                            class="max-w-full max-h-full select-none pointer-events-none"
                            style="transform: scale({imgScale}) translate({imgTranslateX /
                                imgScale}px, {imgTranslateY / imgScale}px);
                                   transform-origin: center; transition: {isPanning
                                ? 'none'
                                : 'transform 0.1s ease'};"
                        >
                            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                            {@html atob(currentPlot.data)}
                        </div>
                    {:else}
                        <img
                            src="data:image/png;base64,{currentPlot.data}"
                            alt="Julia plot {currentIndex + 1}"
                            class="max-w-full max-h-full object-contain select-none pointer-events-none"
                            style="transform: scale({imgScale}) translate({imgTranslateX /
                                imgScale}px, {imgTranslateY / imgScale}px);
                                   transform-origin: center; transition: {isPanning
                                ? 'none'
                                : 'transform 0.1s ease'};"
                            draggable="false"
                        />
                    {/if}

                    <!-- Zoom controls (top-right overlay) -->
                    <div class="absolute top-3 right-3 flex flex-col gap-1">
                        <button
                            onclick={() =>
                                (imgScale = Math.min(
                                    MAX_SCALE,
                                    imgScale * 1.3,
                                ))}
                            title="Zoom in"
                            class="cursor-pointer p-1.5 rounded-full bg-white/90 dark:bg-[#292c3c]/90
                                   border border-slate-200 dark:border-[#414559]
                                   text-brand-charcoal-400 dark:text-[#8caaee]
                                   hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm"
                        >
                            <Icon
                                icon="solar:add-circle-bold-duotone"
                                width="0.85rem"
                            />
                        </button>
                        <button
                            onclick={() => {
                                imgScale = Math.max(MIN_SCALE, imgScale / 1.3);
                                if (imgScale <= MIN_SCALE) resetZoom();
                            }}
                            disabled={imgScale <= MIN_SCALE}
                            title="Zoom out"
                            class="cursor-pointer p-1.5 rounded-full bg-white/90 dark:bg-[#292c3c]/90
                                   border border-slate-200 dark:border-[#414559]
                                   text-brand-charcoal-400 dark:text-[#8caaee]
                                   hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm
                                   disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Icon
                                icon="solar:minus-circle-bold-duotone"
                                width="0.85rem"
                            />
                        </button>
                        {#if imgScale > 1}
                            <button
                                onclick={resetZoom}
                                title="Reset zoom"
                                class="cursor-pointer p-1.5 rounded-full bg-white/90 dark:bg-[#292c3c]/90
                                       border border-slate-200 dark:border-[#414559]
                                       text-brand-charcoal-400 dark:text-[#8caaee]
                                       hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm"
                            >
                                <Icon
                                    icon="solar:minimize-square-bold-duotone"
                                    width="0.85rem"
                                />
                            </button>
                        {/if}
                        <button
                            onclick={() => (zoomed = true)}
                            title="Fullscreen"
                            class="cursor-pointer p-1.5 rounded-full bg-white/90 dark:bg-[#292c3c]/90
                                   border border-slate-200 dark:border-[#414559]
                                   text-brand-charcoal-400 dark:text-[#8caaee]
                                   hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm"
                        >
                            <Icon
                                icon="solar:full-screen-bold-duotone"
                                width="0.85rem"
                            />
                        </button>
                    </div>

                    <!-- Zoom level badge (bottom-right) -->
                    {#if imgScale > 1}
                        <span
                            class="absolute bottom-3 right-3 text-[9px] font-semibold px-1.5 py-0.5 rounded-full
                                     bg-black/40 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100/90 backdrop-blur-sm select-none pointer-events-none"
                        >
                            {Math.round(imgScale * 100)}%
                        </span>
                    {/if}
                </div>

                <!-- Navigation footer -->
                {#if plots.length > 1}
                    <div
                        class="shrink-0 px-3 py-1.5 border-t border-stone-200 dark:border-[#414559]
				            bg-brand-sand-50 dark:bg-[#232634] flex items-center justify-between"
                    >
                        <button
                            onclick={prev}
                            disabled={currentIndex === 0}
                            class="cursor-pointer flex items-center gap-0.5 text-[11px] font-semibold
						       text-brand-charcoal-500 dark:text-[#838ba7]
						       hover:text-brand-gold-500 dark:hover:text-[#e5c890]
						       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <Icon icon="charm:chevron-left" width="0.75rem" />
                            Prev
                        </button>

                        <!-- Dot indicators (up to 8) -->
                        <div class="flex gap-1">
                            {#each plots.slice(Math.max(0, currentIndex - 3), Math.min(plots.length, currentIndex + 5)) as _, dotOffset}
                                {@const dotIdx =
                                    Math.max(0, currentIndex - 3) + dotOffset}
                                <button
                                    onclick={() => (currentIndex = dotIdx)}
                                    aria-label="Go to plot {dotIdx + 1}"
                                    class="cursor-pointer w-1.5 h-1.5 rounded-full transition-colors
								       {dotIdx === currentIndex
                                        ? 'bg-brand-gold-500 dark:bg-[#e5c890]'
                                        : 'bg-brand-sand-400 dark:bg-[#414559] hover:bg-brand-gold-400 dark:hover:bg-[#626880]'}"
                                ></button>
                            {/each}
                        </div>

                        <button
                            onclick={next}
                            disabled={currentIndex === plots.length - 1}
                            class="cursor-pointer flex items-center gap-0.5 text-[11px] font-semibold
						       text-brand-charcoal-500 dark:text-[#838ba7]
						       hover:text-brand-gold-500 dark:hover:text-[#e5c890]
						       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                            <Icon icon="charm:chevron-right" width="0.75rem" />
                        </button>
                    </div>
                {/if}
            {/if}
        </div>

        <!-- Resize handles -->
        <div
            aria-hidden="true"
            class="resize-handle resize-n"
            onpointerdown={(e) =>
                startResize(e, { n: true, s: false, e: false, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-s"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: true, e: false, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-e"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: false, e: true, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-w"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: false, e: false, w: true })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-ne"
            onpointerdown={(e) =>
                startResize(e, { n: true, s: false, e: true, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-se"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: true, e: true, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-sw"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: true, e: false, w: true })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-nw"
            onpointerdown={(e) =>
                startResize(e, { n: true, s: false, e: false, w: true })}
        ></div>
    </div>
{/if}

<style>
    .resize-handle {
        position: absolute;
        z-index: 10;
    }
    .resize-n {
        top: 0;
        left: 6px;
        right: 6px;
        height: 6px;
        cursor: n-resize;
    }
    .resize-s {
        bottom: 0;
        left: 6px;
        right: 6px;
        height: 6px;
        cursor: s-resize;
    }
    .resize-e {
        top: 6px;
        right: 0;
        bottom: 6px;
        width: 6px;
        cursor: e-resize;
    }
    .resize-w {
        top: 6px;
        left: 0;
        bottom: 6px;
        width: 6px;
        cursor: w-resize;
    }
    .resize-ne {
        top: 0;
        right: 0;
        width: 12px;
        height: 12px;
        cursor: ne-resize;
    }
    .resize-se {
        bottom: 0;
        right: 0;
        width: 12px;
        height: 12px;
        cursor: se-resize;
    }
    .resize-sw {
        bottom: 0;
        left: 0;
        width: 12px;
        height: 12px;
        cursor: sw-resize;
    }
    .resize-nw {
        top: 0;
        left: 0;
        width: 12px;
        height: 12px;
        cursor: nw-resize;
    }
    .resize-se::after {
        content: "";
        position: absolute;
        bottom: 4px;
        right: 4px;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: rgba(130, 130, 130, 0.35);
    }
</style>
