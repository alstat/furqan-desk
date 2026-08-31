<!-- The workbook board: a pan/zoom surface the reader drops cards onto and
     arranges freely, plus the toolbar that adds them and the save/export
     actions. Shared by the Workbook window and the Verse Study canvas, so both
     are the same kind of document — one starts blank, the other starts seeded
     with an ayah's cards. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import WorkbookNodeCard from "./WorkbookNodeCard.svelte";
    import {
        emptyWorkbook,
        makeNode,
        workbookFromSvg,
        workbookToSvg,
        type WorkbookDoc,
        type WorkbookNodeKind,
    } from "$lib/stores/workbook.store";

    interface Props {
        doc?: WorkbookDoc;
        /** Shown in the toolbar's file name field. */
        onDocChange?: (doc: WorkbookDoc) => void;
    }
    let { doc = emptyWorkbook(), onDocChange }: Props = $props();

    let board = $state<WorkbookDoc>(doc);
    let selectedId = $state<string | null>(null);
    /**
     * Select drags cards and pans from empty space; hand pans from anywhere,
     * including over a card — the Miro habit, and the way out of "I dragged and
     * nothing moved" when the board is covered in cards.
     */
    let tool = $state<"select" | "hand">("select");
    let panning = $state(false);
    /**
     * The last document this board handed upwards. A parent that stores what
     * `onDocChange` gives it feeds the same object back in as the prop, and
     * adopting that would undo edits mid-gesture — so only a document the board
     * has not seen before replaces what is on screen. That is what makes a file
     * loaded after mount (a path read from disk, a window told to open one)
     * actually appear.
     */
    let lastEmitted: WorkbookDoc | null = null;

    $effect(() => {
        const incoming = doc;
        if (incoming === lastEmitted || incoming === board) return;
        board = incoming;
    });
    let surface = $state<HTMLElement | null>(null);
    let status = $state("");

    /** The kinds the toolbar offers, in the order it offers them. */
    const ADDABLE: { kind: WorkbookNodeKind; icon: string }[] = [
        { kind: "ayah", icon: "solar:book-2-bold-duotone" },
        { kind: "translation", icon: "solar:translation-2-bold-duotone" },
        { kind: "tafsir", icon: "solar:notebook-bold-duotone" },
        { kind: "related", icon: "solar:link-circle-bold-duotone" },
        { kind: "pipeline", icon: "solar:flow-bold-duotone" },
        { kind: "title", icon: "solar:text-bold-duotone" },
        { kind: "note", icon: "solar:notes-bold-duotone" },
        { kind: "image", icon: "solar:gallery-bold-duotone" },
    ];

    function commit(next: WorkbookDoc) {
        board = next;
        lastEmitted = next;
        onDocChange?.(next);
    }

    function updateNode(id: string, patch: Partial<WorkbookDoc["nodes"][number]>) {
        commit({
            ...board,
            nodes: board.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
        });
    }

    /**
     * New cards land near the middle of what the reader is looking at, each one
     * stepped down and right of the last so a run of clicks leaves a readable
     * cascade instead of a single stack.
     */
    let cascade = 0;
    function addNode(kind: WorkbookNodeKind) {
        const rect = surface?.getBoundingClientRect();
        const offset = (cascade++ % 6) * 28;
        const x =
            (-board.viewport.x + (rect ? rect.width / 2 : 400)) / board.viewport.zoom - 220 + offset;
        const y =
            (-board.viewport.y + (rect ? rect.height / 3 : 240)) / board.viewport.zoom - 60 + offset;
        const node = makeNode(kind, Math.round(x), Math.round(y));
        commit({ ...board, nodes: [...board.nodes, node] });
        selectedId = node.id;
        if (kind === "image") void pickImage(node.id);
    }

    /** Images ride inside the document as data URLs, so a saved board is one file. */
    async function pickImage(id: string) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => updateNode(id, { text: String(reader.result) });
            reader.readAsDataURL(file);
        };
        input.click();
    }

    // ── Dragging, resizing, panning ─────────────────────────────────────────
    let drag: { id: string; startX: number; startY: number; nodeX: number; nodeY: number } | null =
        null;
    let resize: { id: string; startX: number; startY: number; w: number; h: number } | null = null;
    let pan: { startX: number; startY: number; x: number; y: number } | null = null;

    function startDrag(event: PointerEvent, id: string) {
        if (tool === "hand") return startPan(event, true);
        const node = board.nodes.find((n) => n.id === id);
        if (!node) return;
        event.preventDefault();
        (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
        drag = { id, startX: event.clientX, startY: event.clientY, nodeX: node.x, nodeY: node.y };
    }

    function startResize(event: PointerEvent, id: string) {
        const node = board.nodes.find((n) => n.id === id);
        if (!node) return;
        event.preventDefault();
        event.stopPropagation();
        (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
        resize = {
            id,
            startX: event.clientX,
            startY: event.clientY,
            w: node.width,
            h: node.height,
        };
    }

    /**
     * `force` comes from a card that is being panned over rather than dragged.
     * The middle button pans too, whatever the tool — the habit every canvas
     * app shares.
     */
    function startPan(event: PointerEvent, force = false) {
        const fromEmptySpace = event.target === surface;
        if (!force && tool !== "hand" && event.button !== 1 && !fromEmptySpace) return;
        if (fromEmptySpace) selectedId = null;
        panning = true;
        pan = {
            startX: event.clientX,
            startY: event.clientY,
            x: board.viewport.x,
            y: board.viewport.y,
        };
    }

    function onPointerMove(event: PointerEvent) {
        const zoom = board.viewport.zoom;
        if (drag) {
            updateNode(drag.id, {
                x: Math.round(drag.nodeX + (event.clientX - drag.startX) / zoom),
                y: Math.round(drag.nodeY + (event.clientY - drag.startY) / zoom),
            });
        } else if (resize) {
            updateNode(resize.id, {
                width: Math.max(160, Math.round(resize.w + (event.clientX - resize.startX) / zoom)),
                height: Math.max(80, Math.round(resize.h + (event.clientY - resize.startY) / zoom)),
            });
        } else if (pan) {
            commit({
                ...board,
                viewport: {
                    ...board.viewport,
                    x: pan.x + (event.clientX - pan.startX),
                    y: pan.y + (event.clientY - pan.startY),
                },
            });
        }
    }

    function endGesture() {
        drag = null;
        resize = null;
        pan = null;
        panning = false;
    }

    function zoomBy(factor: number) {
        commit({
            ...board,
            viewport: {
                ...board.viewport,
                zoom: Math.min(2.5, Math.max(0.25, board.viewport.zoom * factor)),
            },
        });
    }

    function removeSelected() {
        if (!selectedId) return;
        commit({ ...board, nodes: board.nodes.filter((n) => n.id !== selectedId) });
        selectedId = null;
    }

    /** Back to 1:1 at the origin — the way home from a pan that went too far. */
    function resetView() {
        commit({ ...board, viewport: { x: 0, y: 0, zoom: 1 } });
    }

    /** Frames everything on the board, whatever the pan and zoom were. */
    function fitToContent() {
        if (board.nodes.length === 0) return resetView();
        const rect = surface?.getBoundingClientRect();
        const width = rect?.width ?? 1000;
        const height = rect?.height ?? 700;
        const minX = Math.min(...board.nodes.map((n) => n.x));
        const minY = Math.min(...board.nodes.map((n) => n.y));
        const maxX = Math.max(...board.nodes.map((n) => n.x + n.width));
        const maxY = Math.max(...board.nodes.map((n) => n.y + n.height));
        const pad = 48;
        const zoom = Math.min(
            2,
            Math.max(0.25, Math.min(width / (maxX - minX + pad * 2), height / (maxY - minY + pad * 2))),
        );
        commit({
            ...board,
            viewport: {
                zoom,
                x: (width - (maxX - minX) * zoom) / 2 - minX * zoom,
                y: (height - (maxY - minY) * zoom) / 2 - minY * zoom,
            },
        });
    }

    // ── The file ────────────────────────────────────────────────────────────

    /** Saves the board as an SVG that carries its own document inside it. */
    export async function saveSvg() {
        status = "";
        try {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const { writeTextFile } = await import("@tauri-apps/plugin-fs");
            const path = await save({
                defaultPath: `${board.title || "workbook"}.svg`,
                filters: [{ name: "SVG", extensions: ["svg"] }],
            });
            if (!path) return;
            await writeTextFile(path, workbookToSvg(board));
            status = $t("workbook.saved");
        } catch (e) {
            status = e instanceof Error ? e.message : String(e);
        }
    }

    /** Reopens a board this app saved. */
    export async function openSvg() {
        status = "";
        try {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const { readTextFile } = await import("@tauri-apps/plugin-fs");
            const path = await open({ filters: [{ name: "SVG", extensions: ["svg"] }] });
            if (typeof path !== "string") return;
            const parsed = workbookFromSvg(await readTextFile(path));
            if (!parsed) {
                status = $t("workbook.not_a_workbook");
                return;
            }
            commit(parsed);
        } catch (e) {
            status = e instanceof Error ? e.message : String(e);
        }
    }

    /** Rasterises the same SVG the save writes, so exports and files agree. */
    export async function exportPng() {
        status = "";
        try {
            const svg = workbookToSvg(board);
            const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
            const image = new Image();
            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error("Could not render the board."));
                image.src = url;
            });
            const canvas = document.createElement("canvas");
            canvas.width = image.width * 2;
            canvas.height = image.height * 2;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Could not render the board.");
            context.scale(2, 2);
            context.drawImage(image, 0, 0);
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob((b) => resolve(b), "image/png"),
            );
            if (!blob) throw new Error("Could not render the board.");
            const { save } = await import("@tauri-apps/plugin-dialog");
            const { writeFile } = await import("@tauri-apps/plugin-fs");
            const path = await save({
                defaultPath: `${board.title || "workbook"}.png`,
                filters: [{ name: "PNG", extensions: ["png"] }],
            });
            if (!path) return;
            await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
            status = $t("workbook.exported");
        } catch (e) {
            status = e instanceof Error ? e.message : String(e);
        }
    }

    /**
     * PDF goes through Typst, which the app already compiles: write the board's
     * SVG beside a one-page document that places it, and compile that. It keeps
     * the export vector rather than a screenshot of one.
     */
    export async function exportPdf() {
        status = "";
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const { save } = await import("@tauri-apps/plugin-dialog");
            const { writeFile, writeTextFile, remove } = await import("@tauri-apps/plugin-fs");
            const { tempDir, join } = await import("@tauri-apps/api/path");

            const dir = await tempDir();
            const svgPath = await join(dir, `workbook-${Date.now()}.svg`);
            await writeTextFile(svgPath, workbookToSvg(board));
            const source =
                `#set page(margin: 12pt, width: auto, height: auto)\n` +
                `#image("${svgPath.replace(/\\/g, "/")}")\n`;
            const bytes = await invoke<ArrayBuffer>("compile_typst_pdf", {
                source,
                path: svgPath,
            });
            const path = await save({
                defaultPath: `${board.title || "workbook"}.pdf`,
                filters: [{ name: "PDF", extensions: ["pdf"] }],
            });
            if (path) await writeFile(path, new Uint8Array(bytes));
            await remove(svgPath).catch(() => {});
            if (path) status = $t("workbook.exported");
        } catch (e) {
            status = e instanceof Error ? e.message : String(e);
        }
    }
