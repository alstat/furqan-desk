<script lang="ts">
    import ImportButton from "./ImportButton.svelte";
    import OpenFolderButton from "./OpenFolderButton.svelte";
    import ExportButton from "./ExportButton.svelte";
    import SaveAsButton from "./SaveAsButton.svelte";
    import RedoButton from "./RedoButton.svelte";
    import UndoButton from "./UndoButton.svelte";
    import { zenMode } from "$lib/stores/editor.store";

    let { topOffset = "-top-5" }: { topOffset?: string } = $props();
</script>

<div
    class="absolute {topOffset} left-1/2 z-50 -translate-x-1/2 flex flex-row justify-stretch {$zenMode ? 'opacity-0 hover:opacity-100 transition-opacity duration-200' : ''}"
>
    <div class="mr-4 space-x-0.5">
        <UndoButton />
        <RedoButton />
    </div>
    <div class="ml-4 space-x-0.5">
        <ImportButton />
        <ExportButton />
        <SaveAsButton />
    </div>
</div>
