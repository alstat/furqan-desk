<script lang="ts">
    import { tabs, activeTabId, activeTab, closeTab } from "$lib/stores/tabs.store";
    import { hideSurahPage } from "$lib/stores/quran.svelte";
    import { splitJuliaTabId } from "$lib/stores/julia-terminal.store";
    import Icon from "@iconify/svelte";
    import { confirm } from "@tauri-apps/plugin-dialog";

    async function tryClose(id: string) {
        const tab = $tabs.find((t) => t.id === id);
        if (tab?.isDirty) {
            const ok = await confirm(
                `"${tab.name}" has unsaved changes. Close anyway?`,
                { title: "Unsaved Changes", kind: "warning" },
            );
            if (!ok) return;
        }
        // Clear split if closing the split tab
        if ($splitJuliaTabId === id) splitJuliaTabId.set(null);
        closeTab(id);
    }

    function toggleSplit(id: string) {
        if ($splitJuliaTabId === id) {
            splitJuliaTabId.set(null);
        } else {
            splitJuliaTabId.set(id);
        }
    }

    // Show the split button on a non-active julia tab when
    // the active tab is also julia AND hideSurahPage is active.
    let canShowSplit = $derived($hideSurahPage() && $activeTab?.type === 'julia');
</script>

<div
    class="flex flex-row absolute -bottom-8 left-1/2 -translate-x-1/2 max-w-[min(28rem,80%)] overflow-x-auto rounded-full border border-stone-200 dark:border-[#414559] bg-brand-sand-50 shrink-0 min-h-8 z-30"
>
    {#each $tabs as tab (tab.id)}
        <button
            onclick={() => activeTabId.set(tab.id)}
            class="group cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[11px] whitespace-nowrap
		           border-r border-stone-200 dark:border-[#414559] transition-colors
		           {$activeTabId === tab.id
                ? 'bg-white dark:bg-[#414559] border-t-2 border-t-brand-gold-400 text-brand-charcoal-800 dark:text-[#e5c890] font-medium'
                : 'text-brand-charcoal-400 hover:bg-white/70 dark:hover:bg-[#303446]/70'}"
        >
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

            <!-- Split button: shown on non-active julia tabs when split mode is available -->
            {#if tab.type === 'julia' && $activeTabId !== tab.id && canShowSplit}
                <span
                    role="button"
                    tabindex="-1"
                    onclick={(e) => {
                        e.stopPropagation();
                        toggleSplit(tab.id);
                    }}
                    class="opacity-0 group-hover:opacity-60 hover:opacity-100! transition-opacity leading-none
                           {$splitJuliaTabId === tab.id ? 'opacity-100! text-brand-gold-500' : ''}"
                    title={$splitJuliaTabId === tab.id ? "Remove split" : "Split view"}
                ><Icon icon="solar:copy-bold-duotone" width="0.85rem" /></span>
            {/if}

            <span
                role="button"
                tabindex="-1"
                onclick={(e) => {
                    e.stopPropagation();
                    tryClose(tab.id);
                }}
                class="opacity-0 group-hover:opacity-50 hover:opacity-100! transition-opacity ml-0.5 leading-none"
                title="Close"
                ><Icon icon="solar:close-circle-bold" width="1rem" /></span
            >
        </button>
    {/each}
</div>
