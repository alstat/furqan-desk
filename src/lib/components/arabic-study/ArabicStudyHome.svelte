<!-- Arabic Study's entry point: a proficiency picker on first open, or a
     short summary (with the option to change level) on every open after
     that. Window chrome matches VerseStudyCanvas/ManuscriptViewer. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { LOCALE_NAMES, t } from "$lib/i18n";
    import WindowControls from "$lib/components/shared/WindowControls.svelte";
    import RecitationPlayer from "$lib/components/parchment/RecitationPlayer.svelte";
    import AlphabetLesson from "./AlphabetLesson.svelte";
    import PairingLesson from "./PairingLesson.svelte";
    import ThreeLetterWords from "./ThreeLetterWords.svelte";
    import AlifFormsLesson from "./AlifFormsLesson.svelte";
    import TajweedLesson from "./TajweedLesson.svelte";
    import GrammarCurriculum from "./GrammarCurriculum.svelte";
    import { isPro } from "$lib/stores/auth.store";
    import {
        GLOSS_LANGUAGES,
        OTHER_GLOSS,
        customGlossLanguage,
        glossFailed,
        glossLanguage,
        glossModel,
        glossTranslating,
        requestGlossTranslation,
    } from "$lib/stores/arabic-study-gloss.store";
    import {
        grammarLanguage,
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
    let lesson = $state<
        "alphabet" | "pairing" | "words" | "alifForms" | "tajweed" | "grammar" | null
    >(null);

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

    // Word-by-word language, shown in the header while a lesson is open so the
    // one choice covers every lesson in the wizard.
    let modelMenuOpen = $state(false);
    const glossSelectClass =
        "cursor-pointer appearance-none rounded-lg border border-brand-gold-200 bg-white/70 py-0.5 pl-2 pr-6 text-[0.625rem] font-semibold text-brand-charcoal-500 outline-none focus:border-brand-gold-400 dark:border-[#5a5030] dark:bg-[#292c3c] dark:text-[#c6d0f5]";

    // Same list Settings offers for the app's own language, ordered the same way.
    const LESSON_LANGUAGES = Object.entries(LOCALE_NAMES).sort(([, a], [, b]) =>
        a.localeCompare(b),
    );

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
                    icon="solar:square-academic-cap-bold-duotone"
                    width="1.1rem"
                    class="text-brand-gold-500"
                />
                <span
                    class="py-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-charcoal-500 dark:text-[#838ba7]"
                >
                    {$t("arabicStudy.open")}
                </span>
            </div>
            <div class="ml-auto flex min-w-0 items-center gap-1.5">
                {#if lesson !== null && lesson !== "grammar"}
                    <span
                        class="hidden text-[0.5625rem] font-bold uppercase tracking-wide text-brand-charcoal-400 sm:block dark:text-[#838ba7]"
                    >
                        {$t("arabicStudy.words.gloss_language")}
                    </span>
                    <div class="relative flex">
                        <select
                            bind:value={$glossLanguage}
                            aria-label={$t("arabicStudy.words.gloss_language")}
                            class={glossSelectClass}
                        >
                            {#each GLOSS_LANGUAGES as [value, labelKey] (value)}
                                <option {value}>{$t(labelKey)}</option>
                            {/each}
                            <option value={OTHER_GLOSS}>{$t("arabicStudy.words.gloss_other")}</option>
                        </select>
                        <span
                            class="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-brand-charcoal-300"
                        >
                            <Icon icon="charm:chevron-down" width="0.65rem" />
                        </span>
                    </div>
                    {#if $glossLanguage === OTHER_GLOSS}
                        {#if $isPro}
                            <input
                                bind:value={$customGlossLanguage}
                                placeholder={$t("arabicStudy.words.gloss_other_placeholder")}
                                onkeydown={(event) => {
                                    if (event.key === "Enter") requestGlossTranslation();
                                }}
                                class="w-28 rounded-lg border border-brand-gold-200 bg-white/70 px-2 py-0.5 text-[0.625rem] text-brand-charcoal-600 outline-none focus:border-brand-gold-400 dark:border-[#5a5030] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                            />
                            <!-- The model rides with the button that spends it. -->
                            <div class="relative flex">
                                <button
                                    onclick={requestGlossTranslation}
                                    disabled={$customGlossLanguage.trim() === "" || $glossTranslating}
                                    class="flex cursor-pointer items-center gap-1 rounded-l-lg border border-brand-gold-200 bg-brand-gold-100 px-2 py-0.5 text-[0.625rem] font-semibold text-brand-gold-600 transition-colors hover:bg-brand-gold-200/70 disabled:cursor-default disabled:opacity-50 dark:border-[#5a5030] dark:bg-[#34302a] dark:text-[#e5c890]"
                                >
                                    {#if $glossTranslating}
                                        <Icon icon="svg-spinners:180-ring-with-bg" width="0.7rem" />
                                    {/if}
                                    {$t("arabicStudy.words.gloss_other_apply")}
                                </button>
                                <button
                                    onclick={() => (modelMenuOpen = !modelMenuOpen)}
                                    disabled={$glossTranslating}
                                    title={$glossModel === "advanced"
                                        ? $t("arabicStudy.grammar.model_advanced_hint")
                                        : $t("arabicStudy.grammar.model_standard_hint")}
                                    aria-label={$glossModel === "advanced"
                                        ? $t("arabicStudy.grammar.model_advanced")
                                        : $t("arabicStudy.grammar.model_standard")}
                                    class="flex cursor-pointer items-center gap-0.5 rounded-r-lg border border-l-0 border-brand-gold-200 bg-brand-gold-100 pl-1 pr-1.5 text-brand-gold-600 transition-colors hover:bg-brand-gold-200/70 disabled:cursor-default disabled:opacity-50 dark:border-[#5a5030] dark:bg-[#34302a] dark:text-[#e5c890]"
                                >
                                    <Icon
                                        icon={$glossModel === "advanced"
                                            ? "solar:bolt-bold-duotone"
                                            : "solar:bolt-linear"}
                                        width="0.7rem"
                                    />
                                    <Icon
                                        icon="solar:alt-arrow-down-bold"
                                        width="0.55rem"
                                        class={modelMenuOpen ? "rotate-180" : ""}
                                    />
                                </button>
                                {#if modelMenuOpen}
                                    <!-- svelte-ignore a11y_no_redundant_roles -->
                                    <button
                                        type="button"
                                        tabindex="-1"
                                        aria-label={$t("common.close")}
                                        class="fixed inset-0 z-10 cursor-default"
                                        onclick={() => (modelMenuOpen = false)}
                                    ></button>
                                    <div
                                        class="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-xl border border-brand-sand-200 bg-white py-1 shadow-lg dark:border-[#414559] dark:bg-[#303446]"
                                    >
                                        {#each ["standard", "advanced"] as const as option (option)}
                                            <button
                                                onclick={() => {
                                                    glossModel.set(option);
                                                    modelMenuOpen = false;
                                                }}
                                                class="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-left text-[0.625rem] font-semibold transition-colors hover:bg-brand-sand-100 dark:hover:bg-[#414559] {$glossModel ===
                                                option
                                                    ? 'text-brand-gold-600 dark:text-[#e5c890]'
                                                    : 'text-brand-charcoal-500 dark:text-[#c6d0f5]'}"
                                            >
                                                <Icon
                                                    icon={option === "advanced"
                                                        ? "solar:bolt-bold-duotone"
                                                        : "solar:bolt-linear"}
                                                    width="0.65rem"
                                                />
                                                {option === "advanced"
                                                    ? $t("arabicStudy.grammar.model_advanced")
                                                    : $t("arabicStudy.grammar.model_standard")}
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                            {#if $glossFailed}
                                <span
                                    class="whitespace-nowrap text-[0.625rem] text-red-500 dark:text-red-400"
                                    title={$t("arabicStudy.words.gloss_error")}
                                >
                                    {$t("arabicStudy.words.gloss_error_short")}
                                </span>
                            {/if}
                        {:else}
                            <span
                                class="whitespace-nowrap text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]"
                                title={$t("arabicStudy.words.gloss_ai_required")}
                            >
                                {$t("arabicStudy.words.gloss_ai_required_short")}
                            </span>
                        {/if}
                    {/if}
                {:else if lesson === "grammar"}
                    <span
                        class="hidden text-[0.5625rem] font-bold uppercase tracking-wide text-brand-charcoal-400 sm:block dark:text-[#838ba7]"
                    >
                        {$t("arabicStudy.grammar.language")}
                    </span>
                    <div class="relative flex">
                        <select
                            bind:value={$grammarLanguage}
                            aria-label={$t("arabicStudy.grammar.language")}
                            class={glossSelectClass}
                        >
                            {#each LESSON_LANGUAGES as [code, name] (code)}
                                <option value={code}>{name}</option>
                            {/each}
                        </select>
                        <span
                            class="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-brand-charcoal-300"
                        >
                            <Icon icon="charm:chevron-down" width="0.65rem" />
                        </span>
                    </div>
                {/if}
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
                onContinue={() => (lesson = "words")}
            />
        {:else if lesson === "words"}
            <ThreeLetterWords
                onBack={() => (lesson = "pairing")}
                onContinue={() => (lesson = "alifForms")}
            />
        {:else if lesson === "alifForms"}
            <AlifFormsLesson
                onBack={() => (lesson = "words")}
                onContinue={() => (lesson = "tajweed")}
            />
        {:else if lesson === "tajweed"}
            <TajweedLesson
                onBack={() => (lesson = "alifForms")}
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
        <!-- AI is in play on every beginner page once meanings are translated by
             it, and on every page of the grammar curriculum, which is written by
             it — so the caveat sits in the chrome all of them share, under
             whichever footer the current lesson draws. -->
        {#if lesson !== null && (lesson === "grammar" || $glossLanguage === OTHER_GLOSS)}
            <div
                class="flex shrink-0 items-center justify-center gap-1.5 border-t border-brand-sand-200 bg-brand-sand-50 px-4 py-1 text-[0.625rem] text-brand-charcoal-400 dark:border-[#414559] dark:bg-[#232634] dark:text-[#838ba7]"
            >
                <Icon icon="solar:info-circle-linear" width="0.7rem" class="shrink-0" />
                {$t("arabicStudy.ai_disclaimer")}
            </div>
        {/if}
        {#if standalone}
            <RecitationPlayer scrollContainer={null} showControls={false} />
        {/if}
    </div>
{/if}
