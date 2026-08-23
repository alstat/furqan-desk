<!--
  The manuscript viewer as its own OS window.

  This window boots a fresh JS context, so nothing the main window holds in
  memory is here. The ayah to show arrives on the query string and is written
  into `manuscriptAyah`, the same store the viewer already reads, so its own
  loading logic runs unchanged. While the window stays open the main window
  re-points it at a new ayah with a `manuscript-ayah` event rather than opening
  a second copy.
-->
<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import ManuscriptViewer from "$lib/components/manuscripts/ManuscriptViewer.svelte";
    import { manuscriptAyah } from "$lib/stores/manuscripts.store";
    import { ensureSurahLabels } from "$lib/stores/quran.svelte";

    const params = page.url.searchParams;
    const surah = Number(params.get("surah"));
    const ayah = Number(params.get("ayah"));
    if (
        Number.isInteger(surah) &&
        surah >= 1 &&
        surah <= 114 &&
        Number.isInteger(ayah) &&
        ayah > 0
    ) {
        manuscriptAyah.set({ surah, ayah });
    }

    onMount(() => {
        // The surah list lives in a plain in-memory store that the main window
        // fills during its own startup; this window has to load it itself.
        void ensureSurahLabels().catch((e) =>
            console.error("Failed to load surah labels", e),
        );

        let unlisten: (() => void) | undefined;
        void (async () => {
            try {
                const { getCurrentWindow } = await import(
                    "@tauri-apps/api/window"
                );
                unlisten = await getCurrentWindow().listen<{
                    surah: number;
                    ayah: number;
                }>("manuscript-ayah", (e) => manuscriptAyah.set(e.payload));
            } catch {
                // Outside Tauri there is nothing to listen to.
            }
        })();
        return () => unlisten?.();
    });

    async function closeWindow() {
        try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().close();
        } catch {
            // Outside Tauri there is no window to close; leave the viewer up.
        }
    }
</script>

<svelte:head>
    <title>Manuscripts</title>
</svelte:head>

<ManuscriptViewer open={true} standalone={true} onClose={closeWindow} />
