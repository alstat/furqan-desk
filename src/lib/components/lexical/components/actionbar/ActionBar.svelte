<script lang="ts">
    import ImportButton from "./ImportButton.svelte";
    import OpenFolderButton from "./OpenFolderButton.svelte";
    import ExportButton from "./ExportButton.svelte";
    import SaveAsButton from "./SaveAsButton.svelte";
    import RedoButton from "./RedoButton.svelte";
    import UndoButton from "./UndoButton.svelte";

    let { topOffset = "-top-5" }: { topOffset?: string } = $props();
</script>

<div
    class="absolute {topOffset} left-1/2 -translate-x-1/2 flex flex-row justify-stretch"
>
    <div class="mr-4">
        <UndoButton />
        <RedoButton />
    </div>
    <div class="ml-4">
        <ImportButton />
        <OpenFolderButton />
        <ExportButton />
        <SaveAsButton />
    </div>
</div>
