<!--
  The translation reader as its own OS window.

  It renders a snapshot the main window derives, because the stores it would
  otherwise read (surahTranslation, multiSurahTranslationMap) are filled by
  MorphologyView, which does not run here. Names resolve from lists this window
  loads for itself. See reader-windows.store.ts.
-->
<script lang="ts">
    import { onMount } from "svelte";
    import TranslationDialog from "$lib/components/shared/TranslationDialog.svelte";
    import {
        installReaderSnapshotClient,
        notifyReaderClosed,
        translationSnapshot,
    } from "$lib/stores/reader-windows.store";
    import { ensureTranslators } from "$lib/stores/translation.store";
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
                    void notifyReaderClosed("translation");
                });
            } catch {
                /* outside Tauri */
            }
        })();
        void ensureSurahLabels().catch((e) =>
            console.error("Failed to load surah labels", e),
        );
        void ensureTranslators().catch((e) =>
            console.error("Failed to load translators", e),
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

<svelte:head><title>Translation</title></svelte:head>

<TranslationDialog
    open={true}
    standalone={true}
    snapshot={$translationSnapshot}
    onClose={closeWindow}
/>
