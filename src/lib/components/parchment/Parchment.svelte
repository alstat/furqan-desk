<script lang="ts">
    import NextPrevButton from "./NextPrevButton.svelte";
    import { hideSurahPage, isSidebar } from "$lib/stores/quran.svelte";
    import { morphFontSize } from "$lib/stores/morphology.store";
    import MorphologyView from "./MorphologyView.svelte";
</script>

<div
    class={`${$hideSurahPage() ? "hidden " : ""}relative z-10 flex flex-col items-center bg-white sm:w-full md:w-9/12 lg:w-6/12 ${$isSidebar ? "" : "sm:shadow-xl sm:shadow-slate-200/60 sm:border sm:border-slate-100"}`}
>
    <div class={`default-scroll w-full flex-1 overflow-y-auto px-12 py-10 text-justify ${$morphFontSize} leading-loose text-slate-600`}>
        <MorphologyView />
    </div>

    <NextPrevButton position={"absolute -bottom-12 sm:bottom-2 z-20"} />
</div>
