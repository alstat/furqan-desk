<script lang="ts">
    import {
        tabs,
        activeTabId,
        activeTab,
        closeTab,
    } from "$lib/stores/tabs.store";
    import type { EditorTab } from "$lib/stores/tabs.store";
    import { hideSurahPage } from "$lib/stores/quran.svelte";
    import {
        juliaGroups,
        createJuliaGroup,
        removeJuliaGroup,
        removeJuliaGroupByTab,
        flashingTabId,
        crossGroups,
        createCrossGroup,
        removeCrossGroup,
        removeCrossGroupByTab,
    } from "$lib/stores/julia-terminal.store";
    import type { JuliaGroup, CrossGroup } from "$lib/stores/julia-terminal.store";
    import Icon from "@iconify/svelte";
    import { confirm } from "@tauri-apps/plugin-dialog";
    import { zenMode } from "$lib/stores/editor.store";

    const GROUP_COLORS = [
        {
            border: "border-b-amber-400",
            text: "text-amber-500",
            bg: "bg-amber-50/60 dark:bg-amber-900/20",
        },
        {
            border: "border-b-teal-400",
            text: "text-teal-500",
            bg: "bg-teal-50/60 dark:bg-teal-900/20",
        },
        {
            border: "border-b-rose-400",
            text: "text-rose-500",
            bg: "bg-rose-50/60 dark:bg-rose-900/20",
        },
        {
            border: "border-b-violet-400",
            text: "text-violet-500",
            bg: "bg-violet-50/60 dark:bg-violet-900/20",
        },
        {
            border: "border-b-sky-400",
            text: "text-sky-500",
            bg: "bg-sky-50/60 dark:bg-sky-900/20",
        },
        {
            border: "border-b-emerald-400",
            text: "text-emerald-500",
            bg: "bg-emerald-50/60 dark:bg-emerald-900/20",
        },
        {
            border: "border-b-orange-400",
            text: "text-orange-500",
            bg: "bg-orange-50/60 dark:bg-orange-900/20",
        },
        {
            border: "border-b-pink-400",
            text: "text-pink-500",
            bg: "bg-pink-50/60 dark:bg-pink-900/20",
        },
        {
            border: "border-b-indigo-400",
            text: "text-indigo-500",
            bg: "bg-indigo-50/60 dark:bg-indigo-900/20",
        },
        {
            border: "border-b-lime-400",
            text: "text-lime-500",
            bg: "bg-lime-50/60 dark:bg-lime-900/20",
        },
        {
            border: "border-b-cyan-400",
            text: "text-cyan-500",
            bg: "bg-cyan-50/60 dark:bg-cyan-900/20",
        },
        {
            border: "border-b-fuchsia-400",
            text: "text-fuchsia-500",
            bg: "bg-fuchsia-50/60 dark:bg-fuchsia-900/20",
        },
    ];

    let pickerForTabId = $state<string | null>(null);
    let pickerPos = $state<{ x: number; y: number } | null>(null);

    async function tryClose(id: string) {
        const tab = $tabs.find((t) => t.id === id);
        if (tab?.isDirty) {
            const ok = await confirm(
                `"${tab.name}" has unsaved changes. Close anyway?`,
                { title: "Unsaved Changes", kind: "warning" },
            );
            if (!ok) return;
        }
        removeJuliaGroupByTab(id);
        removeCrossGroupByTab(id);
        closeTab(id);
    }

    function ensureAdjacent(tabAId: string, tabBId: string) {
        tabs.update((ts) => {
            const idxA = ts.findIndex((t) => t.id === tabAId);
            const idxB = ts.findIndex((t) => t.id === tabBId);
            if (idxA < 0 || idxB < 0 || idxB === idxA + 1) return ts;
            const result = ts.filter((t) => t.id !== tabBId);
            const newIdxA = result.findIndex((t) => t.id === tabAId);
            result.splice(newIdxA + 1, 0, ts[idxB]);
            return result;
        });
    }

    function handleSplitClick(tabId: string, e: MouseEvent) {
        const hostType = $tabs.find(t => t.id === tabId)?.type;
        const allGroupedIds = new Set([
            ...$juliaGroups.flatMap((g) => [g.tabA, g.tabB]),
            ...$crossGroups.flatMap((g) => [g.hostTabId, g.partnerTabId]),
        ]);
        const available = $tabs.filter(
            (t) =>
                (t.type === "julia" || t.type === "typst" || t.type === "lexical") &&
                t.id !== tabId &&
                !allGroupedIds.has(t.id) &&
                // Avoid same-type conflicts for Typst/Lexical (shared global store state)
                !(hostType === "typst" && t.type === "typst") &&
                !(hostType === "lexical" && t.type === "lexical"),
        );
        if (available.length === 0) return;
        if (available.length === 1) {
            const p = available[0];
            // Julia+Julia → existing stacked behaviour; anything else → cross pair
            if (hostType === "julia" && p.type === "julia") {
                createJuliaGroup(tabId, p.id);
            } else {
                createCrossGroup(tabId, p.id);
            }
            ensureAdjacent(tabId, p.id);
            pickerForTabId = null;
            pickerPos = null;
        } else {
            if (pickerForTabId === tabId) {
                pickerForTabId = null;
                pickerPos = null;
            } else {
                const anchor = (e.currentTarget as HTMLElement).closest(
                    "[data-picker-anchor]",
                );
                const rect = anchor?.getBoundingClientRect();
                pickerForTabId = tabId;
                pickerPos = rect ? { x: rect.left, y: rect.top } : null;
            }
        }
    }

    // Any editor type can show the split icon when the Parchment is hidden
    let canShowSplit = $derived($hideSurahPage());

    function onWindowPointerDown(e: PointerEvent) {
        if (pickerForTabId === null) return;
        const target = e.target as HTMLElement;
        if (
            !target.closest("[data-picker-anchor]") &&
            !target.closest("[data-picker-dropdown]")
        ) {
            pickerForTabId = null;
            pickerPos = null;
        }
    }

    // ── Drag-to-reorder (pointer events — HTML5 DnD drop doesn't fire in WKWebView) ──

    type DropSide = "before" | "after";
    interface EffectiveDropInfo { targetId: string; side: DropSide; }

    let dragTabId    = $state<string | null>(null);
    let dropTargetId = $state<string | null>(null);
    let dropSide     = $state<DropSide>("after");

    let pointerDragging    = $state(false);
    let _pointerDownTabId: string | null = null;
    let _pointerDownX      = 0;
    let _pointerDownY      = 0;
    let _dragJustCompleted = false;
    const DRAG_THRESHOLD   = 5; // px before drag activates

    function getGroupOf(tabId: string): JuliaGroup | null {
        return $juliaGroups.find((g: JuliaGroup) => g.tabA === tabId || g.tabB === tabId) ?? null;
    }

    function getCrossGroupOf(tabId: string): CrossGroup | null {
        return $crossGroups.find(
            (g: CrossGroup) => g.hostTabId === tabId || g.partnerTabId === tabId,
        ) ?? null;
    }

    function getDraggedIds(draggedTabId: string): string[] {
        const jGroup = getGroupOf(draggedTabId);
        if (jGroup) {
            const aIdx = $tabs.findIndex((t: EditorTab) => t.id === jGroup.tabA);
            const bIdx = $tabs.findIndex((t: EditorTab) => t.id === jGroup.tabB);
            return aIdx <= bIdx ? [jGroup.tabA, jGroup.tabB] : [jGroup.tabB, jGroup.tabA];
        }
        const cGroup = getCrossGroupOf(draggedTabId);
        if (cGroup) {
            const jIdx = $tabs.findIndex((t: EditorTab) => t.id === cGroup.juliaTabId);
            const pIdx = $tabs.findIndex((t: EditorTab) => t.id === cGroup.partnerTabId);
            return jIdx <= pIdx
                ? [cGroup.juliaTabId, cGroup.partnerTabId]
                : [cGroup.partnerTabId, cGroup.juliaTabId];
        }
        return [draggedTabId];
    }

    function isBeingDragged(tabId: string): boolean {
        if (!dragTabId) return false;
        return getDraggedIds(dragTabId).includes(tabId);
    }

    /** Returns the effective drop position, snapping so we never land BETWEEN a linked pair. */
    function getEffectiveDropInfo(targetId: string, rawSide: DropSide): EffectiveDropInfo {
        const idx = $tabs.findIndex((t: EditorTab) => t.id === targetId);
        if (rawSide === "after") {
            const next: EditorTab | undefined = $tabs[idx + 1];
            if (next && (
                $juliaGroups.find((g: JuliaGroup) =>
                    (g.tabA === targetId && g.tabB === next.id) ||
                    (g.tabB === targetId && g.tabA === next.id)
                ) ||
                $crossGroups.find((g: CrossGroup) =>
                    (g.hostTabId === targetId && g.partnerTabId === next.id) ||
                    (g.partnerTabId === targetId && g.hostTabId === next.id)
                )
            )) return { targetId: next.id, side: "after" };
        } else {
            const prev: EditorTab | undefined = idx > 0 ? $tabs[idx - 1] : undefined;
            if (prev && (
                $juliaGroups.find((g: JuliaGroup) =>
                    (g.tabA === prev.id && g.tabB === targetId) ||
                    (g.tabB === prev.id && g.tabA === targetId)
                ) ||
                $crossGroups.find((g: CrossGroup) =>
                    (g.hostTabId === prev.id && g.partnerTabId === targetId) ||
                    (g.partnerTabId === prev.id && g.hostTabId === targetId)
                )
            )) return { targetId: prev.id, side: "before" };
        }
        return { targetId, side: rawSide };
    }

    function performReorder(draggedTabId: string, targetTabId: string, side: DropSide): void {
        const groups: JuliaGroup[] = $juliaGroups;
        const cGroups: CrossGroup[] = $crossGroups;
        tabs.update((ts: EditorTab[]) => {
            const jGroup = groups.find(
                (g: JuliaGroup) => g.tabA === draggedTabId || g.tabB === draggedTabId,
            );
            const cGroup = cGroups.find(
                (g: CrossGroup) => g.hostTabId === draggedTabId || g.partnerTabId === draggedTabId,
            );
            const idsToMove: string[] = jGroup
                ? (ts.findIndex(t => t.id === jGroup.tabA) <= ts.findIndex(t => t.id === jGroup.tabB)
                    ? [jGroup.tabA, jGroup.tabB]
                    : [jGroup.tabB, jGroup.tabA])
                : cGroup
                    ? (ts.findIndex(t => t.id === cGroup.juliaTabId) <= ts.findIndex(t => t.id === cGroup.partnerTabId)
                        ? [cGroup.juliaTabId, cGroup.partnerTabId]
                        : [cGroup.partnerTabId, cGroup.juliaTabId])
                    : [draggedTabId];
            if (idsToMove.includes(targetTabId)) return ts;
            const tabsToMove: EditorTab[] = idsToMove
                .map(id => ts.find(t => t.id === id))
                .filter((t): t is EditorTab => t !== undefined);
            const remaining: EditorTab[] = ts.filter(t => !idsToMove.includes(t.id));
            let   insertAt = remaining.findIndex(t => t.id === targetTabId);
            if (insertAt < 0) return ts;
            if (side === "after") insertAt++;
            const result = [...remaining];
            result.splice(insertAt, 0, ...tabsToMove);
            return result;
        });
    }

    function handleTabPointerDown(e: PointerEvent, tabId: string): void {
        // Only skip the dedicated action buttons (close, split, unlink)
        if ((e.target as HTMLElement | null)?.closest('[data-no-drag]')) return;
        _pointerDownTabId = tabId;
        _pointerDownX     = e.clientX;
        _pointerDownY     = e.clientY;
    }

    function onWindowPointerMove(e: PointerEvent): void {
        if (!_pointerDownTabId) return;
        if (
            !pointerDragging &&
            Math.hypot(e.clientX - _pointerDownX, e.clientY - _pointerDownY) < DRAG_THRESHOLD
        ) return;

        if (!pointerDragging) {
            pointerDragging = true;
            dragTabId = _pointerDownTabId;
        }

        // Hit-test: walk elements from point to find the outer tab div (data-tab-id)
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const tabEl = els.find(
            (el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.tabId,
        );

        if (tabEl && !isBeingDragged(tabEl.dataset.tabId!)) {
            const tid  = tabEl.dataset.tabId!;
            const rect = tabEl.getBoundingClientRect();
            const raw: DropSide = e.clientX < rect.left + rect.width / 2 ? "before" : "after";
            const eff  = getEffectiveDropInfo(tid, raw);
            dropTargetId = eff.targetId;
            dropSide     = eff.side;
        } else if (!tabEl) {
            // Pointer is past all tabs — append to end
            const nonDragged = $tabs.filter((t) => !isBeingDragged(t.id));
            if (nonDragged.length > 0) {
                const last   = nonDragged[nonDragged.length - 1];
                const lastEl = document.querySelector(
                    `[data-tab-id="${CSS.escape(last.id)}"]`,
                ) as HTMLElement | null;
                if (lastEl && e.clientX > lastEl.getBoundingClientRect().right) {
                    dropTargetId = last.id;
                    dropSide     = "after";
                }
            }
        }
    }

    function onWindowPointerUp(_e: PointerEvent): void {
        if (pointerDragging && dragTabId && dropTargetId) {
            performReorder(dragTabId, dropTargetId, dropSide);
            _dragJustCompleted = true;
            setTimeout(() => { _dragJustCompleted = false; }, 50);
        }
        pointerDragging   = false;
        dragTabId         = null;
        dropTargetId      = null;
        _pointerDownTabId = null;
    }
</script>

<svelte:window
    onpointerdown={onWindowPointerDown}
    onpointermove={onWindowPointerMove}
    onpointerup={onWindowPointerUp}
/>

<div
    class="{$zenMode ? 'opacity-0 hover:opacity-100 transition-opacity duration-200' : ''} tabs-scroll select-none flex flex-row absolute -bottom-8 left-1/2 -translate-x-1/2 max-w-[min(28rem,80%)] rounded-full border border-stone-200 dark:border-[#414559] bg-brand-sand-50 shrink-0 min-h-8 z-30 {pointerDragging ? 'cursor-grabbing' : ''}"
    role="tablist"
    aria-label="Editor tabs"
>
    {#each $tabs as tab, i (tab.id)}
        {@const nextTab = $tabs[i + 1]}
        {@const juliaGroup = $juliaGroups.find(
            (g) => g.tabA === tab.id || g.tabB === tab.id,
        ) ?? null}
        {@const crossGroupForTab = $crossGroups.find(
            (g) => g.hostTabId === tab.id || g.partnerTabId === tab.id,
        ) ?? null}
        {@const group = juliaGroup ?? crossGroupForTab}
        {@const color = group
            ? GROUP_COLORS[group.colorIdx % GROUP_COLORS.length]
            : null}
        {@const allGroupedIds = new Set([
            ...$juliaGroups.flatMap((g) => [g.tabA, g.tabB]),
            ...$crossGroups.flatMap((g) => [g.hostTabId, g.partnerTabId]),
        ])}
        {@const isUngroupedSplittable =
            (tab.type === "julia" || tab.type === "typst" || tab.type === "lexical") &&
            !juliaGroup && !crossGroupForTab}
        {@const availablePartners = $tabs.filter(
            (t) =>
                (t.type === "julia" || t.type === "typst" || t.type === "lexical") &&
                t.id !== tab.id &&
                !allGroupedIds.has(t.id) &&
                !(tab.type === "typst" && t.type === "typst") &&
                !(tab.type === "lexical" && t.type === "lexical"),
        )}
        {@const adjacentJuliaGroup = nextTab
            ? ($juliaGroups.find(
                  (g) =>
                      (g.tabA === tab.id && g.tabB === nextTab.id) ||
                      (g.tabB === tab.id && g.tabA === nextTab.id),
              ) ?? null)
            : null}
        {@const adjacentCrossGroup = nextTab
            ? ($crossGroups.find(
                  (g) =>
                      (g.hostTabId === tab.id && g.partnerTabId === nextTab.id) ||
                      (g.partnerTabId === tab.id && g.hostTabId === nextTab.id),
              ) ?? null)
            : null}
        {@const adjacentGroup = adjacentJuliaGroup ?? adjacentCrossGroup}

        <div
            role="tab"
            tabindex="0"
            class="relative {isBeingDragged(tab.id) ? 'opacity-40' : ''}"
            data-tab-id={tab.id}
            data-picker-anchor
            aria-grabbed={isBeingDragged(tab.id)}
            aria-roledescription="draggable tab"
            aria-label="{tab.name} tab, draggable"
            onpointerdown={(e) => handleTabPointerDown(e, tab.id)}
        >
            {#if dropTargetId === tab.id && dropSide === "before"}
                <div aria-hidden="true" class="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-400 z-50 pointer-events-none rounded-full"></div>
            {:else if dropTargetId === tab.id && dropSide === "after"}
                <div aria-hidden="true" class="absolute right-0 top-0 bottom-0 w-0.5 bg-amber-400 z-50 pointer-events-none rounded-full"></div>
            {/if}
            <button
                onclick={() => {
                    if (_dragJustCompleted) return;
                    activeTabId.set(tab.id);
                    if (group) {
                        flashingTabId.set(tab.id);
                        setTimeout(() => flashingTabId.set(null), 1500);
                    }
                }}
                class="group cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[11px] whitespace-nowrap
                       border-r border-stone-200 dark:border-[#414559] transition-colors
                       {group
                    ? `border-b-2 ${color?.border} ${color?.bg} pr-6`
                    : ''}
                       {$activeTabId === tab.id
                    ? 'bg-white dark:bg-[#414559] text-brand-charcoal-800 dark:text-[#e5c890] font-medium'
                    : 'text-brand-charcoal-400 hover:bg-white/70 dark:hover:bg-[#303446]/70'}"
            >
                <!-- Always show file-type icon for all tabs -->
                <Icon
                    icon={tab.type === "typst"
                        ? "solar:document-text-bold-duotone"
                        : tab.type === "lexical"
                          ? "solar:text-bold-duotone"
                          : tab.type === "julia"
                            ? "solar:code-bold-duotone"
                            : "solar:file-bold-duotone"}
                    width="0.75rem"
                    class="shrink-0 opacity-60"
                />

                <span class={tab.isPreview ? "italic" : ""}
                    >{tab.name}{tab.isDirty ? " *" : ""}</span
                >

                <!-- Split button: shown on any ungrouped editor tab when partners are available -->
                {#if isUngroupedSplittable && canShowSplit && availablePartners.length > 0}
                    <span
                        role="button"
                        data-no-drag
                        tabindex="-1"
                        onclick={(e) => {
                            e.stopPropagation();
                            handleSplitClick(tab.id, e);
                        }}
                        onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSplitClick(
                                    tab.id,
                                    e as unknown as MouseEvent,
                                );
                            }
                        }}
                        class="opacity-0 group-hover:opacity-50 hover:opacity-100! transition-opacity leading-none"
                        title="Split view"
                        ><Icon
                            icon="solar:copy-bold-duotone"
                            width="0.85rem"
                        /></span
                    >
                {/if}

                <span
                    role="button"
                    data-no-drag
                    tabindex="-1"
                    onclick={(e) => {
                        e.stopPropagation();
                        tryClose(tab.id);
                    }}
                    onkeydown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            tryClose(tab.id);
                        }
                    }}
                    class="opacity-0 group-hover:opacity-40 hover:opacity-100! transition-opacity ml-0.5 leading-none"
                    title="Close"
                    ><Icon icon="solar:close-circle-bold" width="1rem" /></span
                >
            </button>
            {#if adjacentGroup}
                {@const adjColor =
                    GROUP_COLORS[adjacentGroup.colorIdx % GROUP_COLORS.length]}
                <button
                    data-no-drag
                    onclick={() => {
                        if (adjacentJuliaGroup) removeJuliaGroup(adjacentJuliaGroup.id);
                        else if (adjacentCrossGroup) removeCrossGroup(adjacentCrossGroup.id);
                    }}
                    class="group/link absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 cursor-pointer px-1"
                    title="Unlink"
                >
                    <span
                        class="w-4 h-4 rounded-full flex items-center justify-center
                                 bg-white dark:bg-[#292c3c]
                                 border border-stone-200 dark:border-[#414559] shadow-sm"
                    >
                        <Icon
                            icon="solar:link-bold-duotone"
                            class="group-hover/link:hidden {adjColor.text}"
                            width="0.6rem"
                        />
                        <Icon
                            icon="solar:unlink-bold"
                            class="hidden group-hover/link:block text-rose-400"
                            width="0.6rem"
                        />
                    </span>
                </button>
            {/if}
        </div>
    {/each}
</div>

<div aria-live="polite" aria-atomic="true" class="sr-only">
    {dragTabId ? "Dragging tab — release to drop" : ""}
</div>

<!-- Partner picker — rendered outside scroll container via fixed positioning -->
{#if pickerForTabId !== null && pickerPos !== null}
    {@const pickerTab = $tabs.find((t) => t.id === pickerForTabId)}
    {@const pickerAllGroupedIds = new Set([
        ...$juliaGroups.flatMap((g) => [g.tabA, g.tabB]),
        ...$crossGroups.flatMap((g) => [g.hostTabId, g.partnerTabId]),
    ])}
    {@const pickerHostType = pickerTab?.type}
    {@const pickerPartners = $tabs.filter(
        (t) =>
            (t.type === "julia" || t.type === "typst" || t.type === "lexical") &&
            t.id !== pickerForTabId &&
            !pickerAllGroupedIds.has(t.id) &&
            !(pickerHostType === "typst" && t.type === "typst") &&
            !(pickerHostType === "lexical" && t.type === "lexical"),
    )}
    {#if pickerTab && pickerPartners.length > 1}
        <div
            data-picker-dropdown
            style="position: fixed; left: {pickerPos.x}px; top: {pickerPos.y}px; transform: translateY(calc(-100% - 4px)); z-index: 9999;"
            class="bg-brand-sand-50 dark:bg-[#292c3c] border border-brand-sand-200 dark:border-[#414559] rounded-3xl shadow-xl p-3 min-w-40"
        >
            {#each pickerPartners as partner}
                <button
                    onclick={() => {
                        const hostType = $tabs.find(t => t.id === pickerForTabId)?.type;
                        if (hostType === "julia" && partner.type === "julia") {
                            createJuliaGroup(pickerForTabId!, partner.id);
                        } else {
                            createCrossGroup(pickerForTabId!, partner.id);
                        }
                        ensureAdjacent(pickerForTabId!, partner.id);
                        pickerForTabId = null;
                        pickerPos = null;
                    }}
                    class="cursor-pointer w-full flex items-center gap-2 p-1 m-1 text-xs rounded-full px-3 text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5] active:bg-brand-sand-400"
                >
                    <Icon
                        icon={partner.type === "typst"
                            ? "solar:document-text-bold-duotone"
                            : partner.type === "lexical"
                              ? "solar:text-bold-duotone"
                              : "solar:code-bold-duotone"}
                        width="0.75rem"
                        class="shrink-0"
                    />
                    {partner.name}
                </button>
            {/each}
        </div>
    {/if}
{/if}

<style>
    /* Grab cursor on draggable tab wrappers */
    [data-tab-id] {
        cursor: grab;
    }

    /* Overlay scrollbar: floats over content, doesn't affect layout height */
    .tabs-scroll {
        overflow-x: overlay;
    }

    .tabs-scroll::-webkit-scrollbar {
        height: 3px;
    }

    .tabs-scroll::-webkit-scrollbar-track {
        background: transparent;
    }

    .tabs-scroll::-webkit-scrollbar-thumb {
        background: transparent;
        border-radius: 9999px;
        transition: background 0.3s ease;
    }

    .tabs-scroll:hover::-webkit-scrollbar-thumb {
        background: rgba(120, 120, 120, 0.35);
    }

    .tabs-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(120, 120, 120, 0.6);
    }
</style>
