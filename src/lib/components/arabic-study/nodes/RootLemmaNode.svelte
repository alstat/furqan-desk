<!-- Root & lemma for every content word in the studied ayah — click one to
     search for related verses that share it (the Related Verses node reads
     the selection this reports). -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import type { MorphWord } from "$lib/types/morphology";

    export interface RootLemmaSelection {
        root: string | null;
        lemma: string | null;
        arabic: string;
    }

    interface Props {
        words: MorphWord[];
        selection: RootLemmaSelection | null;
        onSelect: (sel: RootLemmaSelection) => void;
    }
    let { words, selection, onSelect }: Props = $props();

    const rows = $derived(
        words
            .flatMap((w) =>
                w.tokens
                    .filter((tok) => tok.features.root || tok.features.lemma)
                    .map((tok) => ({
                        key: `${w.word}-${tok.token}`,
                        arabic: tok.form_arabic,
                        root: tok.features.root,
                        lemma: tok.features.lemma,
                        letters: (tok.features.root ?? "").split(""),
                    })),
            ),
    );

    function isSelected(row: (typeof rows)[number]): boolean {
        return !!selection && selection.root === row.root && selection.lemma === row.lemma;
    }
</script>

<div
    class="rounded-2xl border border-brand-sand-200 bg-white p-3.5 dark:border-[#414559] dark:bg-[#292c3c]"
>
    <div class="mb-2 flex items-center gap-2">
        <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-gold-50 text-brand-gold-500 dark:bg-[#3a3428] dark:text-[#e5c890]"
        >
            <Icon icon="solar:branching-paths-down-bold-duotone" width="0.85rem" />
        </span>
        <h3 class="text-[0.71875rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
            {$t("arabicStudy.node.root_lemma")}
        </h3>
    </div>
    {#if !rows.length}
        <p class="py-2 text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]">
            {$t("arabicStudy.node.no_roots")}
        </p>
    {:else}
        <div class="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {#each rows as row (row.key)}
                <button
                    onclick={() =>
                        onSelect({ root: row.root, lemma: row.lemma, arabic: row.arabic })}
                    class="flex cursor-pointer items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors {isSelected(
                        row,
                    )
                        ? 'border-brand-gold-400 bg-brand-gold-50 dark:border-[#e5c890]/50 dark:bg-[#e5c890]/10'
                        : 'border-transparent hover:bg-brand-sand-50 dark:hover:bg-[#363a4f]'}"
                >
                    <span
                        dir="rtl"
                        class="w-14 shrink-0 text-right font-scheherazade text-base text-brand-charcoal-900 dark:text-[#c6d0f5]"
                    >
                        {row.arabic}
                    </span>
                    <span class="flex shrink-0 items-center gap-0.5" dir="rtl">
                        {#each row.letters as letter (letter)}
                            <span
                                class="flex h-5 w-5 items-center justify-center rounded-md bg-brand-sand-50 font-scheherazade text-sm text-brand-charcoal-500 dark:bg-[#1e2030] dark:text-[#a5adce]"
                            >
                                {letter}
                            </span>
                        {/each}
                    </span>
                    {#if row.lemma}
                        <span
                            dir="rtl"
                            class="ml-auto truncate font-scheherazade text-sm text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {row.lemma}
                        </span>
                    {/if}
                </button>
            {/each}
        </div>
    {/if}
</div>
