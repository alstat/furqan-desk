<!-- The Workbook window's Chrome-style tab strip: one board per tab, an
     inline rename, a fade toward the window controls once there are enough
     tabs to overflow, and — the two-gesture version of Chrome's tear-off —
     an explicit "Open as separate window" action plus the ability to drag
     the standalone window that produces back onto another Workbook window's
     strip to merge it back in as a tab.

     Modeled on EditorTabs.svelte's proven pointer-drag/rename/fade mechanics
     (that component's Julia/Typst/Lean split-group logic doesn't apply here
     — a workbook tab is always just one board). -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import type { WorkbookTab } from "$lib/stores/workbook-tabs";
    import { WORKBOOK_ATTACH_TABS_EVENT, WORKBOOK_DROP_HOVER_EVENT } from "$lib/stores/workbook.store";
    import { onMount, tick } from "svelte";

    interface Props {
        tabs: WorkbookTab[];
        activeTabId: string | null;
        onSelect: (id: string) => void;
        onReorder: (tabs: WorkbookTab[]) => void;
        onRename: (id: string, title: string) => void;
        onClose: (id: string) => void;
        onNewTab: () => void;
        onPopOut: (tab: WorkbookTab) => void;
        onAttachTabs: (tabs: WorkbookTab[]) => void;
    }
    let { tabs, activeTabId, onSelect, onReorder, onRename, onClose, onNewTab, onPopOut, onAttachTabs }: Props =
        $props();

    // ── Cross-window drag-to-reattach (see workbook.store.ts's event docs) ──
    // Only a single-tab window is ever the *source* of this drag — dragging
    // one tab out of a multi-tab window mid-gesture is Chrome's continuous
    // tear-off, which isn't what was asked for; "Open as separate window"
    // covers that instead, in one deliberate step. Any window, single-tab or
    // not, can be the *target* a dragged window is dropped onto.
    let dropHighlighted = $state(false);

    // Pre-resolved once, not per-drag: the window manager only latches onto
    // an in-progress mouse-button-down gesture, so `startDragging()` below
    // has to fire in the same tick as the pointerdown that triggers it — an
    // `await import(...)` first, even of an already-cached module, yields to
    // the microtask queue and loses that gesture, silently no-op-ing the
    // drag. Resolving the APIs ahead of time in onMount is what lets the
    // actual drag handler call straight through with nothing in between.
    let tauriWindowApi: typeof import("@tauri-apps/api/window") | null = null;
    let tauriEventApi: typeof import("@tauri-apps/api/event") | null = null;

    onMount(() => {
        let stopHover: (() => void) | undefined;
        let stopAttach: (() => void) | undefined;
        void (async () => {
            try {
                tauriWindowApi = await import("@tauri-apps/api/window");
                tauriEventApi = await import("@tauri-apps/api/event");
                const { listen } = tauriEventApi;
                stopHover = await listen<{ hovering: boolean }>(WORKBOOK_DROP_HOVER_EVENT, (event) => {
                    dropHighlighted = event.payload.hovering;
                });
                stopAttach = await listen<{ tabs: WorkbookTab[] }>(WORKBOOK_ATTACH_TABS_EVENT, (event) => {
                    dropHighlighted = false;
                    onAttachTabs(event.payload.tabs);
                });
            } catch {
                // Outside Tauri (browser dev) — nothing to merge into.
            }
        })();
        return () => {
            stopHover?.();
            stopAttach?.();
        };
    });

    /** Moves this whole (single-tab) window by its tab, watching for another Workbook window to drop onto. */
    function startWindowDrag() {
        if (!tauriWindowApi || !tauriEventApi) return;
        const { getCurrentWindow, getAllWindows } = tauriWindowApi;
        const { emitTo } = tauriEventApi;
        const self = getCurrentWindow();
        let hoveredLabel: string | null = null;
        let lastPoll = 0;

        // Fired immediately, before anything else — see the comment above.
        const dragDone = self.startDragging();

        const movedReady = self.onMoved(() => {
            const now = Date.now();
            if (now - lastPoll < 80) return;
            lastPoll = now;
            void (async () => {
                try {
                    const [pos, size, all] = await Promise.all([self.outerPosition(), self.outerSize(), getAllWindows()]);
                    let found: string | null = null;
                    for (const win of all) {
                        if (win.label === self.label || !win.label.startsWith("workbook")) continue;
                        const [targetPos, targetSize] = await Promise.all([win.outerPosition(), win.outerSize()]);
                        const stripHeight = 48;
                        const overlapsX = pos.x + size.width > targetPos.x && pos.x < targetPos.x + targetSize.width;
                        const overlapsY = pos.y < targetPos.y + stripHeight && pos.y + stripHeight > targetPos.y;
                        if (overlapsX && overlapsY) {
                            found = win.label;
                            break;
                        }
                    }
                    if (found !== hoveredLabel) {
                        if (hoveredLabel) await emitTo(hoveredLabel, WORKBOOK_DROP_HOVER_EVENT, { hovering: false }).catch(() => {});
                        hoveredLabel = found;
                        if (found) await emitTo(found, WORKBOOK_DROP_HOVER_EVENT, { hovering: true }).catch(() => {});
                    }
                } catch {
                    // A window we were tracking may have just closed — ignore this tick.
                }
            })();
        });

        void (async () => {
            try {
                const stopMoved = await movedReady;
                await dragDone;
                stopMoved();
                if (hoveredLabel) {
                    await emitTo(hoveredLabel, WORKBOOK_ATTACH_TABS_EVENT, { tabs });
                    await self.close();
                }
            } catch {
                // The window went away mid-drag, or dragging never actually started.
            }
        })();
    }

    // ── Horizontal overflow: fade the strip toward the window controls ──
    let scrollEl = $state<HTMLElement | null>(null);
    let canScrollLeft = $state(false);
    let canScrollRight = $state(false);

    function updateScrollEdges() {
        const el = scrollEl;
        if (!el) return;
        canScrollLeft = el.scrollLeft > 1;
        canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    }

    function onStripScroll() {
        updateScrollEdges();
    }

    $effect(() => {
        const el = scrollEl;
        if (!el) return;
        updateScrollEdges();
        const onWheel = (e: WheelEvent) => {
            if (el.scrollWidth <= el.clientWidth) return;
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        let edgeFrame: number | null = null;
        const ro = new ResizeObserver(() => {
            if (edgeFrame !== null) return;
            edgeFrame = requestAnimationFrame(() => {
                edgeFrame = null;
                updateScrollEdges();
            });
        });
        ro.observe(el);
        return () => {
            el.removeEventListener("wheel", onWheel);
            ro.disconnect();
            if (edgeFrame !== null) cancelAnimationFrame(edgeFrame);
        };
    });

    $effect(() => {
        tabs.length;
        void tick().then(updateScrollEdges);
    });

    // A mask, not a painted overlay: the strip sits directly on the header's
    // own background, so a fade to transparent is always correct here — see
    // EditorTabs.svelte for the header/floating case this technique also serves.
    const edgeFade = $derived.by(() => {
        if (!canScrollLeft && !canScrollRight) return "";
        const stops = [
            canScrollLeft ? "transparent 0, #000 1.5rem" : "#000 0",
            canScrollRight ? "#000 calc(100% - 1.5rem), transparent 100%" : "#000 100%",
        ].join(", ");
        const gradient = `linear-gradient(to right, ${stops})`;
        return `-webkit-mask-image: ${gradient}; mask-image: ${gradient};`;
    });

    // ── Right-click context menu ──
    let contextMenuTabId = $state<string | null>(null);
    let contextMenuPos = $state<{ x: number; y: number } | null>(null);

    function openContextMenu(e: MouseEvent, tabId: string) {
        e.preventDefault();
        e.stopPropagation();
        contextMenuTabId = tabId;
        contextMenuPos = { x: e.clientX, y: e.clientY };
    }
    function closeContextMenu() {
        contextMenuTabId = null;
        contextMenuPos = null;
    }

    // ── Inline rename ──
    let renamingTabId = $state<string | null>(null);
    let renameValue = $state("");

    function startRename(tabId: string) {
        const tab = tabs.find((t) => t.id === tabId);
        closeContextMenu();
        if (!tab) return;
        renamingTabId = tabId;
        renameValue = tab.doc.title;
    }
    function commitRename() {
        const id = renamingTabId;
        renamingTabId = null;
        if (!id) return;
        const name = renameValue.trim();
        if (name) onRename(id, name);
    }
    function cancelRename() {
        renamingTabId = null;
    }
    function autofocusSelect(node: HTMLInputElement) {
        node.focus();
        node.select();
    }

    function closeThis(tabId: string) {
        closeContextMenu();
        onClose(tabId);
    }
    function popOutThis(tabId: string) {
        closeContextMenu();
        const tab = tabs.find((t) => t.id === tabId);
        if (tab) onPopOut(tab);
    }

    // ── Drag-to-reorder within this window (2+ tabs only — see the module doc) ──
    type DropSide = "before" | "after";
    let dragTabId = $state<string | null>(null);
    let dropTargetId = $state<string | null>(null);
    let dropSide = $state<DropSide>("after");
    let pointerDragging = $state(false);
    let _pointerDownTabId: string | null = null;
    let _pointerDownX = 0;
    let _pointerDownY = 0;
    let _dragJustCompleted = false;
    const DRAG_THRESHOLD = 5;

    function performReorder(draggedId: string, targetId: string, side: DropSide) {
        const from = tabs.findIndex((t) => t.id === draggedId);
        if (from < 0 || draggedId === targetId) return;
        const dragged = tabs[from];
        const remaining = tabs.filter((t) => t.id !== draggedId);
        let insertAt = remaining.findIndex((t) => t.id === targetId);
        if (insertAt < 0) return;
        if (side === "after") insertAt++;
        const result = [...remaining];
        result.splice(insertAt, 0, dragged);
        onReorder(result);
    }

    function handleTabPointerDown(e: PointerEvent, tabId: string) {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement | null)?.closest("[data-no-drag]")) return;
        if (tabs.length === 1) {
            startWindowDrag();
            return;
        }
        _pointerDownTabId = tabId;
        _pointerDownX = e.clientX;
        _pointerDownY = e.clientY;
    }

    function onWindowPointerMove(e: PointerEvent) {
        if (!_pointerDownTabId) return;
        if (!pointerDragging && Math.hypot(e.clientX - _pointerDownX, e.clientY - _pointerDownY) < DRAG_THRESHOLD) return;
        if (!pointerDragging) {
            pointerDragging = true;
            dragTabId = _pointerDownTabId;
        }
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const tabEl = els.find((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.tabId);
        if (tabEl && tabEl.dataset.tabId !== dragTabId) {
            const rect = tabEl.getBoundingClientRect();
            dropTargetId = tabEl.dataset.tabId!;
            dropSide = e.clientX < rect.left + rect.width / 2 ? "before" : "after";
        } else if (!tabEl) {
            const others = tabs.filter((t) => t.id !== dragTabId);
            const last = others[others.length - 1];
            if (last) {
                const lastEl = document.querySelector(`[data-tab-id="${CSS.escape(last.id)}"]`) as HTMLElement | null;
                if (lastEl && e.clientX > lastEl.getBoundingClientRect().right) {
                    dropTargetId = last.id;
                    dropSide = "after";
                }
            }
        }
    }

    function onWindowPointerUp() {
        if (pointerDragging && dragTabId && dropTargetId) {
            performReorder(dragTabId, dropTargetId, dropSide);
            _dragJustCompleted = true;
            setTimeout(() => (_dragJustCompleted = false), 50);
        }
        pointerDragging = false;
        dragTabId = null;
        dropTargetId = null;
        _pointerDownTabId = null;
    }

    function onWindowPointerDown(e: PointerEvent) {
        const target = e.target as HTMLElement;
        if (contextMenuTabId !== null && !target.closest("[data-context-menu]")) closeContextMenu();
    }
</script>

<svelte:window
    onpointerdown={onWindowPointerDown}
    onpointermove={onWindowPointerMove}
    onpointerup={onWindowPointerUp}
/>

<div
    class="tabs-strip relative flex min-w-0 max-w-full shrink-0 items-stretch overflow-hidden rounded-lg {dropHighlighted
        ? 'ring-2 ring-brand-gold-400 dark:ring-[#e5c890]'
        : ''}"
