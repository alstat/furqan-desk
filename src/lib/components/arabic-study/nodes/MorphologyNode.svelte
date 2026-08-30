<!-- Word-by-word morphology breakdown for the studied ayah — one chip per
     token (a word can carry a prefix/stem/suffix as separate tokens), color
     coded by part of speech using the same table the word popover uses. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import { getTokenStyle, POS_LABELS } from "$lib/utils/morphology-style";
    import type { MorphWord } from "$lib/types/morphology";

    interface Props {
        words: MorphWord[];
    }
    let { words }: Props = $props();

    const rows = $derived(
        words.flatMap((w) =>
            w.tokens.map((tok) => ({
                key: `${w.word}-${tok.token}`,
                arabic: tok.form_arabic,
                pos: tok.features.pos,
                style: getTokenStyle(tok.features.pos ?? ""),
            })),
        ),
    );

    function posLabel(pos: string | null): string {
        if (!pos) return $t("arabicStudy.node.unknown_pos");
        const key = `morphology.pos.${pos.replace(" ", "_")}`;
        const translated = $t(key);
        return translated !== key ? translated : (POS_LABELS[pos] ?? pos);
    }
</script>

<div
    class="rounded-2xl border border-brand-sand-200 bg-white p-3.5 dark:border-[#414559] dark:bg-[#292c3c]"
>
    <div class="mb-2 flex items-center gap-2">
        <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-gold-100 text-brand-gold-600 dark:bg-[#414559] dark:text-[#e5c890]"
        >
            <Icon icon="solar:widget-5-bold-duotone" width="0.85rem" />
        </span>
        <h3 class="text-[0.71875rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
            {$t("arabicStudy.node.morphology")}
        </h3>
        <span
            class="ml-auto rounded-full bg-brand-sand-100 px-2 py-0.5 text-[0.59375rem] font-bold text-brand-charcoal-300 dark:bg-[#363a4f] dark:text-[#838ba7]"
        >
            {words.length}
        </span>
    </div>
    <div class="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
        {#each rows as row (row.key)}
            <div
                class="flex items-center gap-2 border-t border-brand-sand-100 py-1.5 first:border-t-0 dark:border-[#363a4f]"
            >
                <span
                    class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.5625rem] font-bold {row
                        .style.badge}"
                >
                    <span class="h-1.5 w-1.5 shrink-0 rounded-full {row.style.dot}"></span>
                    {posLabel(row.pos)}
                </span>
                <span
                    dir="rtl"
                    class="flex-1 text-right font-scheherazade text-[1.0625rem] text-brand-charcoal-900 dark:text-[#c6d0f5]"
                >
                    {row.arabic}
                </span>
            </div>
        {/each}
    </div>
</div>
