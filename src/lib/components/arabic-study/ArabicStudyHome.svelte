<!-- Arabic Study's entry point: a proficiency picker on first open, or a
     short summary (with the option to change level) on every open after
     that. Window chrome matches VerseStudyCanvas/ManuscriptViewer. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import WindowControls from "$lib/components/shared/WindowControls.svelte";
    import AlphabetLesson from "./AlphabetLesson.svelte";
    import PairingLesson from "./PairingLesson.svelte";
    import GrammarCurriculum from "./GrammarCurriculum.svelte";
    import {
        proficiencyLevel,
        saveProficiencyLevel,
        hydrateProficiencyLevel,
        type ProficiencyLevel,
    } from "$lib/stores/arabic-study.store";

    interface Props {
        open: boolean;
        onClose: () => void;
        standalone?: boolean;
    }
    let { open, onClose, standalone = false }: Props = $props();

    const isMac =
        typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

    $effect(() => {
        if ($proficiencyLevel === undefined) void hydrateProficiencyLevel();
    });

    let saving = $state(false);
    let changing = $state(false);
    // "beginner" ("New to Arabic") gets the alphabet/pairing curriculum;
    // intermediate/advanced get the AI-generated grammar curriculum.
    let lesson = $state<"alphabet" | "pairing" | "grammar" | null>(null);

    async function pick(level: ProficiencyLevel) {
        saving = true;
        try {
            await saveProficiencyLevel(level);
            changing = false;
        } finally {
            saving = false;
        }
    }

    function startLearning() {
        lesson = $proficiencyLevel === "beginner" ? "alphabet" : "grammar";
    }

    const LEVELS: { id: ProficiencyLevel; icon: string; titleKey: string; descKey: string }[] = [
        {
            id: "beginner",
            icon: "solar:pen-new-square-bold-duotone",
            titleKey: "arabicStudy.onboarding.level_beginner",
            descKey: "arabicStudy.onboarding.level_beginner_desc",
        },
        {
            id: "intermediate",
            icon: "solar:book-bookmark-bold-duotone",
            titleKey: "arabicStudy.onboarding.level_intermediate",
            descKey: "arabicStudy.onboarding.level_intermediate_desc",
        },
        {
            id: "advanced",
            icon: "solar:medal-star-bold-duotone",
            titleKey: "arabicStudy.onboarding.level_advanced",
            descKey: "arabicStudy.onboarding.level_advanced_desc",
        },
    ];
</script>

