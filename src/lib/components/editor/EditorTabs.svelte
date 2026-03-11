<script lang="ts">
    import { tabs, activeTabId, activeTab, closeTab } from "$lib/stores/tabs.store";
    import { hideSurahPage } from "$lib/stores/quran.svelte";
    import { juliaGroups, createJuliaGroup, removeJuliaGroup, removeJuliaGroupByTab, flashingTabId } from "$lib/stores/julia-terminal.store";
    import Icon from "@iconify/svelte";
    import { confirm } from "@tauri-apps/plugin-dialog";

    const GROUP_COLORS = [
        { border: 'border-b-amber-400',   text: 'text-amber-500',   bg: 'bg-amber-50/60 dark:bg-amber-900/20'    },
        { border: 'border-b-teal-400',    text: 'text-teal-500',    bg: 'bg-teal-50/60 dark:bg-teal-900/20'      },
        { border: 'border-b-rose-400',    text: 'text-rose-500',    bg: 'bg-rose-50/60 dark:bg-rose-900/20'      },
        { border: 'border-b-violet-400',  text: 'text-violet-500',  bg: 'bg-violet-50/60 dark:bg-violet-900/20'  },
        { border: 'border-b-sky-400',     text: 'text-sky-500',     bg: 'bg-sky-50/60 dark:bg-sky-900/20'        },
        { border: 'border-b-emerald-400', text: 'text-emerald-500', bg: 'bg-emerald-50/60 dark:bg-emerald-900/20'},
        { border: 'border-b-orange-400',  text: 'text-orange-500',  bg: 'bg-orange-50/60 dark:bg-orange-900/20'  },
        { border: 'border-b-pink-400',    text: 'text-pink-500',    bg: 'bg-pink-50/60 dark:bg-pink-900/20'      },
        { border: 'border-b-indigo-400',  text: 'text-indigo-500',  bg: 'bg-indigo-50/60 dark:bg-indigo-900/20'  },
        { border: 'border-b-lime-400',    text: 'text-lime-500',    bg: 'bg-lime-50/60 dark:bg-lime-900/20'      },
        { border: 'border-b-cyan-400',    text: 'text-cyan-500',    bg: 'bg-cyan-50/60 dark:bg-cyan-900/20'      },
        { border: 'border-b-fuchsia-400', text: 'text-fuchsia-500', bg: 'bg-fuchsia-50/60 dark:bg-fuchsia-900/20'},
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
        closeTab(id);
    }

    function ensureAdjacent(tabAId: string, tabBId: string) {
        tabs.update(ts => {
            const idxA = ts.findIndex(t => t.id === tabAId);
            const idxB = ts.findIndex(t => t.id === tabBId);
            if (idxA < 0 || idxB < 0 || idxB === idxA + 1) return ts;
            const result = ts.filter(t => t.id !== tabBId);
            const newIdxA = result.findIndex(t => t.id === tabAId);
            result.splice(newIdxA + 1, 0, ts[idxB]);
            return result;
        });
    }

    function handleSplitClick(tabId: string, e: MouseEvent) {
        const groupedIds = new Set($juliaGroups.flatMap(g => [g.tabA, g.tabB]));
        const available = $tabs.filter(t =>
            t.type === 'julia' && t.id !== tabId && !groupedIds.has(t.id)
        );
        if (available.length === 0) return;
        if (available.length === 1) {
            createJuliaGroup(tabId, available[0].id);
            ensureAdjacent(tabId, available[0].id);
            pickerForTabId = null;
            pickerPos = null;
        } else {
            if (pickerForTabId === tabId) {
                pickerForTabId = null;
                pickerPos = null;
            } else {
                const anchor = (e.currentTarget as HTMLElement).closest('[data-picker-anchor]');
                const rect = anchor?.getBoundingClientRect();
                pickerForTabId = tabId;
                pickerPos = rect ? { x: rect.left, y: rect.top } : null;
            }
        }
    }

    let canShowSplit = $derived($hideSurahPage() && $tabs.some(t => t.type === 'julia'));

    function onWindowPointerDown(e: PointerEvent) {
        if (pickerForTabId === null) return;
        const target = e.target as HTMLElement;
        if (!target.closest('[data-picker-anchor]') && !target.closest('[data-picker-dropdown]')) {
            pickerForTabId = null;
            pickerPos = null;
        }
    }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div
    class="flex flex-row absolute -bottom-8 left-1/2 -translate-x-1/2 max-w-[min(28rem,80%)] overflow-x-auto rounded-full border border-stone-200 dark:border-[#414559] bg-brand-sand-50 shrink-0 min-h-8 z-30"
