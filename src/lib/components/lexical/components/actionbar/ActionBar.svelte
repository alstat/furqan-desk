<script lang="ts">
    import ImportButton from "./ImportButton.svelte";
    import OpenFolderButton from "./OpenFolderButton.svelte";
    import ExportButton from "./ExportButton.svelte";
    import ExportDocxButton from "./ExportDocxButton.svelte";
    import ExportTypstButton from "./ExportTypstButton.svelte";
    import SaveAsButton from "./SaveAsButton.svelte";
    import RedoButton from "./RedoButton.svelte";
    import UndoButton from "./UndoButton.svelte";
    import { zenMode, zenPeek } from "$lib/stores/editor.store";
    import { activeTab, tabs } from "$lib/stores/tabs.store";

    // tabId pins this bar to one panel's tab. Split layouts render one bar per
    // panel and pass it explicitly; leaving it null keeps the single-bar
    // behaviour of following whichever tab is active.
    let {
        topOffset = "-top-5",
        tabId = null,
    }: { topOffset?: string; tabId?: string | null } = $props();

    const targetTab = $derived(
        tabId ? ($tabs.find((t) => t.id === tabId) ?? null) : $activeTab,
    );
</script>

<div
    class="absolute {topOffset} left-1/2 z-50 -translate-x-1/2 flex flex-row justify-stretch {$zenMode
        ? ($zenPeek ? 'opacity-50 transition-opacity duration-200' : 'opacity-0 hover:opacity-100 transition-opacity duration-200')
        : ''}"
>
    <div class="mr-4 space-x-0.5">
        <UndoButton {tabId} />
        <RedoButton {tabId} />
    </div>
    <div class="ml-4 space-x-0.5">
        <ImportButton />
        <ExportButton {tabId} />
        <SaveAsButton {tabId} />
        {#if targetTab?.type === "lexical"}
            <ExportDocxButton {tabId} />
            <ExportTypstButton {tabId} />
        {/if}
    </div>
</div>
