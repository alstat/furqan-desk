<script lang="ts">
    import { onDestroy, untrack, tick } from "svelte";
    import Icon from "@iconify/svelte";
    import { fly } from "svelte/transition";
    import { readFile } from "@tauri-apps/plugin-fs";
    import { isPdfFile } from "$lib/stores/tabs.store";
    import * as pdfjsLib from "pdfjs-dist";
    import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

    // Render PDFs to <canvas> via pdf.js — this works identically on every
    // platform (incl. Linux/WebKitGTK, which lacks a built-in PDF viewer).
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

    interface Props {
        open: boolean;
        path: string | null;
        onClose: () => void;
    }

    let { open, path, onClose }: Props = $props();

    let url = $state<string | null>(null);
    let error = $state("");
    let loading = $state(false);
    let pdfBytes = $state<Uint8Array | null>(null);
    let pdfHost = $state<HTMLDivElement | null>(null);

    let fileName = $derived(path?.split("/").pop() ?? "");
    let isPdf = $derived(path ? isPdfFile(path) : false);

    // Bumped on every load so a stale async read/render can detect it was
    // superseded (file changed, or dialog closed) and bail out.
    let loadToken = 0;
    let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;

    // ── Panel geometry (fixed-position floating window) ───────────────────────
    let panelW = $state(860);
    let panelH = $state(620);
    let x = $state(0);
    let y = $state(0);
    let initialized = false;
    const MIN_W = 360;
    const MIN_H = 280;

    // Centre the panel the first time it opens.
    $effect(() => {
        if (open && !initialized) {
            panelW = Math.min(860, window.innerWidth - 32);
            panelH = Math.min(620, window.innerHeight - 80);
            x = Math.max(16, (window.innerWidth - panelW) / 2);
            y = Math.max(16, (window.innerHeight - panelH) / 2);
            initialized = true;
        }
        if (!open) initialized = false;
    });

    // ── Drag ──────────────────────────────────────────────────────────────────
    let dragging = $state(false);
    let dragStartX = 0;
    let dragStartY = 0;
    let startX = 0;
    let startY = 0;

    function startDrag(e: PointerEvent) {
        if ((e.target as HTMLElement).closest("button")) return;
        dragging = true;
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
            Math.min(window.innerHeight - 60, startY + (e.clientY - dragStartY)),
        );
    }
    function stopDrag() {
        dragging = false;
        window.removeEventListener("pointermove", onDrag);
    }

    // ── Resize ────────────────────────────────────────────────────────────────
    type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
    let resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
    let resizeStartX = 0;
    let resizeStartY = 0;
    let resizeStartW = 0;
    let resizeStartH = 0;
    let resizeStartPanelX = 0;
    let resizeStartPanelY = 0;

    function startResize(e: PointerEvent, dir: ResizeDir) {
        e.preventDefault();
        e.stopPropagation();
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
        let newW = resizeStartW;
        let newH = resizeStartH;
        let newX = resizeStartPanelX;
        let newY = resizeStartPanelY;
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
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onResize);
    }

    // ── Zoom & pan ────────────────────────────────────────────────────────────
    // Uses the CSS `zoom` property (not `transform`) so the scaled content
    // still drives the scroll container — multi-page PDFs keep scrolling, and
    // zooming past full size simply makes the body scrollable so the user can
    // pan to any region.
    let bodyEl = $state<HTMLDivElement | null>(null);
    let zoom = $state(1);
    const MIN_ZOOM = 0.2;
    const MAX_ZOOM = 12;

    function clampZoom(z: number): number {
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    }

    // Change zoom, keeping the point under (clientX, clientY) — or the body
    // centre when no anchor is given — fixed in place.
    async function setZoom(next: number, clientX?: number, clientY?: number) {
        next = clampZoom(next);
        const body = bodyEl;
        if (!body || next === zoom) {
            zoom = next;
            return;
        }
        const rect = body.getBoundingClientRect();
        const cx = clientX != null ? clientX - rect.left : rect.width / 2;
        const cy = clientY != null ? clientY - rect.top : rect.height / 2;
        const prev = zoom;
        const pointX = (body.scrollLeft + cx) / prev;
        const pointY = (body.scrollTop + cy) / prev;
        zoom = next;
        await tick(); // wait for the new layout/scroll extent
        body.scrollLeft = pointX * next - cx;
        body.scrollTop = pointY * next - cy;
    }

    function zoomIn() {
        setZoom(zoom * 1.25);
    }
    function zoomOut() {
        setZoom(zoom / 1.25);
    }
    function resetZoom() {
        zoom = 1;
        if (bodyEl) {
            bodyEl.scrollLeft = 0;
            bodyEl.scrollTop = 0;
        }
    }
    // Wheel handling differs by file type:
    //  • Image — plain wheel and trackpad pinch both zoom toward the pointer.
    //  • PDF   — only pinch (delivered as a ctrl/⌘-wheel) zooms; a plain wheel
    //            is left alone so it scrolls through the pages.
    function onWheel(e: WheelEvent) {
        const isPinch = e.ctrlKey || e.metaKey;
        if (isPdf && !isPinch) return;
        e.preventDefault();
        setZoom(zoom * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
    }

    // Drag-to-pan the zoomed content.
    let panning = $state(false);
    let panStartX = 0;
    let panStartY = 0;
    let panScrollLeft = 0;
    let panScrollTop = 0;

    function startPan(e: PointerEvent) {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest("button")) return;
        const body = bodyEl;
        if (!body) return;
        // Nothing to pan unless the content overflows the viewport.
        if (
            body.scrollWidth <= body.clientWidth &&
            body.scrollHeight <= body.clientHeight
        )
            return;
        panning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panScrollLeft = body.scrollLeft;
        panScrollTop = body.scrollTop;
        body.setPointerCapture(e.pointerId);
    }
    function onPanMove(e: PointerEvent) {
        if (!panning || !bodyEl) return;
        bodyEl.scrollLeft = panScrollLeft - (e.clientX - panStartX);
        bodyEl.scrollTop = panScrollTop - (e.clientY - panStartY);
    }
    function stopPan(e: PointerEvent) {
        panning = false;
        bodyEl?.releasePointerCapture?.(e.pointerId);
    }

    function mimeFor(p: string): string {
        const ext = p.split(".").pop()?.toLowerCase() ?? "";
        switch (ext) {
            case "png":
                return "image/png";
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "gif":
                return "image/gif";
            case "webp":
                return "image/webp";
            case "bmp":
                return "image/bmp";
            case "avif":
                return "image/avif";
            case "ico":
                return "image/x-icon";
            case "tif":
            case "tiff":
                return "image/tiff";
            default:
                return "application/octet-stream";
        }
    }

    function revokeUrl() {
        if (url) {
            URL.revokeObjectURL(url);
            url = null;
        }
    }

    function destroyPdf() {
        pdfBytes = null;
        if (pdfHost) pdfHost.innerHTML = "";
        if (pdfDoc) {
            pdfDoc.destroy().catch(() => {});
            pdfDoc = null;
        }
    }

    // Load the file whenever the dialog opens for a new path. `untrack` keeps
    // this effect's dependencies limited to `open`/`path` — without it the
    // revoke/destroy helpers (which touch other state) would re-trigger it.
    $effect(() => {
        const p = path;
        const isOpen = open;
        untrack(() => loadFile(isOpen, p));
    });

    function loadFile(isOpen: boolean, p: string | null) {
        const token = ++loadToken;
        revokeUrl();
        destroyPdf();
        error = "";
        zoom = 1;
        if (!isOpen || !p) {
            loading = false;
            return;
        }
        loading = true;
        readFile(p)
            .then((bytes) => {
                if (token !== loadToken) return; // superseded
                if (isPdfFile(p)) {
                    pdfBytes = bytes;
                } else {
                    url = URL.createObjectURL(
                        new Blob([bytes], { type: mimeFor(p) }),
                    );
                }
            })
            .catch((e) => {
                if (token === loadToken) error = String(e);
            })
            .finally(() => {
                if (token === loadToken) loading = false;
            });
    }

    // Render the PDF once both its bytes and the host element are ready.
    $effect(() => {
        const host = pdfHost;
        const bytes = pdfBytes;
        if (host && bytes) {
            const token = loadToken;
            untrack(() => renderPdf(host, bytes, token));
        }
    });

    async function renderPdf(
        host: HTMLDivElement,
        bytes: Uint8Array,
        token: number,
    ) {
        try {
            const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
            if (token !== loadToken) {
                doc.destroy().catch(() => {});
                return;
            }
            pdfDoc = doc;
            host.innerHTML = "";
            const dpr = window.devicePixelRatio || 1;
            for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                if (token !== loadToken) return;
                const viewport = page.getViewport({ scale: 1.4 });
                const canvas = document.createElement("canvas");
                canvas.width = Math.floor(viewport.width * dpr);
                canvas.height = Math.floor(viewport.height * dpr);
                // Width in CSS px with `height:auto` + `max-w-full` so the
                // page scales down proportionally (text included) when the
                // panel narrows — never squished on a single axis.
                canvas.style.width = `${viewport.width}px`;
                canvas.style.height = "auto";
                canvas.className =
                    "mx-auto mb-3 rounded-lg shadow-md max-w-full";
                host.appendChild(canvas);
                const ctx = canvas.getContext("2d");
                if (!ctx) continue;
                await page.render({
                    canvas,
                    canvasContext: ctx,
                    viewport,
                    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
                }).promise;
            }
        } catch (e) {
            if (token === loadToken) error = String(e);
        }
    }

    onDestroy(() => {
        revokeUrl();
        destroyPdf();
        window.removeEventListener("pointermove", onDrag);
        window.removeEventListener("pointermove", onResize);
    });
