<script lang="ts">
    import NextPrevButton from "./NextPrevButton.svelte";
    import {
        hideSurahPage,
        isSidebar,
        selectedSurahIdx,
    } from "$lib/stores/quran.svelte";
    import { morphFontSize } from "$lib/stores/morphology.store";
    import MorphologyView from "./MorphologyView.svelte";

    let scrollContainer = $state<HTMLElement | null>(null);

    $effect(() => {
        $selectedSurahIdx; // track changes
        scrollContainer?.scrollTo({ top: 0, behavior: "instant" });
    });
</script>

<div
    class={`${$hideSurahPage() ? "hidden " : ""}relative z-1 flex flex-col items-center bg-white sm:w-full md:w-9/12 lg:w-6/12 sm:shadow-xl sm:shadow-slate-200/60`}
>
    <div
        bind:this={scrollContainer}
        class={`default-scroll border border-stone-200 w-full flex-1 overflow-y-auto px-12 py-10 text-right ${$morphFontSize} leading-loose text-slate-600 ${$isSidebar ? "rounded-r-md" : "rounded-md"}`}
    >
        <MorphologyView />
    </div>

    <NextPrevButton position={"absolute -bottom-4 inset-x-0 z-20"} />
</div>
