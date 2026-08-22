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
    import { actionBtnStyle, headerBtnStyle } from "$lib/data/toolbar/toolbar";
    import { zenMode, zenPeek } from "$lib/stores/editor.store";
    import { activeTab, tabs } from "$lib/stores/tabs.store";

    // tabId pins this bar to one panel's tab. Split layouts render one bar per
    // panel and pass it explicitly; leaving it null keeps the single-bar
    // behaviour of following whichever tab is active.
    //
    // variant "header" drops the absolute centring and the zen fade: the bar is
    // then a plain row the window header lays out itself.
    let {
        topOffset = "-top-5",
        tabId = null,
        variant = "floating",
    }: {
        topOffset?: string;
        tabId?: string | null;
        variant?: "floating" | "header";
    } = $props();

    const targetTab = $derived(
        tabId ? ($tabs.find((t) => t.id === tabId) ?? null) : $activeTab,
    );

    const inHeader = $derived(variant === "header");
    const btnClass = $derived(inHeader ? headerBtnStyle : actionBtnStyle);
</script>

<div
    class={inHeader
        ? "flex flex-row flex-nowrap items-center gap-0.5"
        : `absolute ${topOffset} left-1/2 z-50 -translate-x-1/2 flex flex-row flex-nowrap items-center justify-stretch ${
              $zenMode
                  ? $zenPeek
                      ? "opacity-50 transition-opacity duration-200"
                      : "opacity-0 hover:opacity-100 transition-opacity duration-200"
                  : ""
          }`}
>
    <!-- Both groups are nowrap flex rows that refuse to shrink: as blocks of
         inline-block buttons they wrapped onto a second line once the pane got
         narrow enough to squeeze them (the app's 1250px minimum width, or
         either half of a split). In the header they carry no margin of their
         own: the row's gap spaces the two groups exactly as the buttons inside
         them are spaced, so the bar reads as one run of controls. -->
    <div
        class="flex shrink-0 flex-row items-center {inHeader
            ? 'gap-0.5'
            : 'mr-4 space-x-2'}"
    >
        <UndoButton {tabId} {btnClass} />
        <RedoButton {tabId} {btnClass} />
    </div>
    <div
        class="flex shrink-0 flex-row items-center {inHeader
            ? 'gap-0.5'
            : 'ml-4 space-x-2'}"
    >
        <ImportButton {btnClass} />
        <ExportButton {tabId} {btnClass} />
        <SaveAsButton {tabId} {btnClass} />
        {#if targetTab?.type === "lexical"}
            <ExportDocxButton {tabId} {btnClass} />
            <ExportTypstButton {tabId} {btnClass} />
        {/if}
        <!-- Last in the row: applies to every editor type, unlike the export
             buttons above it. -->
        <FindButton {tabId} {btnClass} />
    </div>
</div>
