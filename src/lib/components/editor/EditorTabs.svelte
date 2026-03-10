<script lang="ts">
    import { tabs, activeTabId, closeTab } from "$lib/stores/tabs.store";
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
        closeTab(id);
    }
</script>

<div
    class="flex flex-row absolute -bottom-3 left-1/2 -translate-x-1/2 max-w-[min(28rem,80%)] overflow-x-auto rounded-full border border-stone-200 bg-brand-sand-50 shrink-0 min-h-[2rem] z-30"
>
    {#each $tabs as tab (tab.id)}
        <button
            onclick={() => activeTabId.set(tab.id)}
            class="group cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[11px] whitespace-nowrap
			       border-r border-stone-200 transition-colors
			       {$activeTabId === tab.id
                ? 'bg-white border-t-2 border-t-brand-gold-400 text-brand-charcoal-800 font-medium'
                : 'text-brand-charcoal-400 hover:bg-white/70'}"
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
            <span class={tab.isPreview ? 'italic' : ''}>{tab.name}{tab.isDirty ? " *" : ""}</span>
            <span
                role="button"
                tabindex="-1"
                onclick={(e) => {
                    e.stopPropagation();
                    tryClose(tab.id);
                }}
                class="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity ml-0.5 leading-none"
                title="Close">×</span
            >
        </button>
    {/each}
</div>
