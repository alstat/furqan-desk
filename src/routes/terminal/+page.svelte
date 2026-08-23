<!--
  The terminal as its own OS window.

  Nothing needs handing over from the main window: the shells are PTYs owned by
  the Rust side, and this window drives them through the same `pty_*` commands
  and `pty-output` events the in-app panel always used.
-->
<script lang="ts">
    import TerminalDialog from "$lib/components/shared/TerminalDialog.svelte";

    async function closeWindow() {
        try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().close();
        } catch {
            // Outside Tauri there is no window to close; leave the terminal up.
        }
    }
</script>

<svelte:head>
    <title>Terminal</title>
</svelte:head>

<TerminalDialog open={true} standalone={true} onClose={closeWindow} />
