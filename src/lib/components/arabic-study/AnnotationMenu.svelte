<!--
  The small "Comment / Prompt" menu that pops up when a lesson card is
  clicked. `x`/`y` are already clamped to the viewport by the caller. Picking
  Comment or Prompt swaps the menu to a second step — which side of the
  lesson the new card should open on — rather than defaulting every card to
  the same side.
-->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";

    interface Props {
        x: number;
        y: number;
        onChoose: (kind: "comment" | "prompt", side: "left" | "right") => void;
        onClose: () => void;
    }
    let { x, y, onChoose, onClose }: Props = $props();

    let kind = $state<"comment" | "prompt" | null>(null);
</script>

<div
    role="presentation"
    class="fixed inset-0"
    style="z-index: 9998;"
    onclick={onClose}
    oncontextmenu={(e) => {
        e.preventDefault();
        onClose();
    }}
></div>
<div
    style="position: fixed; left: {x}px; top: {y}px; z-index: 9999;"
    class="min-w-40 rounded-2xl border border-brand-sand-200 bg-brand-sand-50 p-1.5 shadow-xl dark:border-[#414559] dark:bg-[#292c3c]"
>
    {#if kind === null}
        <button
            onclick={() => (kind = "comment")}
            class="flex w-full cursor-pointer items-center gap-2 rounded-full p-1 px-3 text-xs text-brand-charcoal-500 hover:bg-brand-sand-200 hover:text-brand-charcoal-900 dark:text-[#8087a2] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:notes-bold-duotone" width="0.85rem" class="shrink-0" />
            {$t("arabicStudy.grammar.annotation_comment")}
        </button>
        <button
            onclick={() => (kind = "prompt")}
            class="flex w-full cursor-pointer items-center gap-2 rounded-full p-1 px-3 text-xs text-brand-charcoal-500 hover:bg-brand-sand-200 hover:text-brand-charcoal-900 dark:text-[#8087a2] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:magic-stick-3-bold-duotone" width="0.85rem" class="shrink-0" />
            {$t("arabicStudy.grammar.annotation_prompt")}
        </button>
    {:else}
        {@const chosenKind = kind}
        <button
            onclick={() => (kind = null)}
            class="mb-1 flex w-full cursor-pointer items-center gap-1.5 rounded-full p-1 px-3 text-[0.6875rem] font-semibold text-brand-charcoal-400 hover:text-brand-charcoal-700 dark:text-[#838ba7] dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:arrow-left-linear" width="0.7rem" />
            {kind === "comment"
                ? $t("arabicStudy.grammar.annotation_comment")
                : $t("arabicStudy.grammar.annotation_prompt")}
        </button>
        <p class="px-3 pb-1 text-[0.5625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#626880]">
            {$t("arabicStudy.grammar.annotation_side_prompt")}
        </p>
        <button
            onclick={() => onChoose(chosenKind, "left")}
            class="flex w-full cursor-pointer items-center gap-2 rounded-full p-1 px-3 text-xs text-brand-charcoal-500 hover:bg-brand-sand-200 hover:text-brand-charcoal-900 dark:text-[#8087a2] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:round-alt-arrow-left-linear" width="0.85rem" class="shrink-0" />
            {$t("arabicStudy.grammar.annotation_side_left")}
        </button>
        <button
            onclick={() => onChoose(chosenKind, "right")}
            class="flex w-full cursor-pointer items-center gap-2 rounded-full p-1 px-3 text-xs text-brand-charcoal-500 hover:bg-brand-sand-200 hover:text-brand-charcoal-900 dark:text-[#8087a2] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:round-alt-arrow-right-linear" width="0.85rem" class="shrink-0" />
            {$t("arabicStudy.grammar.annotation_side_right")}
        </button>
    {/if}
</div>