>
    <div
        bind:this={scrollEl}
        onscroll={onStripScroll}
        style={edgeFade}
        class="flex min-w-0 flex-row {pointerDragging ? 'cursor-grabbing' : ''}"
        role="tablist"
        aria-label={$t("workbook.tabs.strip")}
    >
        {#each tabs as tab (tab.id)}
            <div
                role="tab"
                tabindex="0"
                class="relative {dragTabId === tab.id ? 'opacity-40' : ''}"
                data-tab-id={tab.id}
                aria-selected={activeTabId === tab.id}
                onpointerdown={(e) => handleTabPointerDown(e, tab.id)}
                oncontextmenu={(e) => openContextMenu(e, tab.id)}
            >
                {#if dropTargetId === tab.id && dropSide === "before"}
                    <div aria-hidden="true" class="pointer-events-none absolute bottom-0 left-0 top-0 z-50 w-0.5 rounded-full bg-brand-gold-400"></div>
                {:else if dropTargetId === tab.id && dropSide === "after"}
                    <div aria-hidden="true" class="pointer-events-none absolute bottom-0 right-0 top-0 z-50 w-0.5 rounded-full bg-brand-gold-400"></div>
                {/if}
                <button
                    onclick={() => {
                        if (_dragJustCompleted) return;
                        onSelect(tab.id);
                    }}
                    class="group flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-1.5 text-[0.75rem] transition-colors {activeTabId ===
                    tab.id
                        ? 'bg-brand-gold-200/50 text-brand-charcoal-800 dark:bg-[#414559] dark:text-[#e5c890]'
                        : 'text-brand-charcoal-400 hover:bg-white/60 dark:text-[#838ba7] dark:hover:bg-[#303446]/60'}"
                >
                    <Icon icon="solar:widget-5-bold-duotone" width="0.75rem" class="shrink-0 opacity-60" />
                    {#if renamingTabId === tab.id}
                        <input
                            bind:value={renameValue}
                            data-no-drag
                            use:autofocusSelect
                            onpointerdown={(e) => e.stopPropagation()}
                            onclick={(e) => e.stopPropagation()}
                            onblur={commitRename}
                            onkeydown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitRename();
                                } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelRename();
                                }
                            }}
                            class="w-28 min-w-0 border-b border-brand-gold-400 bg-transparent text-[0.75rem] text-brand-charcoal-800 outline-none dark:text-[#e5c890]"
                        />
                    {:else}
                        <span class="max-w-32 truncate">{tab.doc.title || $t("workbook.title")}</span>
                    {/if}
                    <span
                        role="button"
                        data-no-drag
                        tabindex="-1"
                        onclick={(e) => {
                            e.stopPropagation();
                            onClose(tab.id);
                        }}
                        onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                                onClose(tab.id);
                            }
                        }}
                        class="ml-0.5 leading-none opacity-0 transition-opacity hover:opacity-100! group-hover:opacity-40"
                        title={$t("workbook.tabs.close")}
                    >
                        <Icon icon="solar:close-circle-bold" width="0.875rem" />
                    </span>
                </button>
            </div>
        {/each}
    </div>

    <button
        onclick={onNewTab}
        title={$t("workbook.tabs.new")}
        aria-label={$t("workbook.tabs.new")}
        class="flex w-7 shrink-0 cursor-pointer items-center justify-center text-brand-charcoal-300 transition-colors hover:bg-white/60 hover:text-brand-charcoal-500 dark:text-[#626880] dark:hover:bg-[#303446]/60 dark:hover:text-[#c6d0f5]"
    >
        <Icon icon="solar:add-circle-bold-duotone" width="0.9rem" />
    </button>
