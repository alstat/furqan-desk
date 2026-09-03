<!-- The workbook board: a pan/zoom surface the reader drops cards onto and
     arranges freely, plus the toolbar that adds them and the save/export
     actions. Shared by the Workbook window and the Verse Study canvas, so both
     are the same kind of document — one starts blank, the other starts seeded
     with an ayah's cards. Every Qur'an/shape/output card always carries a
     pair of ports, so any two can be wired straight away; the board resolves
     what flows through every wire, but only a `view` card ever renders it —
     grouping a wired run just adds the visual frame around it. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import WorkbookNodeCard from "./WorkbookNodeCard.svelte";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import {
        DATA_NODE_KINDS,
        emptyWorkbook,
        makeNode,
        resolveNodeOutputs,
        workbookFromSvg,
        workbookToSvg,
        type VerseRow,
        type WorkbookDoc,
        type WorkbookNode,
        type WorkbookNodeKind,
    } from "$lib/stores/workbook.store";

    interface Props {
        doc?: WorkbookDoc;
        /** Shown in the toolbar's file name field. */
        onDocChange?: (doc: WorkbookDoc) => void;
        /**
         * Whether the toolbar shows its own title field. The Workbook window
         * puts the title in the window header instead and turns this off; the
         * Verse Study canvas embeds this board with no header of its own, so it
         * keeps the toolbar's field as the only place to rename the board.
         */
        showTitleInToolbar?: boolean;
        /**
         * Live recomputes on every relevant change; Manual holds still until
         * the reader presses Run. Bindable so the Workbook window's header
         * can drive it directly, since that is where the control lives when
         * this board has a window of its own (see `showTitleInToolbar`).
         */
        runMode?: "live" | "manual";
    }
    let {
        doc = emptyWorkbook(),
        onDocChange,
        showTitleInToolbar = true,
        runMode = $bindable("live"),
    }: Props = $props();

    let board = $state<WorkbookDoc>(doc);
    let selectedIds = $state<string[]>([]);
    /**
     * Select drags cards and marquee-selects from empty space; hand pans from
     * anywhere, including over a card — the Miro habit, and the way out of "I
     * dragged and nothing moved" when the board is covered in cards.
     */
    let tool = $state<"select" | "hand">("select");
    let panning = $state(false);

    /**
     * Tool shortcuts: V selects, H pans, and holding Space pans temporarily
     * then restores whatever tool was active — the same space-to-pan
     * convention DrawingCanvas.svelte uses, so the two canvases in this app
     * agree with each other.
     */
    let spaceHeld = false;
    let toolBeforeSpace: "select" | "hand" | null = null;

    function isTypingTarget(target: EventTarget | null): boolean {
        return (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            (target instanceof HTMLElement && target.isContentEditable)
        );
    }

    function onToolKeyDown(e: KeyboardEvent) {
        if (isTypingTarget(e.target)) return;
        if (e.code === "Space" && !spaceHeld) {
            spaceHeld = true;
            toolBeforeSpace = tool;
            tool = "hand";
            e.preventDefault();
            return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "v" || e.key === "V") tool = "select";
        else if (e.key === "h" || e.key === "H") tool = "hand";
    }

    function onToolKeyUp(e: KeyboardEvent) {
        if (e.code === "Space" && spaceHeld) {
            spaceHeld = false;
            if (toolBeforeSpace) tool = toolBeforeSpace;
            toolBeforeSpace = null;
        }
    }

    /**
     * A fingerprint of the last document this board handed upwards. A parent
     * that stores what `onDocChange` gives it feeds the same document back in
     * as the prop, and adopting that would undo edits mid-gesture — so only a
     * document the board has not seen before replaces what is on screen. That
     * is what makes a file loaded after mount (a path read from disk, a
     * window told to open one) actually appear.
     *
     * Compared by content, not by reference: `commit` hands the parent a raw
     * object, which the parent's own `$state` re-wraps in a proxy distinct
     * from the one `board = next` makes locally, so `incoming === lastEmitted`
     * can never be true even for the exact doc this board just emitted.
     */
    let lastEmitted = "";

    $effect(() => {
        const incoming = doc;
        if (incoming === board) return;
        const incomingJson = JSON.stringify(incoming);
        if (incomingJson === lastEmitted) return;
        board = incoming;
    });
    let surface = $state<HTMLElement | null>(null);
    let status = $state("");

    /** The kinds the toolbar offers, in the order it offers them. */
    // Grouped by role in the pipeline (mirrors STEP_META's own source →
    // enrich → shape → output shape, extended with the kinds that fall
    // outside a wired chain) rather than one flat row of fourteen buttons —
    // the toolbar reads as "where does what I want live" instead of a
    // lookup-by-memory list.
    const ADDABLE_GROUPS: { label: string; items: { kind: WorkbookNodeKind; icon: string }[] }[] = [
        {
            label: "workbook.toolbar_group.source",
            items: [{ kind: "ayah", icon: "solar:book-2-bold-duotone" }],
        },
        {
            label: "workbook.toolbar_group.enrich",
            items: [
                { kind: "translation", icon: "solar:translation-2-bold-duotone" },
                { kind: "tafsir", icon: "solar:notebook-bold-duotone" },
                { kind: "related", icon: "solar:link-circle-bold-duotone" },
            ],
        },
        {
            label: "workbook.toolbar_group.shape",
            items: [
                { kind: "filter", icon: "solar:filter-bold-duotone" },
                { kind: "limit", icon: "solar:sort-vertical-bold-duotone" },
                { kind: "dedupe", icon: "solar:copy-bold-duotone" },
            ],
        },
        {
            label: "workbook.toolbar_group.code",
            items: [
                { kind: "julia", icon: "devicon-plain:julia" },
                { kind: "lean", icon: "vscode-icons:file-type-light-lean" },
            ],
        },
        {
            label: "workbook.toolbar_group.output",
            items: [
                { kind: "view", icon: "solar:eye-bold-duotone" },
                { kind: "export", icon: "solar:download-square-bold-duotone" },
            ],
        },
        {
            label: "workbook.toolbar_group.content",
            items: [
                { kind: "title", icon: "solar:text-square-bold-duotone" },
                { kind: "note", icon: "solar:notes-bold-duotone" },
                { kind: "image", icon: "solar:gallery-bold-duotone" },
            ],
        },
    ];

    function commit(next: WorkbookDoc) {
        board = next;
        lastEmitted = JSON.stringify(next);
        onDocChange?.(next);
    }

    function updateNode(id: string, patch: Partial<WorkbookDoc["nodes"][number]>) {
        commit({
            ...board,
            nodes: board.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
        });
    }

    /** Removes nodes and anything that pointed at them — their edges, and their place in any group. */
    function removeNodeIds(ids: string[]) {
        const idSet = new Set(ids);
        commit({
            ...board,
            nodes: board.nodes.filter((n) => !idSet.has(n.id)),
            edges: board.edges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to)),
            groups: board.groups
                .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => !idSet.has(id)) }))
                .filter((g) => g.nodeIds.length >= 2),
        });
        selectedIds = selectedIds.filter((id) => !idSet.has(id));
    }

    function removeSelected() {
        if (selectedIds.length) removeNodeIds(selectedIds);
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
        selectedIds = [node.id];
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

    // ── Selection ────────────────────────────────────────────────────────────
    //
    // A plain click on a card outside the current selection replaces it;
    // shift/cmd/ctrl-click toggles membership; a plain click (or drag) on a
    // card already selected leaves a multi-selection intact, so the whole
    // group can be dragged together. `startDrag` and the card's own
    // pointerdown both see the same event as it bubbles, so the update is
    // guarded to run once per gesture.
    /**
     * A card's stacking order, same "raise on click" convention as the
     * floating panels (see ManuscriptViewer.svelte) — the counter is shared
     * app-wide, so a card clicked here always ends up above every unclicked
     * one (they stay at the CSS default), and among clicked cards, whichever
     * was touched most recently wins.
     */
    let nodeZ = $state<Record<string, number>>({});

    function selectNode(event: PointerEvent, id: string) {
        const marker = event as PointerEvent & { _wbSelectHandled?: boolean };
        if (marker._wbSelectHandled) return;
        marker._wbSelectHandled = true;
        nodeZ = { ...nodeZ, [id]: bringToFront() };
        const additive = event.shiftKey || event.metaKey || event.ctrlKey;
        if (additive) {
            selectedIds = selectedIds.includes(id)
                ? selectedIds.filter((x) => x !== id)
                : [...selectedIds, id];
        } else if (!selectedIds.includes(id)) {
            selectedIds = [id];
        }
    }

    function isGrouped(id: string): boolean {
        return board.groups.some((g) => g.nodeIds.includes(id));
    }

    const canGroup = $derived(
        selectedIds.length >= 2 &&
            selectedIds.every((id) => {
                const n = board.nodes.find((x) => x.id === id);
                return !!n && DATA_NODE_KINDS.includes(n.kind) && !isGrouped(id);
            }),
    );
    const canUngroup = $derived(selectedIds.some((id) => isGrouped(id)));

    function groupSelected() {
        if (!canGroup) return;
        commit({
            ...board,
            groups: [...board.groups, { id: crypto.randomUUID(), nodeIds: [...selectedIds] }],
        });
    }

    function ungroupSelected() {
        const targets = new Set(
            board.groups
                .filter((g) => g.nodeIds.some((id) => selectedIds.includes(id)))
                .map((g) => g.id),
        );
        if (targets.size === 0) return;
        commit({ ...board, groups: board.groups.filter((g) => !targets.has(g.id)) });
    }

    /** Any wire with both ends in the current selection — what "Disconnect" in the floating toolbar removes. */
    const canDisconnect = $derived(
        selectedIds.length >= 2 &&
            board.edges.some((e) => selectedIds.includes(e.from) && selectedIds.includes(e.to)),
    );

    function disconnectSelected() {
        if (!canDisconnect) return;
        commit({
            ...board,
            edges: board.edges.filter((e) => !(selectedIds.includes(e.from) && selectedIds.includes(e.to))),
        });
    }

    // ── Dragging, resizing, panning, marquee-selecting ──────────────────────
    let drag: { origins: Map<string, { x: number; y: number }>; startX: number; startY: number } | null =
        null;
    let resize: { id: string; startX: number; startY: number; w: number; h: number } | null = null;
    let pan: { startX: number; startY: number; x: number; y: number } | null = null;
    let marquee = $state<{
        startX: number;
        startY: number;
        curX: number;
        curY: number;
        additive: boolean;
        rectLeft: number;
        rectTop: number;
    } | null>(null);
    /** A connection being dragged from one port to another; `x`/`y` are the live pointer, in board space. */
    let portDrag = $state<{ fromId: string; side: "in" | "out"; x: number; y: number } | null>(null);

    function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
        const rect = surface?.getBoundingClientRect();
        const sx = clientX - (rect?.left ?? 0);
        const sy = clientY - (rect?.top ?? 0);
        return {
            x: (sx - board.viewport.x) / board.viewport.zoom,
            y: (sy - board.viewport.y) / board.viewport.zoom,
        };
    }

    function startDrag(event: PointerEvent, id: string) {
        if (tool === "hand") return startPan(event, true);
        selectNode(event, id);
        if (!board.nodes.some((n) => n.id === id)) return;
        event.preventDefault();
        const origins = new Map(
            selectedIds.map((sid) => {
                const n = board.nodes.find((x) => x.id === sid);
                return [sid, { x: n?.x ?? 0, y: n?.y ?? 0 }] as const;
            }),
        );
        drag = { origins, startX: event.clientX, startY: event.clientY };
        try {
            (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
        } catch {
            /* see startStepDrag: capture is an optimisation, not a prerequisite */
        }
    }

    function startResize(event: PointerEvent, id: string) {
        const node = board.nodes.find((n) => n.id === id);
        if (!node) return;
        event.preventDefault();
        event.stopPropagation();
        try {
            (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
        } catch {
            /* ditto */
        }
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
     * app shares. Otherwise the Select tool marquee-selects from empty space
     * instead of panning — panning that way used to double as "click to
     * deselect," which meant Select behaved like a second Hand tool.
     */
    function startPan(event: PointerEvent, force = false) {
        if (force || tool === "hand" || event.button === 1) {
            panning = true;
            pan = {
                startX: event.clientX,
                startY: event.clientY,
                x: board.viewport.x,
                y: board.viewport.y,
            };
            return;
        }
        if (event.target === surface) startMarquee(event);
    }

    function startMarquee(event: PointerEvent) {
        const rect = surface?.getBoundingClientRect();
        marquee = {
            startX: event.clientX,
            startY: event.clientY,
            curX: event.clientX,
            curY: event.clientY,
            additive: event.shiftKey || event.metaKey || event.ctrlKey,
            rectLeft: rect?.left ?? 0,
            rectTop: rect?.top ?? 0,
        };
    }

    function startPortDrag(event: PointerEvent, nodeId: string, side: "in" | "out") {
        const world = screenToWorld(event.clientX, event.clientY);
        portDrag = { fromId: nodeId, side, x: world.x, y: world.y };
    }

    function onPointerMove(event: PointerEvent) {
        const zoom = board.viewport.zoom;
        if (drag) {
            const dx = (event.clientX - drag.startX) / zoom;
            const dy = (event.clientY - drag.startY) / zoom;
            commit({
                ...board,
                nodes: board.nodes.map((n) => {
                    const origin = drag!.origins.get(n.id);
                    if (!origin) return n;
                    return { ...n, x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) };
                }),
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
        } else if (marquee) {
            marquee = { ...marquee, curX: event.clientX, curY: event.clientY };
        } else if (portDrag) {
            const world = screenToWorld(event.clientX, event.clientY);
            portDrag = { ...portDrag, x: world.x, y: world.y };
        }
    }

    /** Which node (if any) a drop at this client point lands on — the source node excluded. */
    function nodeAt(clientX: number, clientY: number, excludeId: string) {
        const world = screenToWorld(clientX, clientY);
        return board.nodes.find(
            (n) =>
                n.id !== excludeId &&
                DATA_NODE_KINDS.includes(n.kind) &&
                world.x >= n.x &&
                world.x <= n.x + n.width &&
                world.y >= n.y &&
                world.y <= n.y + n.height,
        );
    }

    function endGesture(event: PointerEvent) {
        if (marquee) {
            const a = screenToWorld(marquee.startX, marquee.startY);
            const b = screenToWorld(marquee.curX, marquee.curY);
            const minX = Math.min(a.x, b.x);
            const maxX = Math.max(a.x, b.x);
            const minY = Math.min(a.y, b.y);
            const maxY = Math.max(a.y, b.y);
            const hit = board.nodes
                .filter((n) => n.x < maxX && n.x + n.width > minX && n.y < maxY && n.y + n.height > minY)
                .map((n) => n.id);
            selectedIds = marquee.additive ? [...new Set([...selectedIds, ...hit])] : hit;
            marquee = null;
        }
        if (portDrag) {
            const target = nodeAt(event.clientX, event.clientY, portDrag.fromId);
            if (target) {
                const from = portDrag.side === "out" ? portDrag.fromId : target.id;
                const to = portDrag.side === "out" ? target.id : portDrag.fromId;
                const edges = board.edges.filter((e) => e.from !== from && e.to !== to);
                commit({ ...board, edges: [...edges, { id: crypto.randomUUID(), from, to }] });
            } else {
                // Dropped on empty space rather than another node — a plain
                // click on a port lands here too, since it never moves onto
                // a target. If this port already had a wire, that removes
                // it (dragging a connected wire away disconnects it, same
                // as most node editors); an unwired port dropped on empty
                // space is just a cancelled drag, same as before.
                const edges = board.edges.filter((e) =>
                    portDrag!.side === "out" ? e.from !== portDrag!.fromId : e.to !== portDrag!.fromId,
                );
                if (edges.length !== board.edges.length) commit({ ...board, edges });
            }
            portDrag = null;
        }
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

    /**
     * Plain scroll zooms, centred on the pointer so the point under the cursor
     * stays put. Shift+scroll pans horizontally instead — the trackpad habit
     * for a canvas wider than it is tall, and the only way to shift sideways
     * with a mouse's single wheel axis.
     */
    function onWheel(event: WheelEvent) {
        event.preventDefault();
        if (event.shiftKey) {
            const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
            commit({
                ...board,
                viewport: { ...board.viewport, x: board.viewport.x - delta },
            });
            return;
        }
        const zoom = board.viewport.zoom;
        const nz = Math.min(2.5, Math.max(0.25, zoom * Math.exp(-event.deltaY * 0.0025)));
        const rect = surface?.getBoundingClientRect();
        const cx = rect ? event.clientX - rect.left : 0;
        const cy = rect ? event.clientY - rect.top : 0;
        commit({
            ...board,
            viewport: {
                zoom: nz,
                x: cx - ((cx - board.viewport.x) * nz) / zoom,
                y: cy - ((cy - board.viewport.y) * nz) / zoom,
            },
        });
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

    /** Renames the board — called from the window header when the toolbar's own title field is off. */
    export function setTitle(title: string) {
        commit({ ...board, title });
    }

    // ── Pipeline: ports, wires, groups, and what flows through them ─────────

    /** Every data card always carries ports — wiring doesn't require grouping first. */
    function hasPort(id: string): boolean {
        const node = board.nodes.find((n) => n.id === id);
        return !!node && DATA_NODE_KINDS.includes(node.kind);
    }

    function upstreamOf(id: string): string | undefined {
        return board.edges.find((e) => e.to === id)?.from;
    }

    let nodeOutputs = $state<Map<string, VerseRow[]>>(new Map());

    let runTick = $state(0);
    let lastRunTick = 0;

    /** The explicit trigger in Manual mode — recomputes the whole pipeline once. */
    export function runNow() {
        runTick += 1;
    }

    // Recomputed whenever a node's own settings change or the wiring changes —
    // not on drag/resize, which touch only x/y/width/height — but only in
    // Live mode; in Manual mode this waits for `runTick` from runNow().
    $effect(() => {
        const key =
            board.nodes
                .map((n) => `${n.id}:${n.kind}:${(n.refs ?? []).join(",")}:${n.limit}:${n.query}:${n.layout}`)
                .join("|") +
            "::" +
            board.edges.map((e) => `${e.from}>${e.to}`).join(",");
        void key;
        const tick = runTick;
        if (runMode === "manual" && tick === lastRunTick) return;
        lastRunTick = tick;
        void (async () => {
            nodeOutputs = await resolveNodeOutputs(board);
        })();
    });

    function inputRowsFor(id: string): VerseRow[] | null {
        const up = upstreamOf(id);
        return up ? (nodeOutputs.get(up) ?? []) : null;
    }

    /** The node directly wired into this one's input, if any — a `view` card reads this to offer hosting a wired Julia/Lean node's REPL, infoview, or plots. */
    function upstreamNodeFor(id: string): WorkbookNode | null {
        const up = upstreamOf(id);
        return up ? (board.nodes.find((n) => n.id === up) ?? null) : null;
    }

    /** One cubic-bezier per committed wire, from the source's output port to the target's input port. */
    const wires = $derived(
        board.edges
            .map((edge) => {
                const from = board.nodes.find((n) => n.id === edge.from);
                const to = board.nodes.find((n) => n.id === edge.to);
                if (!from || !to) return null;
                const x1 = from.x + from.width;
                const y1 = from.y + from.height / 2;
                const x2 = to.x;
                const y2 = to.y + to.height / 2;
                const bend = Math.max(24, Math.abs(x2 - x1) / 2);
                return { id: edge.id, x1, y1, x2, y2, bend };
            })
            .filter((w): w is NonNullable<typeof w> => !!w),
    );

    /** A live preview while a connection is being dragged, before it lands. */
    const wireDraft = $derived.by(() => {
        if (!portDrag) return null;
        const node = board.nodes.find((n) => n.id === portDrag!.fromId);
        if (!node) return null;
        const x1 = portDrag.side === "out" ? node.x + node.width : node.x;
        const y1 = node.y + node.height / 2;
        const bend = Math.max(24, Math.abs(portDrag.x - x1) / 2);
        return { x1, y1, x2: portDrag.x, y2: portDrag.y, bend };
    });

    /** One padded frame per group, sized to its members, drawn behind the cards. */
    const groupFrames = $derived(
        board.groups
            .map((group) => {
                const members = group.nodeIds
                    .map((id) => board.nodes.find((n) => n.id === id))
                    .filter((n): n is WorkbookDoc["nodes"][number] => !!n);
                if (members.length === 0) return null;
                const pad = 28;
                const x = Math.min(...members.map((n) => n.x)) - pad;
                const y = Math.min(...members.map((n) => n.y)) - pad - 22;
                const right = Math.max(...members.map((n) => n.x + n.width)) + pad;
                const bottom = Math.max(...members.map((n) => n.y + n.height)) + pad;
                return { id: group.id, count: members.length, x, y, width: right - x, height: bottom - y };
            })
            .filter((g): g is NonNullable<typeof g> => !!g),
    );

    const marqueeRect = $derived.by(() => {
        if (!marquee) return null;
        const x1 = Math.min(marquee.startX, marquee.curX) - marquee.rectLeft;
        const y1 = Math.min(marquee.startY, marquee.curY) - marquee.rectTop;
        const x2 = Math.max(marquee.startX, marquee.curX) - marquee.rectLeft;
        const y2 = Math.max(marquee.startY, marquee.curY) - marquee.rectTop;
        return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    });

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

<svelte:window onkeydown={onToolKeyDown} onkeyup={onToolKeyUp} />

<div class="flex min-h-0 flex-1 flex-col">
    <!-- Toolbar -->
    <div
        class="flex shrink-0 flex-wrap items-center gap-2 border-b border-brand-sand-200 bg-brand-sand-50/80 px-3 py-2 backdrop-blur-md dark:border-[#414559] dark:bg-[#232634]/80"
    >
        {#if showTitleInToolbar}
            <input
                value={board.title}
                oninput={(e) => commit({ ...board, title: e.currentTarget.value })}
                class="w-44 rounded-lg border border-brand-sand-200 bg-white px-2.5 py-1 text-xs font-semibold tracking-tight text-brand-charcoal-900 outline-none transition-colors focus:border-brand-gold-400 dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
            />
            <span class="h-5 w-px bg-brand-sand-200 dark:bg-[#414559]"></span>
        {/if}
        {#each ADDABLE_GROUPS as group (group.label)}
            <!-- The group reads from the shared boundary around its buttons,
                 not a text label taking up room in the row — the name is
                 still there, just as the container's own tooltip. Each
                 group is one flex item, so wrapping breaks between groups
                 rather than splitting one mid-way. -->
            <div
                title={$t(group.label)}
                class="flex items-center gap-1 rounded-2xl border border-brand-sand-200 bg-brand-sand-50/70 p-1 dark:border-[#414559] dark:bg-[#232634]/50"
            >
                {#each group.items as item (item.kind)}
                    <button
                        onclick={() => addNode(item.kind)}
                        title={$t(`workbook.add.${item.kind}`)}
                        class="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-sand-100 px-2.5 py-1 text-xs font-semibold text-brand-charcoal-500 transition-colors hover:bg-brand-sand-200 dark:bg-[#363a4f] dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                    >
                        <Icon icon={item.icon} width="0.75rem" />
                        {$t(`workbook.node.${item.kind}`)}
                    </button>
                {/each}
            </div>
        {/each}
        <div class="ml-auto flex items-center gap-2">
            {#if showTitleInToolbar}
                <!-- The Workbook window puts this in its title bar instead
                     (see WorkbookTabStrip's neighbour in +page.svelte); the
                     Verse Study canvas has no header of its own, so it keeps
                     this here, same as the title field above. -->
                <div class="flex items-center gap-1 rounded-full bg-brand-gold-200/50 p-1 dark:bg-[#414559]/50">
                    {#each [["live", "solar:bolt-bold-duotone"], ["manual", "solar:hand-stars-bold-duotone"]] as const as [mode, icon] (mode)}
                        <button
                            onclick={() => (runMode = mode)}
                            title={$t(`workbook.run_mode.${mode}`)}
                            aria-pressed={runMode === mode}
                            class="flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[0.625rem] font-semibold transition-colors {runMode ===
                            mode
                                ? 'bg-white text-brand-charcoal-900 shadow-sm dark:bg-[#51576d] dark:text-[#c6d0f5]'
                                : 'text-brand-gold-600 hover:text-brand-charcoal-900 dark:text-[#838ba7] dark:hover:text-[#c6d0f5]'}"
                        >
                            <Icon {icon} width="0.7rem" />
                            {$t(`workbook.run_mode.${mode}`)}
                        </button>
                    {/each}
                </div>
                {#if runMode === "manual"}
                    <button
                        onclick={runNow}
                        title={$t("workbook.run_now")}
                        aria-label={$t("workbook.run_now")}
                        class="flex cursor-pointer items-center gap-1 rounded-full bg-brand-gold-500 px-2.5 py-1 text-[0.625rem] font-semibold text-white shadow-sm transition-colors hover:bg-brand-gold-600 dark:bg-[#e5c890] dark:text-[#232634] dark:hover:bg-[#d4b57f]"
                    >
                        <Icon icon="solar:play-bold-duotone" width="0.7rem" />
                        {$t("workbook.run_now")}
                    </button>
                {/if}
            {/if}
            {#if status}
                <span class="text-[0.6875rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                    {status}
                </span>
            {/if}
        </div>
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
        onwheel={onWheel}
    >
        <div
            class="absolute origin-top-left"
            style:transform="translate({board.viewport.x}px, {board.viewport.y}px) scale({board.viewport.zoom})"
        >
            <!-- Group frames behind everything, then wires, then the cards on top. -->
            {#each groupFrames as frame (frame.id)}
                <div
                    class="pointer-events-none absolute rounded-2xl border-2 border-dashed border-brand-gold-300/60 bg-gradient-to-br from-brand-gold-50/40 to-transparent dark:border-[#5a5030]/70 dark:from-[#34302a]/40"
                    style:left="{frame.x}px"
                    style:top="{frame.y}px"
                    style:width="{frame.width}px"
                    style:height="{frame.height}px"
                >
                    <span
                        class="pointer-events-auto absolute -top-2.5 left-3 flex items-center gap-1 rounded-full border border-brand-gold-300/70 bg-white px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-widest text-brand-gold-600 shadow-sm dark:border-[#5a5030] dark:bg-[#232634] dark:text-[#e5c890]"
                    >
                        <Icon icon="solar:flow-bold-duotone" width="0.65rem" />
                        {$t("workbook.pipeline_label", { n: String(frame.count) })}
                    </span>
                </div>
            {/each}

            <svg class="pointer-events-none absolute inset-0 h-[1px] w-[1px] overflow-visible">
                {#each wires as wire (wire.id)}
                    <path
                        d="M {wire.x1} {wire.y1} C {wire.x1 + wire.bend} {wire.y1}, {wire.x2 -
                            wire.bend} {wire.y2}, {wire.x2} {wire.y2}"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="text-brand-gold-400/80 dark:text-[#e5c890]/70"
                    />
                    <circle cx={wire.x2} cy={wire.y2} r="3" class="fill-brand-gold-400/80 dark:fill-[#e5c890]/70" />
                {/each}
                {#if wireDraft}
                    <path
                        d="M {wireDraft.x1} {wireDraft.y1} C {wireDraft.x1 + wireDraft.bend} {wireDraft.y1}, {wireDraft.x2 -
                            wireDraft.bend} {wireDraft.y2}, {wireDraft.x2} {wireDraft.y2}"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-dasharray="5 4"
                        class="text-brand-gold-500 dark:text-[#e5c890]"
                    />
                {/if}
            </svg>

            {#each board.nodes as node (node.id)}
                <WorkbookNodeCard
                    {node}
                    selected={selectedIds.includes(node.id)}
                    hasPort={hasPort(node.id)}
                    inputRows={inputRowsFor(node.id)}
                    upstreamNode={upstreamNodeFor(node.id)}
                    live={runMode === "live"}
                    runToken={runTick}
                    zIndex={nodeZ[node.id] ?? 0}
                    onSelect={(event) => selectNode(event, node.id)}
                    onChange={(patch) => updateNode(node.id, patch)}
                    onRemove={() => removeNodeIds([node.id])}
                    onDragStart={(event) => startDrag(event, node.id)}
                    onResizeStart={(event) => startResize(event, node.id)}
                    onPortDragStart={(event, side) => startPortDrag(event, node.id, side)}
                />
            {/each}
        </div>

        <!-- Marquee: screen space, not the pan/zoom transform, so it tracks the pointer exactly. -->
        {#if marqueeRect}
            <div
                class="pointer-events-none absolute z-30 rounded-md border-2 border-brand-gold-400/70 bg-brand-gold-200/20 dark:border-[#e5c890]/70 dark:bg-[#e5c890]/10"
                style:left="{marqueeRect.x}px"
                style:top="{marqueeRect.y}px"
                style:width="{marqueeRect.width}px"
                style:height="{marqueeRect.height}px"
            ></div>
        {/if}

        <!-- Floating controls: the tools that act on the view rather than on the
             document, kept over the canvas where the work is, in the same glass
             panel the recitation player floats in. -->
        <div
            class="glass-panel pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-brand-sand-200/80 bg-white/90 px-2 py-1.5 shadow-md shadow-stone-300/20 backdrop-blur-md dark:border-[#414559] dark:bg-[#292c3c]/95 dark:shadow-black/20"
        >
            {#each [["select", "solar:cursor-bold-duotone", "V"], ["hand", "solar:hand-shake-bold-duotone", "H"]] as const as [mode, icon, key] (mode)}
                <button
                    onclick={() => (tool = mode)}
                    title="{$t(`workbook.tool.${mode}`)} ({key})"
                    aria-label={$t(`workbook.tool.${mode}`)}
                    aria-pressed={tool === mode}
                    class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl transition-colors {tool ===
                    mode
                        ? 'bg-brand-gold-200 text-brand-gold-600 dark:bg-[#414559] dark:text-[#e5c890]'
                        : 'text-brand-charcoal-400 hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#414559]'}"
                >
                    <Icon {icon} width="1.05rem" />
                </button>
            {/each}
            <span class="mx-0.5 h-5 w-px bg-brand-sand-200 dark:bg-[#414559]"></span>
            <button
                onclick={() => zoomBy(1 / 1.2)}
                title={$t("workbook.zoom_out")}
                aria-label={$t("workbook.zoom_out")}
                class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:minus-circle-bold-duotone" width="1.05rem" />
            </button>
            <button
                onclick={resetView}
                title={$t("workbook.reset_view")}
                class="w-14 cursor-pointer rounded-xl text-center text-[0.6875rem] font-semibold text-brand-charcoal-500 transition-colors hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
            >
                {Math.round(board.viewport.zoom * 100)}%
            </button>
            <button
                onclick={() => zoomBy(1.2)}
                title={$t("workbook.zoom_in")}
                aria-label={$t("workbook.zoom_in")}
                class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:add-circle-bold-duotone" width="1.05rem" />
            </button>
            <span class="mx-0.5 h-5 w-px bg-brand-sand-200 dark:bg-[#414559]"></span>
            <button
                onclick={fitToContent}
                title={$t("workbook.fit")}
                aria-label={$t("workbook.fit")}
                class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:maximize-square-minimalistic-bold-duotone" width="1.05rem" />
            </button>
            <span class="mx-0.5 h-5 w-px bg-brand-sand-200 dark:bg-[#414559]"></span>
            <button
                onclick={groupSelected}
                disabled={!canGroup}
                title={$t("workbook.group")}
                aria-label={$t("workbook.group")}
                class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 disabled:cursor-default disabled:opacity-40 dark:text-[#838ba7] dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:widget-add-bold-duotone" width="1.05rem" />
            </button>
            <button
                onclick={ungroupSelected}
                disabled={!canUngroup}
                title={$t("workbook.ungroup")}
                aria-label={$t("workbook.ungroup")}
                class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 disabled:cursor-default disabled:opacity-40 dark:text-[#838ba7] dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:widget-5-bold-duotone" width="1.05rem" />
            </button>
            <button
                onclick={disconnectSelected}
                disabled={!canDisconnect}
                title={$t("workbook.disconnect")}
                aria-label={$t("workbook.disconnect")}
                class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 disabled:cursor-default disabled:opacity-40 dark:text-[#838ba7] dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:link-broken-bold" width="1.05rem" />
            </button>
            <button
                onclick={removeSelected}
                disabled={!selectedIds.length}
                title={$t("workbook.remove_node")}
                aria-label={$t("workbook.remove_node")}
                class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 hover:text-red-500 disabled:cursor-default disabled:opacity-40 dark:text-[#838ba7] dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:trash-bin-trash-bold-duotone" width="1.05rem" />
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
