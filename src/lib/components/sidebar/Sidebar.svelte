<script lang="ts">
    import CollapsibleSidebar from "$lib/components/shared/CollapsibleSidebar.svelte";
    import RichTextEditor from "$lib/components/editor/EditorComposer.svelte";
</script>

<CollapsibleSidebar>
    <div class="h-full overflow-visible">
        <RichTextEditor />
    </div>
</CollapsibleSidebar>
