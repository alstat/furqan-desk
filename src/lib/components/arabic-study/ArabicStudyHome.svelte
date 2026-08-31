<!-- Arabic Study's entry point: a proficiency picker on first open, or a
     short summary (with the option to change level) on every open after
     that. Window chrome matches VerseStudyCanvas/ManuscriptViewer. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { LOCALE_NAMES, plural, t } from "$lib/i18n";
    import WindowControls from "$lib/components/shared/WindowControls.svelte";
    import RecitationPlayer from "$lib/components/parchment/RecitationPlayer.svelte";
    import AlphabetLesson from "./AlphabetLesson.svelte";
    import PairingLesson from "./PairingLesson.svelte";
    import ThreeLetterWords from "./ThreeLetterWords.svelte";
    import AlifFormsLesson from "./AlifFormsLesson.svelte";
    import TajweedLesson from "./TajweedLesson.svelte";
    import GrammarCurriculum from "./GrammarCurriculum.svelte";
    import { untrack } from "svelte";
    import { get } from "svelte/store";
    import { isPro } from "$lib/stores/auth.store";
    import { ARABIC_ALPHABET } from "$lib/data/arabic-alphabet";
    import { ALIF_FORMS } from "$lib/data/alif-forms";
    import { TAJWEED_RULES } from "$lib/data/tajweed-rules";
    import { THREE_LETTER_WORDS } from "$lib/data/three-letter-words";
    import { topicsForLevel } from "$lib/data/arabic-grammar-topics";
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
        fetchLetterProgress,
        fetchStudyActivity,
        fetchTopicContent,
        fetchTopicSections,
        grammarLanguage,
        proficiencyLevel,
        STUDY_AREA,
        activeVersionId,
        lessonVersions,
        type LetterProgress,
        type StudyActivity,
        type TopicContent,
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

    // ── Progress, per level ─────────────────────────────────────────────────
    //
    // Everything here is read from what the app already records: the letter
    // table the alphabet lesson writes to, and the cached-lesson and
    // reader-section tables the grammar curriculum writes to. Nothing new is
    // tracked, so the numbers can't drift from what actually happened.
    let letterProgress = $state<LetterProgress[]>([]);
    let activity = $state<StudyActivity[]>([]);
    let generatedTopics = $state<TopicContent[]>([]);
    let sectionCount = $state(0);

    const beginnerStats = $derived.by(() => {
        const practised = letterProgress.filter((row) => row.practiced_at).length;
        const mastered = letterProgress.filter((row) => row.mastered).length;
        return { practised, mastered, total: ARABIC_ALPHABET.length };
    });

    /** The four vowels the pairing lesson drills, in the order it shows them. */
    const HARAKAT = [
        { key: "fatha", labelKey: "arabicStudy.pairing.fatha" },
        { key: "kasra", labelKey: "arabicStudy.pairing.kasra" },
        { key: "damma", labelKey: "arabicStudy.pairing.damma" },
        { key: "sukun", labelKey: "arabicStudy.pairing.sukun" },
    ] as const;

    /** area -> item -> times worked through. */
    const activityIndex = $derived.by(() => {
        const index = new Map<string, Map<string, number>>();
        for (const row of activity) {
            const area = index.get(row.area) ?? new Map<string, number>();
            area.set(row.item, row.seen_count);
            index.set(row.area, area);
        }
        return index;
    });

    const countFor = (area: string, item: string) =>
        activityIndex.get(area)?.get(item) ?? 0;

    /** Coverage of each beginner area: how much of it has been opened. */
    const coverage = $derived.by(() => {
        const pairs = activityIndex.get(STUDY_AREA.pairing)?.size ?? 0;
        return [
            {
                labelKey: "arabicStudy.stats.pairs_seen",
                done: pairs,
                total: ARABIC_ALPHABET.length * HARAKAT.length,
            },
            {
                labelKey: "arabicStudy.stats.tajweed_seen",
                done: activityIndex.get(STUDY_AREA.tajweed)?.size ?? 0,
                total: TAJWEED_RULES.length,
            },
            {
                labelKey: "arabicStudy.stats.forms_seen",
                done: activityIndex.get(STUDY_AREA.alifForms)?.size ?? 0,
                total: ALIF_FORMS.length,
            },
            {
                labelKey: "arabicStudy.stats.words_seen",
                done: activityIndex.get(STUDY_AREA.words)?.size ?? 0,
                total: THREE_LETTER_WORDS.length,
            },
        ];
    });

    /**
     * One hue, four steps, light to dark — the grid encodes how often a pair
     * has been studied, which is magnitude, not identity. The unstudied step is
     * the surface's own neutral so absence reads as empty rather than as a
     * colour with meaning.
     */
    function pairShade(count: number): string {
        if (count === 0) return "bg-brand-sand-200 dark:bg-[#414559]";
        if (count === 1) return "bg-brand-gold-200 dark:bg-[#5a5030]";
        if (count < 4) return "bg-brand-gold-400 dark:bg-[#a58a4a]";
        return "bg-brand-gold-600 dark:bg-[#e5c890]";
    }

    const grammarStats = $derived.by(() => {
        const level = $proficiencyLevel;
        if (level == null) {
            return { generated: 0, total: 0, languages: 0, opened: 0, exercises: 0, followUps: 0 };
        }
        const topics = topicsForLevel(level);
        const ids = new Set(topics.map((topic) => topic.id));
        const mine = generatedTopics.filter((row) => ids.has(row.topic_id));
        const opened = activityIndex.get(STUDY_AREA.topics);
        const exercises = activityIndex.get(STUDY_AREA.exercises);
        const followUps = activityIndex.get(STUDY_AREA.followUps);
        const sumFor = (map: Map<string, number> | undefined, matches: (item: string) => boolean) => {
            let total = 0;
            for (const [item, count] of map ?? []) if (matches(item)) total += count;
            return total;
        };
        return {
            generated: new Set(mine.map((row) => row.topic_id)).size,
            total: ids.size,
            languages: new Set(mine.map((row) => row.locale)).size,
            opened: [...(opened?.keys() ?? [])].filter((id) => ids.has(id)).length,
            exercises: sumFor(exercises, (item) => ids.has(item.split(":")[0])),
            followUps: sumFor(followUps, (item) => ids.has(item)),
        };
    });

    /** The tooltip a topic cell carries, counts agreeing with their nouns. */
    function topicCellLabel(cell: {
        topic: { label: string };
        opened: number;
        exercises: number;
        followUps: number;
        work: number;
    }): string {
        if (!cell.work) {
            return $t("arabicStudy.stats.topic_cell_none", { topic: cell.topic.label });
        }
        return $t("arabicStudy.stats.topic_cell", {
            topic: cell.topic.label,
            opened: String(cell.opened),
            exercises: $plural("arabicStudy.stats.count_exercises", cell.exercises),
            followUps: $plural("arabicStudy.stats.count_follow_ups", cell.followUps),
        });
    }

    /** One cell per topic of the current level, shaded by how much work it has had. */
    const topicCells = $derived.by(() => {
        const level = $proficiencyLevel;
        if (level == null) return [];
        return topicsForLevel(level).map((topic) => {
            const opened = countFor(STUDY_AREA.topics, topic.id);
            const followUps = countFor(STUDY_AREA.followUps, topic.id);
            let exercises = 0;
            for (const [item, count] of activityIndex.get(STUDY_AREA.exercises) ?? []) {
                if (item.split(":")[0] === topic.id) exercises += count;
            }
            return { topic, opened, exercises, followUps, work: opened + exercises + followUps };
        });
    });

    // Reload whenever the summary is on screen: coming back from a lesson is
    // exactly when these numbers have changed.
    $effect(() => {
        if (lesson !== null || $proficiencyLevel == null) return;
        const level = $proficiencyLevel;
        void untrack(async () => {
            try {
                const [rows, activityRows, letters] = await Promise.all([
                    fetchTopicContent(),
                    fetchStudyActivity(),
                    level === "beginner" ? fetchLetterProgress() : Promise.resolve([]),
                ]);
                generatedTopics = rows;
                activity = activityRows;
                letterProgress = letters;
                const ids = topicsForLevel(level).map((topic) => topic.id);
                const perTopic = await Promise.all(
                    ids.map((id) =>
                        fetchTopicSections(id, get(grammarLanguage)).catch(() => []),
                    ),
                );
                sectionCount = perTopic.reduce((sum, list) => sum + list.length, 0);
            } catch {
                // No database here (browser dev) — leave the panel empty.
            }
        });
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
                    <!-- Every regeneration is kept, so the reader can go back to
                         a lesson they preferred. The shipped English lesson is
                         version 1. -->
                    {#if $lessonVersions.length > 0}
                        <span
                            class="hidden text-[0.5625rem] font-bold uppercase tracking-wide text-brand-charcoal-400 sm:block dark:text-[#838ba7]"
                        >
                            {$t("arabicStudy.version.label")}
                        </span>
                        <div class="relative flex">
                            <select
                                value={$activeVersionId}
                                onchange={(event) =>
                                    activeVersionId.set(Number(event.currentTarget.value))}
                                aria-label={$t("arabicStudy.version.label")}
                                class={glossSelectClass}
                            >
                                {#each $lessonVersions as version, i (version.id)}
                                    <option value={version.id}>
                                        {version.source === "premade"
                                            ? $t("arabicStudy.version.premade")
                                            : $t("arabicStudy.version.numbered", {
                                                  n: String(i + 1),
                                              })}
                                        · {version.created_at.slice(0, 10)}
                                    </option>
                                {/each}
                            </select>
                            <span
                                class="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-brand-charcoal-300"
                            >
                                <Icon icon="charm:chevron-down" width="0.65rem" />
                            </span>
                        </div>
                    {/if}
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
                onContinue={() => (lesson = "grammar")}
                onDone={() => (lesson = null)}
            />
        {:else if lesson === "grammar" && $proficiencyLevel != null}
            <GrammarCurriculum level={$proficiencyLevel} onBack={() => (lesson = null)} />
        {:else}
        <div class="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-8 py-8 text-center">
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
                    <!-- Progress, read from what the lessons already record -->
                    <div
                        class="mt-3 w-full max-w-lg rounded-2xl border border-brand-sand-200 bg-brand-sand-50 p-3 text-left dark:border-[#414559] dark:bg-[#232634]"
                    >
                        <div class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">
                            {$t("arabicStudy.stats.title")}
                        </div>
                        {#if $proficiencyLevel === "beginner"}
                            {@const stats = beginnerStats}
                            <div class="mt-2 flex items-baseline justify-between gap-2">
                                <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                    {$t("arabicStudy.stats.letters_practiced")}
                                </span>
                                <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                    {stats.practised} / {stats.total}
                                </span>
                            </div>
                            <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-brand-sand-200 dark:bg-[#414559]">
                                <div
                                    class="h-full bg-brand-gold-400 dark:bg-brand-gold-500"
                                    style:width="{(stats.practised / stats.total) * 100}%"
                                ></div>
                            </div>
                            <div class="mt-2 flex items-baseline justify-between gap-2">
                                <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                    {$t("arabicStudy.stats.letters_mastered")}
                                </span>
                                <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                    {stats.mastered} / {stats.total}
                                </span>
                            </div>
                            <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-brand-sand-200 dark:bg-[#414559]">
                                <div
                                    class="h-full bg-brand-emerald-400 dark:bg-[#9dd4c8]"
                                    style:width="{(stats.mastered / stats.total) * 100}%"
                                ></div>
                            </div>
                            <!-- Coverage of each area: single-series magnitude,
                                 so a labelled bar each and no legend. -->
                            <div class="mt-3 flex flex-col gap-2">
                                {#each coverage as row (row.labelKey)}
                                    <div>
                                        <div class="flex items-baseline justify-between gap-2">
                                            <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                                {$t(row.labelKey)}
                                            </span>
                                            <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                                {row.done} / {row.total}
                                            </span>
                                        </div>
                                        <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-brand-sand-200 dark:bg-[#414559]">
                                            <div
                                                class="h-full rounded-full bg-brand-gold-400 dark:bg-brand-gold-500"
                                                style:width="{row.total ? (row.done / row.total) * 100 : 0}%"
                                            ></div>
                                        </div>
                                    </div>
                                {/each}
                            </div>

                            <!-- Every consonant against every vowel. Magnitude
                                 on one hue, light to dark; each cell says what
                                 it is on hover. -->
                            <div class="mt-3">
                                <div class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">
                                    {$t("arabicStudy.stats.pair_grid")}
                                </div>
                                <div class="mt-1.5 flex flex-col gap-1">
                                    {#each HARAKAT as harakah (harakah.key)}
                                        <div class="flex items-center gap-1.5">
                                            <span
                                                class="w-12 shrink-0 truncate text-[0.5625rem] text-brand-charcoal-400 dark:text-[#838ba7]"
                                            >
                                                {$t(harakah.labelKey)}
                                            </span>
                                            <div class="flex flex-1 gap-px">
                                                {#each ARABIC_ALPHABET as letter (letter.id)}
                                                    {@const count = countFor(
                                                        STUDY_AREA.pairing,
                                                        `${letter.id}:${harakah.key}`,
                                                    )}
                                                    <div
                                                        class="h-3 flex-1 rounded-[2px] {pairShade(count)}"
                                                        title={count
                                                            ? $t("arabicStudy.stats.pair_cell", {
                                                                  letter: letter.glyph,
                                                                  vowel: $t(harakah.labelKey),
                                                                  count: String(count),
                                                              })
                                                            : $t("arabicStudy.stats.pair_cell_none", {
                                                                  letter: letter.glyph,
                                                                  vowel: $t(harakah.labelKey),
                                                              })}
                                                        aria-label={count
                                                            ? $t("arabicStudy.stats.pair_cell", {
                                                                  letter: letter.glyph,
                                                                  vowel: $t(harakah.labelKey),
                                                                  count: String(count),
                                                              })
                                                            : $t("arabicStudy.stats.pair_cell_none", {
                                                                  letter: letter.glyph,
                                                                  vowel: $t(harakah.labelKey),
                                                              })}
                                                    ></div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                                <!-- Scale: colour here means "how often", so it
                                     needs saying. -->
                                <div class="mt-2 flex items-center gap-2.5">
                                    {#each [["arabicStudy.stats.scale_none", 0], ["arabicStudy.stats.scale_once", 1], ["arabicStudy.stats.scale_few", 2], ["arabicStudy.stats.scale_many", 4]] as const as [labelKey, sample] (labelKey)}
                                        <span class="flex items-center gap-1 text-[0.5625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                                            <span class="h-2 w-2 rounded-[2px] {pairShade(sample)}"></span>
                                            {$t(labelKey)}
                                        </span>
                                    {/each}
                                </div>
                            </div>
                            <!-- The reading topics that follow the hands-on
                                 lessons, counted the same way as at the other
                                 levels — one cell per topic, shaded by work. -->
                            <div class="mt-3">
                                <div class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">
                                    {$t("arabicStudy.stats.topic_grid")}
                                </div>
                                <div class="mt-1.5 flex items-baseline justify-between gap-2">
                                    <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                        {$t("arabicStudy.stats.topics_opened")}
                                    </span>
                                    <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                        {grammarStats.opened} / {grammarStats.total}
                                    </span>
                                </div>
                                <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-brand-sand-200 dark:bg-[#414559]">
                                    <div
                                        class="h-full rounded-full bg-brand-gold-400 dark:bg-brand-gold-500"
                                        style:width="{grammarStats.total
                                            ? (grammarStats.opened / grammarStats.total) * 100
                                            : 0}%"
                                    ></div>
                                </div>
                                <div class="mt-2 flex items-baseline justify-between gap-2">
                                    <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                        {$t("arabicStudy.stats.exercises_attempted")}
                                    </span>
                                    <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                        {grammarStats.exercises}
                                    </span>
                                </div>
                                <div class="mt-1 flex items-baseline justify-between gap-2">
                                    <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                        {$t("arabicStudy.stats.sections_added")}
                                    </span>
                                    <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                        {sectionCount}
                                    </span>
                                </div>
                                <div class="mt-2 flex flex-wrap gap-1">
                                    {#each topicCells as cell (cell.topic.id)}
                                        <div
                                            class="h-4 w-4 rounded-[3px] {pairShade(cell.work)}"
                                            title={topicCellLabel(cell)}
                                            aria-label={topicCellLabel(cell)}
                                        ></div>
                                    {/each}
                                </div>
                            </div>
                            {#if stats.practised === 0 && coverage.every((row) => row.done === 0)}
                                <p class="mt-2 text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                                    {$t("arabicStudy.stats.empty_beginner")}
                                </p>
                            {/if}
                        {:else}
                            {@const stats = grammarStats}
                            <div class="mt-2 flex items-baseline justify-between gap-2">
                                <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                    {$t("arabicStudy.stats.lessons_generated")}
                                </span>
                                <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                    {stats.generated} / {stats.total}
                                </span>
                            </div>
                            <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-brand-sand-200 dark:bg-[#414559]">
                                <div
                                    class="h-full bg-brand-gold-400 dark:bg-brand-gold-500"
                                    style:width="{stats.total
                                        ? (stats.generated / stats.total) * 100
                                        : 0}%"
                                ></div>
                            </div>
                            <div class="mt-2 flex items-baseline justify-between gap-2">
                                <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                    {$t("arabicStudy.stats.sections_added")}
                                </span>
                                <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                    {sectionCount}
                                </span>
                            </div>
                            <div class="mt-1 flex items-baseline justify-between gap-2">
                                <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                    {$t("arabicStudy.stats.languages")}
                                </span>
                                <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                    {stats.languages}
                                </span>
                            </div>
                            <div class="mt-2 flex items-baseline justify-between gap-2">
                                <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                    {$t("arabicStudy.stats.topics_opened")}
                                </span>
                                <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                    {stats.opened} / {stats.total}
                                </span>
                            </div>
                            <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-brand-sand-200 dark:bg-[#414559]">
                                <div
                                    class="h-full rounded-full bg-brand-gold-400 dark:bg-brand-gold-500"
                                    style:width="{stats.total ? (stats.opened / stats.total) * 100 : 0}%"
                                ></div>
                            </div>
                            <div class="mt-2 flex items-baseline justify-between gap-2">
                                <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                    {$t("arabicStudy.stats.exercises_attempted")}
                                </span>
                                <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                    {stats.exercises}
                                </span>
                            </div>
                            <div class="mt-1 flex items-baseline justify-between gap-2">
                                <span class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                                    {$t("arabicStudy.stats.follow_ups")}
                                </span>
                                <span class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                    {stats.followUps}
                                </span>
                            </div>

                            <!-- One cell per topic, shaded by how much work it
                                 has had — magnitude on one hue, as in the
                                 beginner grid. -->
                            <div class="mt-3">
                                <div class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">
                                    {$t("arabicStudy.stats.topic_grid")}
                                </div>
                                <div class="mt-1.5 flex flex-wrap gap-1">
                                    {#each topicCells as cell (cell.topic.id)}
                                        <div
                                            class="h-4 w-4 rounded-[3px] {pairShade(cell.work)}"
                                            title={topicCellLabel(cell)}
                                            aria-label={topicCellLabel(cell)}
                                        ></div>
                                    {/each}
                                </div>
                                <div class="mt-2 flex items-center gap-2.5">
                                    {#each [["arabicStudy.stats.scale_none", 0], ["arabicStudy.stats.scale_once", 1], ["arabicStudy.stats.scale_few", 2], ["arabicStudy.stats.scale_many", 4]] as const as [labelKey, sample] (labelKey)}
                                        <span class="flex items-center gap-1 text-[0.5625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                                            <span class="h-2 w-2 rounded-[2px] {pairShade(sample)}"></span>
                                            {$t(labelKey)}
                                        </span>
                                    {/each}
                                </div>
                            </div>
                            {#if stats.generated === 0 && stats.opened === 0}
                                <p class="mt-2 text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                                    {$t("arabicStudy.stats.empty_grammar")}
                                </p>
                            {/if}
                        {/if}
                    </div>

                    <div class="mt-2 flex items-center gap-2">
                        <button
                            onclick={startLearning}
                            class="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-gold-400 px-4 py-1.5 text-[0.6875rem] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400"
                        >
                            <Icon icon="solar:magic-stick-3-bold-duotone" width="0.8rem" />
                            {$t("arabicStudy.onboarding.start_learning")}
                        </button>
                        {#if $proficiencyLevel === "beginner"}
                            <button
                                onclick={() => (lesson = "grammar")}
                                class="flex cursor-pointer items-center gap-1.5 rounded-full border border-brand-sand-200 bg-brand-sand-100 px-3.5 py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-500 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                            >
                                <Icon icon="solar:notebook-bold-duotone" width="0.8rem" />
                                {$t("arabicStudy.onboarding.study_topics")}
                            </button>
                        {/if}
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
