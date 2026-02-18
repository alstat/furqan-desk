<script lang="ts">
    import NextPrevButton from "./NextPrevButton.svelte";
    import { hideSurahPage, isSidebar } from "$lib/stores/quran.svelte";
    import { morphFontSize } from "$lib/stores/morphology.store";
    import MorphologyView from "./MorphologyView.svelte";
</script>

<div
    class={`${$hideSurahPage() ? "hidden " : ""} vintage-scroll z-10 flex flex-col items-center overflow-y-auto overflow-x-hidden bg-white px-12 py-10 text-justify sm:w-full md:w-9/12 lg:w-6/12 ${$morphFontSize} leading-loose text-slate-600 ${$isSidebar ? "" : "sm:shadow-xl sm:shadow-slate-200/60 sm:border sm:border-slate-100"}`}
>
    <MorphologyView />

    <NextPrevButton position={"absolute -bottom-12 sm:bottom-2 z-10"} />
</div>
