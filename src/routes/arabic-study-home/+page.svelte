<!--
  Arabic Study's home window — the proficiency picker, or a short summary
  once a level is saved. A fresh JS context, same reasoning as the
  manuscripts and Verse Study windows.
-->
<script lang="ts">
    import ArabicStudyHome from "$lib/components/arabic-study/ArabicStudyHome.svelte";

    async function closeWindow() {
        try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().close();
        } catch {
            // Outside Tauri there is no window to close.
        }
    }
</script>

<svelte:head>
    <title>Arabic Language Study</title>
</svelte:head>

<ArabicStudyHome open={true} standalone={true} onClose={closeWindow} />
