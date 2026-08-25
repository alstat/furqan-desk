<!--
  The terminal as its own OS window.

  Nothing needs handing over from the main window: the shells are PTYs owned by
  the Rust side, and this window drives them through the same `pty_*` commands
  and `pty-output` events the in-app panel always used.
-->
<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import TerminalDialog from "$lib/components/shared/TerminalDialog.svelte";
    import { openFolderPath } from "$lib/stores/tabs.store";
    import { installTerminalCwdClient } from "$lib/stores/terminal-window.store";

    // Where the shells start. This window boots a fresh JS context, so the
    // folder the File Explorer has open in the main window arrives on the query
    // string, and any later change follows over the event below. Left unset the
    // shell starts in $HOME, which is what `start_pty` falls back to.
    openFolderPath.set(page.url.searchParams.get("cwd") || null);

    onMount(() => {
        let dispose: (() => void) | null = null;
        void installTerminalCwdClient().then((fn) => (dispose = fn));
        return () => dispose?.();
    });

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
