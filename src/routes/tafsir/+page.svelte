<!--
  The tafsir reader as its own OS window.

  It renders a snapshot the main window derives, because the stores it would
  otherwise read (surahTafsir, multiSurahTafsirMap) are filled by MorphologyView,
  which does not run here. Names resolve from lists this window loads for
  itself. See reader-windows.store.ts.
-->
<script lang="ts">
    import { onMount } from "svelte";
    import TafsirDialog from "$lib/components/shared/TafsirDialog.svelte";
    import {
        installReaderSnapshotClient,
        notifyReaderClosed,
        tafsirSnapshot,
    } from "$lib/stores/reader-windows.store";
    import { ensureTafsirAuthors } from "$lib/stores/translation.store";
    import { ensureSurahLabels } from "$lib/stores/quran.svelte";

    onMount(() => {
        void installReaderSnapshotClient();

        // Tell the main window when this one goes away, so the parchment stops
        // hiding its inline copy. Registered here rather than relying on the
        // creator hearing `tauri://destroyed`, which proved unreliable.
        let unlisten: (() => void) | undefined;
        void (async () => {
            try {
                const { getCurrentWindow } = await import(
                    "@tauri-apps/api/window"
                );
                unlisten = await getCurrentWindow().onCloseRequested(() => {
                    void notifyReaderClosed("tafsir");
                });
            } catch {
                /* outside Tauri */
            }
        })();
        void ensureSurahLabels().catch((e) =>
            console.error("Failed to load surah labels", e),
        );
        void ensureTafsirAuthors().catch((e) =>
            console.error("Failed to load tafsir authors", e),
        );

        return () => unlisten?.();
    });

    async function closeWindow() {
        try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().close();
        } catch {
            /* outside Tauri */
        }
    }
</script>

<svelte:head><title>Tafsir</title></svelte:head>

<TafsirDialog
    open={true}
    standalone={true}
    snapshot={$tafsirSnapshot}
    onClose={closeWindow}
/>
