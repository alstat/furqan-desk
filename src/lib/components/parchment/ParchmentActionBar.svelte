<script lang="ts">
    import Icon from "@iconify/svelte";
    import BookmarkDialog from "./BookmarkDialog.svelte";
    import HighlightDialog from "./HighlightDialog.svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";

    let showBookmarks = $state(false);
    let showHighlights = $state(false);
</script>

<div
    class="absolute -top-4 inset-x-0 flex items-center justify-center gap-2"
    dir="ltr"
>
    <button
        onclick={() => (showBookmarks = !showBookmarks)}
        class={actionBtnStyle + " p-1"}
        title="Bookmarks"
        aria-label="Open bookmarks"
    >
        <Icon icon="solar:bookmark-bold-duotone" width="1rem" />
    </button>

    <button
        onclick={() => (showHighlights = !showHighlights)}
        class={actionBtnStyle + " p-1"}
        title="Highlights"
        aria-label="Open highlights"
    >
        <Icon icon="solar:magic-stick-3-bold-duotone" width="1rem" />
    </button>
</div>

<BookmarkDialog open={showBookmarks} onClose={() => (showBookmarks = false)} />
<HighlightDialog
    open={showHighlights}
    onClose={() => (showHighlights = false)}
/>