>
    {#each $tabs as tab, i (tab.id)}
        {@const nextTab = $tabs[i + 1]}
        {@const groupIdx = $juliaGroups.findIndex(g => g.tabA === tab.id || g.tabB === tab.id)}
        {@const group = groupIdx >= 0 ? $juliaGroups[groupIdx] : null}
        {@const color = group ? GROUP_COLORS[group.colorIdx % GROUP_COLORS.length] : null}
        {@const groupedIds = new Set($juliaGroups.flatMap(g => [g.tabA, g.tabB]))}
        {@const isUngroupedJulia = tab.type === 'julia' && !group}
        {@const availablePartners = $tabs.filter(t => t.type === 'julia' && t.id !== tab.id && !groupedIds.has(t.id))}
        {@const adjacentGroup = nextTab ? $juliaGroups.find(g =>
            (g.tabA === tab.id && g.tabB === nextTab.id) ||
            (g.tabB === tab.id && g.tabA === nextTab.id)
        ) : null}

        <div class="relative" data-picker-anchor>
            <button
                onclick={() => {
                    activeTabId.set(tab.id);
                    if (group) {
                        flashingTabId.set(tab.id);
                        setTimeout(() => flashingTabId.set(null), 1500);
                    }
                }}
                class="group cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[11px] whitespace-nowrap
                       border-r border-stone-200 dark:border-[#414559] transition-colors
                       {group ? `border-b-2 ${color?.border} ${color?.bg} pr-6` : ''}
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

                <!-- Split button: shown on ungrouped julia tabs when partners are available -->
                {#if isUngroupedJulia && canShowSplit && availablePartners.length > 0}
                    <span
                        role="button"
                        tabindex="-1"
                        onclick={(e) => {
                            e.stopPropagation();
                            handleSplitClick(tab.id, e);
                        }}
                        class="opacity-0 group-hover:opacity-50 hover:opacity-100! transition-opacity leading-none"
                        title="Split view"
                    ><Icon icon="solar:copy-bold-duotone" width="0.85rem" /></span>
                {/if}

                <span
                    role="button"
                    tabindex="-1"
                    onclick={(e) => {
                        e.stopPropagation();
                        tryClose(tab.id);
                    }}
                    class="opacity-40 hover:opacity-100! transition-opacity ml-0.5 leading-none"
                    title="Close"
                    ><Icon icon="solar:close-circle-bold" width="1rem" /></span
                >
            </button>
            {#if adjacentGroup}
                {@const adjColor = GROUP_COLORS[adjacentGroup.colorIdx % GROUP_COLORS.length]}
                <button
                    onclick={() => removeJuliaGroup(adjacentGroup.id)}
                    class="group/link absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 cursor-pointer px-1"
                    title="Unlink"
                >
                    <span class="w-4 h-4 rounded-full flex items-center justify-center
                                 bg-white dark:bg-[#292c3c]
                                 border border-stone-200 dark:border-[#414559] shadow-sm">
                        <Icon icon="solar:link-bold-duotone"
                              class="group-hover/link:hidden {adjColor.text}" width="0.6rem" />
                        <Icon icon="solar:unlink-bold"
                              class="hidden group-hover/link:block text-rose-400" width="0.6rem" />
                    </span>
                </button>
            {/if}
        </div>
    {/each}
</div>

<!-- Partner picker — rendered outside scroll container via fixed positioning -->
{#if pickerForTabId !== null && pickerPos !== null}
    {@const pickerTab = $tabs.find(t => t.id === pickerForTabId)}
    {@const pickerGroupedIds = new Set($juliaGroups.flatMap(g => [g.tabA, g.tabB]))}
    {@const pickerPartners = $tabs.filter(t => t.type === 'julia' && t.id !== pickerForTabId && !pickerGroupedIds.has(t.id))}
    {#if pickerTab && pickerPartners.length > 1}
        <div
            data-picker-dropdown
            style="position: fixed; left: {pickerPos.x}px; top: {pickerPos.y}px; transform: translateY(calc(-100% - 4px)); z-index: 9999;"
            class="bg-white dark:bg-[#303446] border border-stone-200 dark:border-[#414559] rounded shadow-lg py-1 min-w-[10rem]"
        >
            {#each pickerPartners as partner}
                <button
                    onclick={() => {
                        createJuliaGroup(pickerForTabId!, partner.id);
                        ensureAdjacent(pickerForTabId!, partner.id);
                        pickerForTabId = null;
                        pickerPos = null;
                    }}
                    class="w-full text-left px-3 py-1.5 text-[11px] hover:bg-brand-sand-100 dark:hover:bg-[#414559] flex items-center gap-2"
                >
                    <Icon icon="solar:code-bold-duotone" width="0.75rem" class="opacity-60" />
                    {partner.name}
                </button>
            {/each}
        </div>
    {/if}
{/if}
