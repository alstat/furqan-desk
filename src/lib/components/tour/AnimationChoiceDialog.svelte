<script lang="ts">
    import Icon from "@iconify/svelte";
    import { fade } from "svelte/transition";
    import { t } from "$lib/i18n";
    import { animationPromptOpen } from "$lib/stores/tour.store";
    import {
        animationsEnabled,
        markAnimationChoiceMade,
    } from "$lib/stores/animations.store";

    // Asked once, at the end of first-run setup: the tour has just shown the
    // app moving, so the reader knows what they are choosing between.
    function choose(on: boolean) {
        animationsEnabled.set(on);
        markAnimationChoiceMade();
        animationPromptOpen.set(false);
    }

    const primaryBtn =
        "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full bg-brand-gold-400 hover:bg-brand-gold-500 active:bg-brand-gold-600 text-gray-100 dark:text-gray-800 border border-transparent transition-colors";
    const secondaryBtn =
        "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full border border-slate-200 dark:border-[#414559] hover:bg-slate-100 dark:hover:bg-[#414559] text-slate-600 dark:text-[#c6d0f5] transition-colors";
</script>

{#if $animationPromptOpen}
    <div
        transition:fade={{ duration: 150 }}
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
    >
        <div
            class="mx-4 w-full max-w-sm rounded-xl border border-slate-100 dark:border-[#414559] bg-white dark:bg-[#303446] p-5 shadow-2xl"
        >
            <div class="flex items-center gap-2 mb-1.5">
                <Icon
                    icon="solar:magic-stick-3-bold-duotone"
                    class="text-brand-gold-400 shrink-0"
                    width="1.1rem"
                />
                <h3
                    class="text-sm font-semibold text-slate-700 dark:text-[#c6d0f5]"
                >
                    {$t("animation_prompt.title")}
                </h3>
            </div>
            <p
                class="text-xs text-slate-500 dark:text-[#838ba7] leading-relaxed mb-4"
            >
                {$t("animation_prompt.body")}
            </p>
            <div class="flex flex-wrap gap-2">
                <button class={primaryBtn} onclick={() => choose(true)}>
                    {$t("animation_prompt.keep")}
                </button>
                <button class={secondaryBtn} onclick={() => choose(false)}>
                    {$t("animation_prompt.disable")}
                </button>
            </div>
            <p
                class="mt-3 text-[0.6875rem] leading-relaxed text-slate-400 dark:text-[#838ba7]"
            >
                {$t("animation_prompt.note")}
            </p>
        </div>
    </div>
{/if}
