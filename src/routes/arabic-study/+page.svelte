<!--
  The Verse Study canvas as its own OS window.

  This window boots a fresh JS context, so nothing the main window holds in
  memory is here. The ayah to study arrives on the query string and is
  written into `verseStudyAyah`, the same store the canvas already reads.
  While the window stays open the main window re-points it at a new ayah
  with a `verse-study-ayah` event rather than opening a second copy.
-->
<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import VerseStudyCanvas from "$lib/components/arabic-study/VerseStudyCanvas.svelte";
    import { verseStudyAyah } from "$lib/stores/arabic-study.store";
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
        verseStudyAyah.set({ surah, ayah });
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
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                unlisten = await getCurrentWindow().listen<{
                    surah: number;
                    ayah: number;
                }>("verse-study-ayah", (e) => verseStudyAyah.set(e.payload));
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
            // Outside Tauri there is no window to close.
        }
    }
</script>

<svelte:head>
    <title>Arabic Language Study</title>
</svelte:head>

<VerseStudyCanvas open={true} standalone={true} onClose={closeWindow} />
