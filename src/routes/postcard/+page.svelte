<!--
  The postcard editor as its own OS window.

  This window boots a fresh JS context, so nothing the main window holds in
  memory is here. The seed — which surah, which ayahs, whether to resume the
  last design — arrives on the query string, and is written into the same stores
  the editor already reads so its own seeding logic runs unchanged. The saved
  design travels back through localStorage, which every window on this origin
  shares (see the storage listener in postcard.store).
-->
<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import PostcardDialog from "$lib/components/postcard/PostcardDialog.svelte";
    import {
        postcardOpenMode,
        type PostcardOpenMode,
    } from "$lib/stores/postcard.store";
    import {
        selectedSurahIdx,
        morphologyAyahFilter,
        ensureSurahLabels,
    } from "$lib/stores/quran.svelte";
    import { ensureTranslators } from "$lib/stores/translation.store";

    const params = page.url.searchParams;

    const mode: PostcardOpenMode =
        params.get("mode") === "resume" ? "resume" : "new";
    postcardOpenMode.set(mode);

    const surah = Number(params.get("surah"));
    if (Number.isInteger(surah) && surah >= 1 && surah <= 114) {
        selectedSurahIdx.set(surah);
    }

    const ayahs = (params.get("ayahs") ?? "")
        .split(",")
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0);
    if (ayahs.length) morphologyAyahFilter.set(ayahs);

    // The surah and translator lists live in plain in-memory stores that the
    // main window fills during its own startup. This window has neither, so it
    // loads them itself — otherwise both pickers come up empty.
    onMount(() => {
        void ensureSurahLabels().catch((e) =>
            console.error("Failed to load surah labels", e),
        );
        void ensureTranslators().catch((e) =>
            console.error("Failed to load translators", e),
        );
    });

    async function closeWindow() {
        try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().close();
        } catch {
            // Outside Tauri there is no window to close; leave the editor up.
        }
    }
</script>

<svelte:head>
    <title>Postcard</title>
</svelte:head>

<PostcardDialog open={true} standalone={true} onClose={closeWindow} />
