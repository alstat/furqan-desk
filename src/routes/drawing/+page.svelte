<!--
  The drawing editor as its own OS window.

  This is the one secondary window that has to hand something back: the finished
  scene belongs in a Lexical node, and Lexical lives in the main window. So the
  editor mounts here without a composer above it (its context getters are
  guarded), reads the scene it was opened on from the seed left in localStorage,
  and emits the result for the main window to commit.
-->
<script lang="ts">
    import DrawingEditorDialog from "$lexical/core/plugins/Drawing/DrawingEditorDialog.svelte";

    async function closeWindow() {
        try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().close();
        } catch {
            // Outside Tauri there is no window to close.
        }
    }
</script>

<svelte:head><title>Drawing</title></svelte:head>

<DrawingEditorDialog standalone={true} onDone={closeWindow} />