</div>

{#if contextMenuTabId !== null && contextMenuPos !== null}
    <div
        data-context-menu
        style="position: fixed; left: {contextMenuPos.x}px; top: {contextMenuPos.y}px; transform: translateY(4px); z-index: 9999;"
        class="min-w-40 rounded-2xl border border-brand-sand-200 bg-brand-sand-50 p-1.5 shadow-xl dark:border-[#414559] dark:bg-[#292c3c]"
    >
        <button
            onclick={() => startRename(contextMenuTabId!)}
            class="flex w-full cursor-pointer items-center gap-2 rounded-full p-1 px-3 text-xs text-brand-charcoal-500 hover:bg-brand-sand-200 hover:text-brand-charcoal-900 dark:text-[#8087a2] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:pen-bold-duotone" width="0.85rem" class="shrink-0" />
            {$t("workbook.tabs.rename")}
        </button>
        <button
            onclick={() => popOutThis(contextMenuTabId!)}
            class="flex w-full cursor-pointer items-center gap-2 rounded-full p-1 px-3 text-xs text-brand-charcoal-500 hover:bg-brand-sand-200 hover:text-brand-charcoal-900 dark:text-[#8087a2] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:multiple-forward-right-bold-duotone" width="0.85rem" class="shrink-0" />
            {$t("workbook.tabs.open_separate")}
        </button>
        <button
            onclick={() => closeThis(contextMenuTabId!)}
            class="flex w-full cursor-pointer items-center gap-2 rounded-full p-1 px-3 text-xs text-brand-charcoal-500 hover:bg-brand-sand-200 hover:text-brand-charcoal-900 dark:text-[#8087a2] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:close-square-bold-duotone" width="0.85rem" class="shrink-0" />
            {$t("workbook.tabs.close")}
        </button>
    </div>
{/if}

<style>
    [data-tab-id] {
        cursor: grab;
    }
    .tabs-strip {
        transition: box-shadow 0.15s ease;
    }
</style>