{#if open}
    <div class="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-[#303446]">
        <div
            data-tauri-drag-region={standalone ? true : undefined}
            class="flex shrink-0 select-none items-center justify-between gap-2 border-b border-brand-gold-200 bg-brand-gold-100 px-4 py-1.5 dark:border-[#414559] dark:bg-[#292c3c]"
            style:padding-left={standalone && isMac ? "5rem" : undefined}
        >
            <div class="flex items-center gap-2" data-tauri-drag-region={standalone ? true : undefined}>
                <Icon
                    icon="solar:square-academic-cap-2-bold-duotone"
                    width="1.1rem"
                    class="text-brand-gold-500"
                />
                <span
                    class="py-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-charcoal-500 dark:text-[#838ba7]"
                >
                    {$t("arabicStudy.open")}
                </span>
            </div>
            {#if !standalone}
                <button
                    onclick={onClose}
                    class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg bg-brand-gold-200 text-brand-gold-600 transition-colors hover:bg-brand-gold-200/80 dark:bg-[#414559] dark:text-[#c6d0f5] dark:hover:bg-[#51576d]"
                    aria-label={$t("common.close")}
                >
                    <Icon icon="solar:close-circle-bold-duotone" width="0.85rem" />
                </button>
            {/if}
            {#if standalone && !isMac}
                <div class="-my-1.5 -mr-2 flex self-stretch">
                    <WindowControls />
                </div>
            {/if}
        </div>

        {#if lesson === "alphabet"}
            <AlphabetLesson
                onBack={() => (lesson = null)}
                onContinue={() => (lesson = "pairing")}
            />
        {:else if lesson === "pairing"}
            <PairingLesson
                onBack={() => (lesson = "alphabet")}
                onDone={() => (lesson = null)}
            />
        {:else if lesson === "grammar" && ($proficiencyLevel === "intermediate" || $proficiencyLevel === "advanced")}
            <GrammarCurriculum level={$proficiencyLevel} onBack={() => (lesson = null)} />
        {:else}
        <div class="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-8 text-center">
            {#if $proficiencyLevel === undefined}
                <Icon
                    icon="svg-spinners:3-dots-fade"
                    class="text-brand-gold-500 dark:text-[#e5c890]"
                    width="1.6rem"
                />
            {:else if $proficiencyLevel === null || changing}
                <div class="flex flex-col items-center gap-1.5">
                    <div
                        class="mb-1 font-scheherazade text-4xl text-brand-gold-600 dark:text-[#e5c890]"
                        dir="rtl"
                    >
                        اِقْرَأْ
                    </div>
                    <h1 class="text-lg font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                        {$t("arabicStudy.onboarding.title")}
                    </h1>
                    <p class="max-w-sm text-[0.75rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                        {$t("arabicStudy.onboarding.subtitle")}
                    </p>
                </div>
                <div class="flex w-full max-w-sm flex-col gap-2.5">
                    {#each LEVELS as lvl (lvl.id)}
                        <button
                            onclick={() => pick(lvl.id)}
                            disabled={saving}
                            class="flex cursor-pointer items-center gap-3 rounded-2xl border border-brand-sand-200 bg-white px-4 py-3 text-left transition-colors hover:border-brand-gold-300 hover:bg-brand-gold-50 disabled:opacity-50 dark:border-[#414559] dark:bg-[#292c3c] dark:hover:border-[#e5c890]/40"
                        >
                            <span
                                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gold-100 text-brand-gold-600 dark:bg-[#414559] dark:text-[#e5c890]"
                            >
                                <Icon icon={lvl.icon} width="1.1rem" />
                            </span>
                            <span class="min-w-0 flex-1">
                                <span
                                    class="block text-[0.8125rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                >
                                    {$t(lvl.titleKey)}
                                </span>
                                <span
                                    class="block text-[0.6875rem] text-brand-charcoal-400 dark:text-[#838ba7]"
                                >
                                    {$t(lvl.descKey)}
                                </span>
                            </span>
                        </button>
                    {/each}
                </div>
            {:else}
                <div class="flex flex-col items-center gap-2">
                    <Icon
                        icon="solar:check-circle-bold-duotone"
                        class="text-brand-gold-500 dark:text-[#e5c890]"
                        width="1.8rem"
                    />
                    <h1 class="text-base font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                        {$t("arabicStudy.onboarding.set_title", {
                            level: $t(`arabicStudy.onboarding.level_${$proficiencyLevel}`),
                        })}
                    </h1>
                    <p class="max-w-sm text-[0.75rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                        {$proficiencyLevel === "beginner"
                            ? $t("arabicStudy.onboarding.set_hint_beginner")
                            : $t("arabicStudy.onboarding.set_hint_grammar")}
                    </p>
                    <div class="mt-2 flex items-center gap-2">
                        <button
                            onclick={startLearning}
                            class="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-gold-400 px-4 py-1.5 text-[0.6875rem] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400"
                        >
                            <Icon icon="solar:magic-stick-3-bold-duotone" width="0.8rem" />
                            {$t("arabicStudy.onboarding.start_learning")}
                        </button>
                        <button
                            onclick={() => (changing = true)}
                            class="cursor-pointer rounded-full border border-brand-sand-200 bg-brand-sand-100 px-3.5 py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-500 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                        >
                            {$t("arabicStudy.onboarding.change_level")}
                        </button>
                    </div>
                </div>
            {/if}
        </div>
        {/if}
    </div>
{/if}