</script>

<svelte:window
    onkeydown={(e) => {
        if (open && e.key === "Escape") onClose();
    }}
/>

{#if open}
    <div
        transition:fly={{ y: 8, duration: 180, opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={fileName}
        class="fixed z-9999 flex flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        style="left:{x}px; top:{y}px; width:{panelW}px; height:{panelH}px;"
    >
        <!-- Header (drag handle) — compact, JuliaPlotViewer-style -->
        <div
            role="banner"
            onpointerdown={startDrag}
            class="flex items-center justify-between gap-2 px-4 py-1.75 shrink-0
                   border-b border-brand-gold-200 dark:border-[#414559]
                   bg-brand-gold-100 dark:bg-[#292c3c]
                   select-none touch-none rounded-t-3xl
                   {dragging ? 'cursor-grabbing' : 'cursor-grab'}"
        >
            <div class="flex items-center gap-2 min-w-0">
                <Icon
                    icon={isPdf
                        ? "solar:file-text-bold-duotone"
                        : "solar:gallery-bold-duotone"}
                    width="1.1rem"
                    class="text-brand-gold-500 shrink-0"
                />
                <span
                    class="text-[11px] py-2 font-semibold tracking-wide
                           text-brand-charcoal-500 dark:text-[#838ba7] truncate"
                    title={path}
                >
                    {fileName}
                </span>
            </div>
            <button
                onclick={onClose}
                aria-label="Close"
                class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg
                       bg-brand-gold-200 dark:bg-[#414559]
                       text-brand-gold-600 dark:text-[#c6d0f5]
                       hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d]
                       transition-colors shrink-0"
            >
                <Icon icon="solar:close-circle-bold-duotone" width="0.85rem" />
            </button>
        </div>

        <!-- Body — no justify-center: it would clip the top of an overflowing
             multi-page PDF. The image self-centres via m-auto instead. -->
        <div
            bind:this={bodyEl}
            onwheel={onWheel}
            onpointerdown={startPan}
            onpointermove={onPanMove}
            onpointerup={stopPan}
            class="flex-1 min-h-0 overflow-auto bg-brand-sand-50 dark:bg-[#232634] flex flex-col items-center p-4
                   {panning ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : ''}"
        >
            {#if error}
                <p class="text-[12px] text-red-500 dark:text-red-400">
                    Cannot open file: {error}
                </p>
            {:else}
                {#if loading}
                    <p
                        class="text-[12px] italic text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        Loading…
                    </p>
                {/if}
                {#if isPdf}
                    <div
                        bind:this={pdfHost}
                        class="w-full"
                        style:zoom={zoom}
                    ></div>
                {:else if url}
                    <!-- `zoom` lives on the wrapper, not the <img>: putting it
                         on an element that also has `max-w-full` makes the
                         browser re-clamp it, so it never grows past 100%. -->
                    <div
                        class="flex w-full h-full items-center justify-center"
                        style:zoom={zoom}
                    >
                        <img
                            src={url}
                            alt={fileName}
                            class="max-w-full max-h-full object-contain rounded-lg"
                        />
                    </div>
                {/if}
            {/if}
        </div>

        <!-- Zoom controls (overlay, fixed over the body) -->
        {#if !error && (url || pdfBytes)}
            <div class="absolute top-12 right-3 z-20 flex flex-col gap-1">
                <button
                    onclick={zoomIn}
                    disabled={zoom >= MAX_ZOOM}
                    title="Zoom in"
                    aria-label="Zoom in"
                    class="cursor-pointer p-1.5 rounded-full bg-white/90 dark:bg-[#292c3c]/90
                           border border-slate-200 dark:border-[#414559]
                           text-brand-charcoal-400 dark:text-[#8caaee]
                           hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm
                           disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Icon icon="solar:add-circle-bold-duotone" width="0.85rem" />
                </button>
                <button
                    onclick={zoomOut}
                    disabled={zoom <= MIN_ZOOM}
                    title="Zoom out"
                    aria-label="Zoom out"
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
                {#if zoom !== 1}
                    <button
                        onclick={resetZoom}
                        title="Reset zoom"
                        aria-label="Reset zoom"
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
            </div>
            {#if zoom !== 1}
                <span
                    class="absolute bottom-3 left-3 z-20 text-[9px] font-semibold px-1.5 py-0.5
                           rounded-full bg-black/40 text-gray-100 backdrop-blur-sm
                           select-none pointer-events-none"
                >
                    {Math.round(zoom * 100)}%
                </span>
            {/if}
        {/if}

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
        width: 20px;
        height: 20px;
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
    .resize-se::before {
        content: "";
        position: absolute;
        bottom: 12px;
        right: 12px;
        width: 5px;
        height: 5px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.4);
        border-right: 1.5px solid rgba(130, 130, 130, 0.4);
        border-bottom-right-radius: 5px;
        pointer-events: none;
    }
    .resize-se::after {
        content: "";
        position: absolute;
        bottom: 8px;
        right: 8px;
        width: 9px;
        height: 9px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.55);
        border-right: 1.5px solid rgba(130, 130, 130, 0.55);
        border-bottom-right-radius: 9px;
        pointer-events: none;
    }
</style>
