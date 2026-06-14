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
        addThirdToJuliaGroup,
        detachThirdFromJuliaGroup,
        typstGroups,
        createTypstGroup,
        removeTypstGroup,
        removeTypstGroupByTab,
        addThirdToTypstGroup,
        detachThirdFromTypstGroup,
        flashingTabId,
        crossGroups,
        createCrossGroup,
        removeCrossGroup,
        removeCrossGroupByTab,
    } from "$lib/stores/julia-terminal.store";
    import type { JuliaGroup, TypstGroup, CrossGroup } from "$lib/stores/julia-terminal.store";

    // Julia and Typst groups stack identically in the tab strip — only creation
    // and the fourth pane (REPL vs preview) differ. Treat them uniformly here.
    type StackKind = "julia" | "typst";
    type StackGroup = (JuliaGroup | TypstGroup) & { kind: StackKind };

    function stackMembers(g: { tabA: string; tabB: string; tabC?: string }): string[] {
        return g.tabC ? [g.tabA, g.tabB, g.tabC] : [g.tabA, g.tabB];
    }

    let stackGroups = $derived<StackGroup[]>([
        ...$juliaGroups.map((g) => ({ ...g, kind: "julia" as const })),
        ...$typstGroups.map((g) => ({ ...g, kind: "typst" as const })),
    ]);

    function removeStackGroup(g: StackGroup): void {
        if (g.kind === "julia") removeJuliaGroup(g.id);
        else removeTypstGroup(g.id);
    }
    function detachThirdStack(g: StackGroup): void {
        if (g.kind === "julia") detachThirdFromJuliaGroup(g.id);
        else detachThirdFromTypstGroup(g.id);
    }
    function addThirdStack(g: StackGroup, tabCId: string): void {
        if (g.kind === "julia") addThirdToJuliaGroup(g.id, tabCId);
        else addThirdToTypstGroup(g.id, tabCId);
    }
    import Icon from "@iconify/svelte";
    import { confirm } from "@tauri-apps/plugin-dialog";
    import { singlePageMargin, zenMode, zenPeek, zenTabsOpacity } from "$lib/stores/editor.store";

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

    // "Add third file" affordance (the + on a two-file Julia/Typst group).
    let addThirdForGroupId = $state<string | null>(null);
    let addThirdPos = $state<{ x: number; y: number } | null>(null);

    /** Ungrouped files of the group's own type that can join it as a third. */
    function availableThirdFiles(group: StackGroup): EditorTab[] {
        const grouped = new Set([
            ...stackGroups.flatMap((g) => stackMembers(g)),
            ...$crossGroups.flatMap((g) => [g.hostTabId, g.partnerTabId]),
        ]);
        return $tabs.filter(
            (t) => t.type === group.kind && !grouped.has(t.id),
        );
    }

    /** Move tabC directly after the group's last primary member in the strip. */
    function ensureThirdAdjacent(tabCId: string, tabAId: string, tabBId: string) {
        tabs.update((ts) => {
            const idxA = ts.findIndex((t) => t.id === tabAId);
            const idxB = ts.findIndex((t) => t.id === tabBId);
            const trailing = idxA >= idxB ? tabAId : tabBId;
            const result = ts.filter((t) => t.id !== tabCId);
            const moved = ts.find((t) => t.id === tabCId);
            if (!moved) return ts;
            const insertAt = result.findIndex((t) => t.id === trailing) + 1;
            result.splice(insertAt, 0, moved);
            return result;
        });
    }

    function attachThird(group: StackGroup, tabCId: string) {
        addThirdStack(group, tabCId);
        ensureThirdAdjacent(tabCId, group.tabA, group.tabB);
        addThirdForGroupId = null;
        addThirdPos = null;
    }

    function handleAddThirdClick(group: StackGroup, e: MouseEvent) {
        const candidates = availableThirdFiles(group);
        if (candidates.length === 0) return;
        if (candidates.length === 1) {
            attachThird(group, candidates[0].id);
            return;
        }
        if (addThirdForGroupId === group.id) {
            addThirdForGroupId = null;
            addThirdPos = null;
        } else {
            const anchor = (e.currentTarget as HTMLElement).closest(
                "[data-tab-id]",
            );
            const rect = anchor?.getBoundingClientRect();
            addThirdForGroupId = group.id;
            addThirdPos = rect ? { x: rect.right, y: rect.top } : null;
        }
    }

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
        removeTypstGroupByTab(id);
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
            ...stackGroups.flatMap((g) => stackMembers(g)),
            ...$crossGroups.flatMap((g) => [g.hostTabId, g.partnerTabId]),
        ]);
        const available = $tabs.filter(
            (t) =>
                (t.type === "julia" || t.type === "typst" || t.type === "lexical") &&
                t.id !== tabId &&
                !allGroupedIds.has(t.id) &&
                // Lexical still shares global editor state, so no Lexical+Lexical.
                !(hostType === "lexical" && t.type === "lexical"),
        );
        if (available.length === 0) return;
        if (available.length === 1) {
            const p = available[0];
            // Julia+Julia and Typst+Typst → stacked group; anything else → cross pair
            if (hostType === "julia" && p.type === "julia") {
                createJuliaGroup(tabId, p.id);
            } else if (hostType === "typst" && p.type === "typst") {
                createTypstGroup(tabId, p.id);
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
    let windowWidth = $state(0);

    $effect(() => {
      if ($hideSurahPage() && $crossGroups.length > 0 ) {
        if (windowWidth < 1800) {
          singlePageMargin.set(12);
        } else if (windowWidth >= 1800 && windowWidth < 2000) {
          singlePageMargin.set(10);
        } else {
          singlePageMargin.set(8);
        }
      }
    })

    function onWindowPointerDown(e: PointerEvent) {
        const target = e.target as HTMLElement;
        if (
            pickerForTabId !== null &&
            !target.closest("[data-picker-anchor]") &&
            !target.closest("[data-picker-dropdown]")
        ) {
            pickerForTabId = null;
            pickerPos = null;
        }
        if (
            addThirdForGroupId !== null &&
            !target.closest("[data-add-third-anchor]") &&
            !target.closest("[data-add-third-dropdown]")
        ) {
            addThirdForGroupId = null;
            addThirdPos = null;
        }
        if (
            contextMenuTabId !== null &&
            !target.closest("[data-context-menu]")
        ) {
            closeContextMenu();
        }
    }

    // ── Right-click context menu (Close Others / Left / Right) ──
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

    /** Close the given tabs sequentially so each unsaved-changes prompt resolves before the next. */
    async function closeMany(ids: string[]) {
        for (const id of ids) {
            await tryClose(id);
        }
    }

    function closeThis(tabId: string) {
        closeContextMenu();
        tryClose(tabId);
    }

    function closeOthers(tabId: string) {
        const ids = $tabs.filter((t) => t.id !== tabId).map((t) => t.id);
        closeContextMenu();
        closeMany(ids);
    }

    function closeLeft(tabId: string) {
        const idx = $tabs.findIndex((t) => t.id === tabId);
        if (idx < 0) return;
        const ids = $tabs.slice(0, idx).map((t) => t.id);
        closeContextMenu();
        closeMany(ids);
    }

    function closeRight(tabId: string) {
        const idx = $tabs.findIndex((t) => t.id === tabId);
        if (idx < 0) return;
        const ids = $tabs.slice(idx + 1).map((t) => t.id);
        closeContextMenu();
        closeMany(ids);
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

    function getGroupOf(tabId: string): StackGroup | null {
        return stackGroups.find((g) => stackMembers(g).includes(tabId)) ?? null;
    }

    /** Group members ordered by their current position in the tab strip. */
    function orderedGroupIds(g: StackGroup): string[] {
        return stackMembers(g)
            .map((id) => ({ id, idx: $tabs.findIndex((t) => t.id === id) }))
            .sort((a, b) => a.idx - b.idx)
            .map((m) => m.id);
    }

    function getCrossGroupOf(tabId: string): CrossGroup | null {
        return $crossGroups.find(
            (g: CrossGroup) => g.hostTabId === tabId || g.partnerTabId === tabId,
        ) ?? null;
    }

    function getDraggedIds(draggedTabId: string): string[] {
        const jGroup = getGroupOf(draggedTabId);
        if (jGroup) {
            return orderedGroupIds(jGroup);
        }
        const cGroup = getCrossGroupOf(draggedTabId);
        if (cGroup) {
            const jIdx = $tabs.findIndex((t: EditorTab) => t.id === cGroup.hostTabId);
            const pIdx = $tabs.findIndex((t: EditorTab) => t.id === cGroup.partnerTabId);
            return jIdx <= pIdx
                ? [cGroup.hostTabId, cGroup.partnerTabId]
                : [cGroup.partnerTabId, cGroup.hostTabId];
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
        const sameStack = (a: string, b: string) =>
            stackGroups.some((g) => {
                const m = stackMembers(g);
                return m.includes(a) && m.includes(b);
            });
        if (rawSide === "after") {
            const next: EditorTab | undefined = $tabs[idx + 1];
            if (next && (
                sameStack(targetId, next.id) ||
                $crossGroups.find((g: CrossGroup) =>
                    (g.hostTabId === targetId && g.partnerTabId === next.id) ||
                    (g.partnerTabId === targetId && g.hostTabId === next.id)
                )
            )) return { targetId: next.id, side: "after" };
        } else {
            const prev: EditorTab | undefined = idx > 0 ? $tabs[idx - 1] : undefined;
            if (prev && (
                sameStack(prev.id, targetId) ||
                $crossGroups.find((g: CrossGroup) =>
                    (g.hostTabId === prev.id && g.partnerTabId === targetId) ||
                    (g.partnerTabId === prev.id && g.hostTabId === targetId)
                )
            )) return { targetId: prev.id, side: "before" };
        }
        return { targetId, side: rawSide };
    }

    function performReorder(draggedTabId: string, targetTabId: string, side: DropSide): void {
        const groups: StackGroup[] = stackGroups;
        const cGroups: CrossGroup[] = $crossGroups;
        tabs.update((ts: EditorTab[]) => {
            const jGroup = groups.find((g) =>
                stackMembers(g).includes(draggedTabId),
            );
            const cGroup = cGroups.find(
                (g: CrossGroup) => g.hostTabId === draggedTabId || g.partnerTabId === draggedTabId,
            );
            const idsToMove: string[] = jGroup
                ? stackMembers(jGroup)
                      .map((id) => ({ id, idx: ts.findIndex((t) => t.id === id) }))
                      .sort((a, b) => a.idx - b.idx)
                      .map((m) => m.id)
                : cGroup
                    ? (ts.findIndex(t => t.id === cGroup.hostTabId) <= ts.findIndex(t => t.id === cGroup.partnerTabId)
                        ? [cGroup.hostTabId, cGroup.partnerTabId]
                        : [cGroup.partnerTabId, cGroup.hostTabId])
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
        // Only the primary (left) button initiates a drag — right-click opens the menu.
        if (e.button !== 0) return;
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
    bind:innerWidth={windowWidth}
/>

<!-- Outer: clips scrollbar thumb to the rounded-full boundary -->
<div
    class="{$zenMode ? 'zen-tabs' : ''} select-none absolute -bottom-8 left-1/2 -translate-x-1/2 max-w-[min(38rem,90%)] rounded-md border border-stone-200 dark:border-[#414559] bg-brand-sand-50 shrink-0 min-h-8 z-30 overflow-hidden"
    style={$zenMode ? `--zen-tabs-opacity: ${$zenPeek ? 1 : $zenTabsOpacity / 100}` : ''}
>
<!-- Inner: handles horizontal scrolling -->
<div
    class="tabs-scroll flex flex-row min-h-8 {pointerDragging ? 'cursor-grabbing' : ''}"
    role="tablist"
    aria-label="Editor tabs"
>
    {#each $tabs as tab, i (tab.id)}
        {@const nextTab = $tabs[i + 1]}
        {@const stackGroup = stackGroups.find(
            (g) => stackMembers(g).includes(tab.id),
        ) ?? null}
        {@const crossGroupForTab = $crossGroups.find(
            (g) => g.hostTabId === tab.id || g.partnerTabId === tab.id,
        ) ?? null}
        {@const group = stackGroup ?? crossGroupForTab}
        {@const color = group
            ? GROUP_COLORS[group.colorIdx % GROUP_COLORS.length]
            : null}
        {@const allGroupedIds = new Set([
            ...stackGroups.flatMap((g) => stackMembers(g)),
            ...$crossGroups.flatMap((g) => [g.hostTabId, g.partnerTabId]),
        ])}
        {@const isUngroupedSplittable =
            (tab.type === "julia" || tab.type === "typst" || tab.type === "lexical") &&
            !stackGroup && !crossGroupForTab}
        {@const availablePartners = $tabs.filter(
            (t) =>
                (t.type === "julia" || t.type === "typst" || t.type === "lexical") &&
                t.id !== tab.id &&
                !allGroupedIds.has(t.id) &&
                !(tab.type === "lexical" && t.type === "lexical"),
        )}
        {@const adjacentStackGroup = nextTab
            ? (stackGroups.find((g) => {
                  const m = stackMembers(g);
                  return m.includes(tab.id) && m.includes(nextTab.id);
              }) ?? null)
            : null}
        {@const stackGroupMemberIdxs = stackGroup
            ? stackMembers(stackGroup).map((id) =>
                  $tabs.findIndex((t) => t.id === id),
              )
            : []}
        {@const isTrailingStackMember =
            stackGroup &&
            Math.max(...stackGroupMemberIdxs) === i}
        {@const canAddThird =
            !!stackGroup &&
            !stackGroup.tabC &&
            isTrailingStackMember &&
            canShowSplit &&
            availableThirdFiles(stackGroup).length > 0}
        {@const adjacentCrossGroup = nextTab
            ? ($crossGroups.find(
                  (g) =>
                      (g.hostTabId === tab.id && g.partnerTabId === nextTab.id) ||
                      (g.partnerTabId === tab.id && g.hostTabId === nextTab.id),
              ) ?? null)
            : null}
        {@const adjacentGroup = adjacentStackGroup ?? adjacentCrossGroup}

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
            oncontextmenu={(e) => openContextMenu(e, tab.id)}
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
                class="group cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[13px] whitespace-nowrap
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
                        if (adjacentStackGroup) {
                            // Unlinking at the seam next to the third file only
                            // detaches that file; elsewhere dissolves the group.
                            const involvesThird =
                                adjacentStackGroup.tabC === tab.id ||
                                adjacentStackGroup.tabC === nextTab?.id;
                            if (involvesThird)
                                detachThirdStack(adjacentStackGroup);
                            else removeStackGroup(adjacentStackGroup);
                        } else if (adjacentCrossGroup)
                            removeCrossGroup(adjacentCrossGroup.id);
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
            {#if canAddThird}
                <!-- Add a third Julia file (right column, above the REPL) -->
                <button
                    data-no-drag
                    data-add-third-anchor
                    onclick={(e) => {
                        e.stopPropagation();
                        handleAddThirdClick(stackGroup!, e);
                    }}
                    class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 cursor-pointer px-1"
                    title="Add a third Julia file to this split"
                >
                    <span
                        class="w-4 h-4 rounded-full flex items-center justify-center
                                 bg-white dark:bg-[#292c3c]
                                 border border-stone-200 dark:border-[#414559] shadow-sm
                                 hover:scale-110 transition-transform"
                    >
                        <Icon
                            icon="solar:add-circle-bold-duotone"
                            class={color?.text ?? "text-brand-charcoal-400"}
                            width="0.7rem"
                        />
                    </span>
                </button>
            {/if}
        </div>
    {/each}
</div><!-- end inner scroll div -->
</div><!-- end outer clip div -->

<div aria-live="polite" aria-atomic="true" class="sr-only">
    {dragTabId ? "Dragging tab — release to drop" : ""}
</div>

<!-- Partner picker — rendered outside scroll container via fixed positioning -->
{#if pickerForTabId !== null && pickerPos !== null}
    {@const pickerTab = $tabs.find((t) => t.id === pickerForTabId)}
    {@const pickerAllGroupedIds = new Set([
        ...stackGroups.flatMap((g) => stackMembers(g)),
        ...$crossGroups.flatMap((g) => [g.hostTabId, g.partnerTabId]),
    ])}
    {@const pickerHostType = pickerTab?.type}
    {@const pickerPartners = $tabs.filter(
        (t) =>
            (t.type === "julia" || t.type === "typst" || t.type === "lexical") &&
            t.id !== pickerForTabId &&
            !pickerAllGroupedIds.has(t.id) &&
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
                        } else if (hostType === "typst" && partner.type === "typst") {
                            createTypstGroup(pickerForTabId!, partner.id);
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

<!-- Add-third picker — choose which file joins the group as its third member -->
{#if addThirdForGroupId !== null && addThirdPos !== null}
    {@const addThirdGroup = stackGroups.find((g) => g.id === addThirdForGroupId)}
    {@const thirdCandidates = addThirdGroup ? availableThirdFiles(addThirdGroup) : []}
    {#if addThirdGroup && thirdCandidates.length > 0}
        <div
            data-add-third-dropdown
            style="position: fixed; left: {addThirdPos.x}px; top: {addThirdPos.y}px; transform: translate(-100%, calc(-100% - 4px)); z-index: 9999;"
            class="bg-brand-sand-50 dark:bg-[#292c3c] border border-brand-sand-200 dark:border-[#414559] rounded-3xl shadow-xl p-3 min-w-40"
        >
            {#each thirdCandidates as candidate}
                <button
                    onclick={() => attachThird(addThirdGroup, candidate.id)}
                    class="cursor-pointer w-full flex items-center gap-2 p-1 m-1 text-xs rounded-full px-3 text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5] active:bg-brand-sand-400"
                >
                    <Icon
                        icon={candidate.type === "typst"
                            ? "solar:document-text-bold-duotone"
                            : "solar:code-bold-duotone"}
                        width="0.75rem"
                        class="shrink-0"
                    />
                    {candidate.name}
                </button>
            {/each}
        </div>
    {/if}
{/if}

<!-- Tab context menu — Close Others / Close Left / Close Right -->
{#if contextMenuTabId !== null && contextMenuPos !== null}
    {@const ctxIdx = $tabs.findIndex((t) => t.id === contextMenuTabId)}
    {@const hasOthers = $tabs.length > 1}
    {@const hasLeft = ctxIdx > 0}
    {@const hasRight = ctxIdx >= 0 && ctxIdx < $tabs.length - 1}
    <div
        data-context-menu
        style="position: fixed; left: {contextMenuPos.x}px; top: {contextMenuPos.y}px; transform: translateY(calc(-100% - 4px)); z-index: 9999;"
        class="bg-brand-sand-50 dark:bg-[#292c3c] border border-brand-sand-200 dark:border-[#414559] rounded-2xl shadow-xl p-1.5 min-w-40"
    >
        <button
            onclick={() => closeThis(contextMenuTabId!)}
            class="cursor-pointer w-full flex items-center gap-2 p-1 px-3 text-xs rounded-full text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:close-square-bold-duotone" width="0.85rem" class="shrink-0" />
            Close
        </button>
        <button
            disabled={!hasOthers}
            onclick={() => closeOthers(contextMenuTabId!)}
            class="cursor-pointer w-full flex items-center gap-2 p-1 px-3 text-xs rounded-full text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5] disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:dark:hover:bg-transparent"
        >
            <Icon icon="solar:close-circle-bold-duotone" width="0.85rem" class="shrink-0" />
            Close Others
        </button>
        <button
            disabled={!hasLeft}
            onclick={() => closeLeft(contextMenuTabId!)}
            class="cursor-pointer w-full flex items-center gap-2 p-1 px-3 text-xs rounded-full text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5] disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:dark:hover:bg-transparent"
        >
            <Icon icon="solar:square-arrow-left-bold-duotone" width="0.85rem" class="shrink-0" />
            Close Left
        </button>
        <button
            disabled={!hasRight}
            onclick={() => closeRight(contextMenuTabId!)}
            class="cursor-pointer w-full flex items-center gap-2 p-1 px-3 text-xs rounded-full text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5] disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:dark:hover:bg-transparent"
        >
            <Icon icon="solar:square-arrow-right-bold-duotone" width="0.85rem" class="shrink-0" />
            Close Right
        </button>
    </div>
{/if}

<style>
    /* Grab cursor on draggable tab wrappers */
    [data-tab-id] {
        cursor: grab;
    }

    /* Thin horizontal scrollbar via the standard scrollbar API, which all three
       webviews honor (WKWebView / WebView2 / WebKitGTK). `overflow: overlay` is
       avoided on purpose — on macOS with a mouse attached it renders a thick,
       non-styleable classic scrollbar. The dark-mode colour is set in app.css. */
    .tabs-scroll {
        overflow-x: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(130, 130, 130, 0.4) transparent;
    }

    /* Zen Mode: tab strip opacity is user-configurable (Settings → Sukūn Mode).
       Hovering always reveals it fully so it stays usable at low opacities. */
    .zen-tabs {
        opacity: var(--zen-tabs-opacity, 1);
        transition: opacity 0.2s ease;
    }
    .zen-tabs:hover {
        opacity: 1;
    }
</style>
