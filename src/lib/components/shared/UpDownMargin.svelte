<script lang="ts">
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import {
        singlePageMargin,
        zenMode,
        zenPeek,
    } from "$lib/stores/editor.store";
    import Icon from "@iconify/svelte";

    singlePageMargin;
    zenMode;
    zenPeek;
</script>

<div
    class="absolute right-2.5 bottom-25 grid grid-rows-2 gap-3 {$zenMode
        ? $zenPeek
            ? 'opacity-50 transition-opacity duration-200'
            : 'opacity-0 hover:opacity-100 transition-opacity duration-200'
        : ''}"
>
    <!-- <button class={actionBtnStyle + " z-50"}>
        <Icon icon="fluent:padding-left-20-filled" width="1rem" />
    </button>
    <button class={actionBtnStyle + " z-50"}>
        <Icon icon="fluent:padding-right-20-filled" width="1rem" />
    </button> -->
</div>
