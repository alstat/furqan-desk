<script lang="ts">
    import ImportButton from "./ImportButton.svelte";
    import OpenFolderButton from "./OpenFolderButton.svelte";
    import ExportButton from "./ExportButton.svelte";
    import ExportDocxButton from "./ExportDocxButton.svelte";
    import ExportTypstButton from "./ExportTypstButton.svelte";
    import FindButton from "./FindButton.svelte";
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
    class="absolute {topOffset} left-1/2 z-50 -translate-x-1/2 flex flex-row flex-nowrap items-center justify-stretch {$zenMode
        ? ($zenPeek ? 'opacity-50 transition-opacity duration-200' : 'opacity-0 hover:opacity-100 transition-opacity duration-200')
        : ''}"
>
    <!-- Both groups are nowrap flex rows that refuse to shrink: as blocks of
         inline-block buttons they wrapped onto a second line once the pane got
         narrow enough to squeeze them (the app's 1250px minimum width, or
         either half of a split). The bar is absolutely positioned and centred,
         so staying one row costs nothing but overhang. -->
    <div class="mr-4 flex shrink-0 flex-row items-center space-x-2">
        <UndoButton {tabId} />
        <RedoButton {tabId} />
    </div>
    <div class="ml-4 flex shrink-0 flex-row items-center space-x-2">
        <ImportButton />
        <ExportButton {tabId} />
        <SaveAsButton {tabId} />
        {#if targetTab?.type === "lexical"}
            <ExportDocxButton {tabId} />
            <ExportTypstButton {tabId} />
        {/if}
        <!-- Last in the row: applies to every editor type, unlike the export
             buttons above it. -->
        <FindButton {tabId} />
    </div>
</div>
