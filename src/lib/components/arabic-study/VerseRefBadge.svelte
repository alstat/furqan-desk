<!-- A "﴾surah:ayah﴿" badge that jumps the main reader straight to that verse
     in MorphologyView (and closes the Arabic Study window so it's visible). -->
<script lang="ts">
    import { t } from "$lib/i18n";
    import { goToVerse } from "$lib/utils/verse-nav";

    interface Props {
        verseRef: string;
        size?: "sm" | "md";
    }
    let { verseRef, size = "md" }: Props = $props();
</script>

<button
    type="button"
    onclick={() => goToVerse(verseRef)}
    title={$t("arabicStudy.alphabet.go_to_verse", { ref: verseRef })}
    class="inline-flex cursor-pointer items-center rounded-full border border-[#ecd9a6] bg-[#f7ebcf] font-scheherazade text-[#b07d28] transition-colors hover:border-[#dcc37e] hover:bg-[#f0dfb0] dark:border-[#5a5030] dark:bg-[#34302a] dark:text-[#e5c890] dark:hover:border-[#e5c890]/50 dark:hover:bg-[#3d3826] {size ===
    'sm'
        ? 'px-1.5 text-[0.625rem]'
        : 'px-2 text-[0.75rem]'}"
>
    ﴾{verseRef}﴿
</button>
