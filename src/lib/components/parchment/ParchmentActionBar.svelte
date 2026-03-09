<script lang="ts">
    import Icon from "@iconify/svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";

    interface Props {
        onOpenBookmarks: () => void;
        onOpenHighlights: () => void;
    }
    let { onOpenBookmarks, onOpenHighlights }: Props = $props();
</script>

<div
    class="absolute -top-4 inset-x-0 flex items-center justify-center gap-2"
    dir="ltr"
>
    <button
        onclick={onOpenBookmarks}
        class={actionBtnStyle + " p-1"}
        title="Bookmarks"
        aria-label="Open bookmarks"
    >
        <Icon icon="solar:bookmark-bold-duotone" width="1rem" />
    </button>

    <button
        onclick={onOpenHighlights}
        class={actionBtnStyle + " p-1"}
        title="Highlights"
        aria-label="Open highlights"
    >
        <Icon icon="solar:magic-stick-3-bold-duotone" width="1rem" />
    </button>
</div>