</script>

<div class="flex min-h-0 flex-1 flex-col">
    <!-- Toolbar -->
    <div
        class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-brand-sand-200 bg-brand-sand-50 px-3 py-1.5 dark:border-[#414559] dark:bg-[#232634]"
    >
        <input
            value={board.title}
            oninput={(e) => commit({ ...board, title: e.currentTarget.value })}
            class="w-40 rounded-lg border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-charcoal-600 outline-none dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
        />
        <span class="mx-1 h-4 w-px bg-brand-sand-200 dark:bg-[#414559]"></span>
        {#each ADDABLE as item (item.kind)}
            <button
                onclick={() => addNode(item.kind)}
                title={$t(`workbook.add.${item.kind}`)}
                class="flex cursor-pointer items-center gap-1 rounded-full border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.625rem] font-semibold text-brand-charcoal-500 transition-colors hover:bg-brand-sand-100 dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5] dark:hover:bg-[#363a4f]"
            >
                <Icon icon={item.icon} width="0.7rem" />
                {$t(`workbook.node.${item.kind}`)}
            </button>
        {/each}
        {#if status}
            <span class="ml-auto text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                {status}
            </span>
        {/if}
    </div>

    <!-- Surface -->
    <div
        bind:this={surface}
        role="presentation"
        class="workbook-surface relative min-h-0 flex-1 overflow-hidden bg-[#faf7f0] dark:bg-[#1e2030] {panning
            ? 'cursor-grabbing'
            : tool === 'hand'
              ? 'cursor-grab'
              : ''}"
        onpointerdown={(event) => startPan(event)}
        onpointermove={onPointerMove}
        onpointerup={endGesture}
        onpointerleave={endGesture}
    >
        <div
            class="absolute origin-top-left"
            style:transform="translate({board.viewport.x}px, {board.viewport.y}px) scale({board.viewport.zoom})"
        >
            {#each board.nodes as node (node.id)}
                <WorkbookNodeCard
                    {node}
                    selected={selectedId === node.id}
                    onSelect={() => (selectedId = node.id)}
                    onChange={(patch) => updateNode(node.id, patch)}
                    onRemove={() =>
                        commit({ ...board, nodes: board.nodes.filter((n) => n.id !== node.id) })}
                    onDragStart={(event) => startDrag(event, node.id)}
                    onResizeStart={(event) => startResize(event, node.id)}
                />
            {/each}
        </div>
        <!-- Floating controls: the tools that act on the view rather than on the
             document, kept over the canvas where the work is, in the same glass
             panel the recitation player floats in. -->
        <div
            class="glass-panel pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-brand-sand-200/80 bg-white/90 px-1.5 py-1 shadow-md shadow-stone-300/20 backdrop-blur-md dark:border-[#414559] dark:bg-[#292c3c]/95 dark:shadow-black/20"
        >
            {#each [["select", "solar:cursor-bold-duotone"], ["hand", "solar:hand-shake-bold-duotone"]] as const as [mode, icon] (mode)}
                <button
                    onclick={() => (tool = mode)}
                    title={$t(`workbook.tool.${mode}`)}
                    aria-label={$t(`workbook.tool.${mode}`)}
                    aria-pressed={tool === mode}
                    class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-xl transition-colors {tool ===
                    mode
                        ? 'bg-brand-gold-200 text-brand-gold-600 dark:bg-[#414559] dark:text-[#e5c890]'
                        : 'text-brand-charcoal-400 hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#414559]'}"
                >
                    <Icon {icon} width="0.9rem" />
                </button>
            {/each}
            <span class="mx-0.5 h-4 w-px bg-brand-sand-200 dark:bg-[#414559]"></span>
            <button
                onclick={() => zoomBy(1 / 1.2)}
                title={$t("workbook.zoom_out")}
                aria-label={$t("workbook.zoom_out")}
                class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-xl text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:minus-circle-bold-duotone" width="0.9rem" />
            </button>
            <button
                onclick={resetView}
                title={$t("workbook.reset_view")}
                class="w-12 cursor-pointer rounded-xl text-center text-[0.625rem] font-semibold text-brand-charcoal-500 transition-colors hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
            >
                {Math.round(board.viewport.zoom * 100)}%
            </button>
            <button
                onclick={() => zoomBy(1.2)}
                title={$t("workbook.zoom_in")}
                aria-label={$t("workbook.zoom_in")}
                class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-xl text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:add-circle-bold-duotone" width="0.9rem" />
            </button>
            <span class="mx-0.5 h-4 w-px bg-brand-sand-200 dark:bg-[#414559]"></span>
            <button
                onclick={fitToContent}
                title={$t("workbook.fit")}
                aria-label={$t("workbook.fit")}
                class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-xl text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:maximize-square-minimalistic-bold-duotone" width="0.9rem" />
            </button>
            <button
                onclick={() => selectedId && removeSelected()}
                disabled={!selectedId}
                title={$t("workbook.remove_node")}
                aria-label={$t("workbook.remove_node")}
                class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-xl text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 hover:text-red-500 disabled:cursor-default disabled:opacity-40 dark:text-[#838ba7] dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:trash-bin-trash-bold-duotone" width="0.9rem" />
            </button>
        </div>

        {#if board.nodes.length === 0}
            <p
                class="pointer-events-none absolute inset-0 flex items-center justify-center text-[0.75rem] text-brand-charcoal-300 dark:text-[#626880]"
            >
                {$t("workbook.empty")}
            </p>
        {/if}
    </div>
</div>

<style>
    /* A board reads as a board: a faint grid the cards sit on. */
    .workbook-surface {
        background-image:
            radial-gradient(circle, rgba(0, 0, 0, 0.07) 1px, transparent 1px);
        background-size: 24px 24px;
    }
    :global(.dark) .workbook-surface {
        background-image:
            radial-gradient(circle, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
    }
</style>
