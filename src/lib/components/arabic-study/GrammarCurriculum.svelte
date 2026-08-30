<!-- The intermediate/advanced grammar curriculum: pick a topic, get an
     AI-generated lesson (title, explanation, a Qur'anic + an everyday
     example, a short quiz). Content is generated on demand and cached —
     revisiting an already-generated topic shows it instantly. Body-only,
     same reasoning as AlphabetLesson/PairingLesson. -->
<script lang="ts">
    import { get } from "svelte/store";
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import { isPro } from "$lib/stores/auth.store";
    import { askAiAboutSelection, AI_FEATURE_TAGS } from "$lib/stores/ai-chat.store";
    import { renderInlineMarkdown, renderMarkdown } from "$lib/utils/markdown";
    import {
        formatRetryWindow,
        quotaFailure,
        quotaMessageKey,
        type QuotaFailure,
    } from "$lib/utils/ai-quota";
    import { topicsForLevel, type GrammarTopic } from "$lib/data/arabic-grammar-topics";
    import {
        fetchTopicContent,
        grammarLanguage,
        saveTopicContent,
    } from "$lib/stores/arabic-study.store";
    import { fetchGrammarTopic, grammarModel } from "$lib/stores/ai-grammar-topic.store";
    import VerseRefBadge from "./VerseRefBadge.svelte";

    interface Props {
        level: "intermediate" | "advanced";
        onBack: () => void;
    }
    let { level, onBack }: Props = $props();

    const topics = $derived(topicsForLevel(level));

    let selectedId = $state("");
    $effect(() => {
        if (!selectedId && topics.length) selectedId = topics[0].id;
    });
    const selectedTopic = $derived<GrammarTopic | undefined>(
        topics.find((tp) => tp.id === selectedId),
    );

    let cachedIds = $state<Set<string>>(new Set());
    let rawContent = $state("");
    let loading = $state(false);
    let error = $state("");
    // What the server said when it refused: which class, which window, and how
    // long until it frees up. Null unless the last attempt was refused.
    let quota = $state<QuotaFailure | null>(null);
    let modelMenuOpen = $state(false);
    let modelFellBack = $state(false);
    let quizPicked = $state<Record<number, string>>({});
    let controller: AbortController | null = null;

    $effect(() => {
        void fetchTopicContent()
            .then((rows) => (cachedIds = new Set(rows.map((r) => r.topic_id))))
            .catch((e) => console.error("Failed to load topic progress", e));
    });

    // Load cached content (or clear) whenever the selected topic changes.
    $effect(() => {
        const id = selectedId;
        controller?.abort();
        controller = null;
        loading = false;
        error = "";
        quota = null;
        modelFellBack = false;
        quizPicked = {};
        rawContent = "";
        if (!id) return;
        const language = $grammarLanguage;
        void fetchTopicContent()
            .then((rows) => {
                // One cached lesson per topic, in whatever language it was last
                // generated in — showing it under a different language would be
                // a lie, so leave the panel empty and let Generate refill it.
                const hit = rows.find((r) => r.topic_id === id && r.locale === language);
                if (hit && selectedId === id) rawContent = hit.content;
            })
            .catch(() => {});
    });

    interface TopicExample {
        word: string;
        gloss: string;
        ref?: string;
    }
    interface TopicExercise {
        sentence: string;
        choices: string[];
        answer: string;
        why: string;
        /** The sentence in the lesson's language, blank still blank. Absent on
         *  lessons cached before the field existed. */
        translation: string;
    }
    interface ParsedTopic {
        title: string;
        subtitle: string;
        explanation: string;
        quran: TopicExample[];
        everyday: TopicExample[];
        exercises: TopicExercise[];
    }

    // Upper bounds, not quotas: a lesson is generated with three of each, but
    // lessons cached when it asked for six and five still render in full.
    const QURAN_EXAMPLES = 6;
    const EVERYDAY_EXAMPLES = 6;
    const EXERCISES = 5;

    const splitFields = (value: string) => value.split("::").map((part) => part.trim());
    const splitChoices = (value: string) =>
        value.split("|").map((part) => part.trim()).filter(Boolean);

    // Most fields are single-line ("@@id@@ value"); only @@explanation@@
    // spans lines until the next marker. Tolerant of a partial trailing
    // field while streaming — same spirit as TakeHomeMessageDialog's
    // parseSections(), just a different per-field shape.
    function parseTopic(raw: string): ParsedTopic {
        const fields: Record<string, string> = {};
        let currentKey: string | null = null;
        for (const line of raw.split("\n")) {
            const m = line.match(/^\s*@@\s*([a-z_0-9]+)\s*@@\s*(.*)$/i);
            if (m) {
                currentKey = m[1].toLowerCase();
                fields[currentKey] = m[2] ?? "";
            } else if (currentKey === "explanation") {
                fields.explanation = (fields.explanation ?? "") + "\n" + line;
            }
        }

        const quran: TopicExample[] = [];
        for (let i = 1; i <= QURAN_EXAMPLES; i++) {
            const [word = "", gloss = "", ref = ""] = splitFields(fields[`quran_${i}`] ?? "");
            if (word) quran.push({ word, gloss, ref });
        }
        const everyday: TopicExample[] = [];
        for (let i = 1; i <= EVERYDAY_EXAMPLES; i++) {
            const [word = "", gloss = ""] = splitFields(fields[`everyday_${i}`] ?? "");
            if (word) everyday.push({ word, gloss });
        }
        const exercises: TopicExercise[] = [];
        for (let i = 1; i <= EXERCISES; i++) {
            // Translation is last so a lesson cached with four fields still
            // reads correctly — it simply has none.
            const [sentence = "", choices = "", answer = "", why = "", translation = ""] =
                splitFields(fields[`exercise_${i}`] ?? "");
            if (sentence) {
                exercises.push({
                    sentence,
                    choices: splitChoices(choices),
                    answer,
                    why,
                    translation,
                });
            }
        }

        // Lessons cached before this lesson grew to six examples and five
        // exercises still hold the single-field shape; show what they have.
        if (quran.length === 0 && (fields.quran_word ?? "").trim()) {
            quran.push({
                word: (fields.quran_word ?? "").trim(),
                gloss: (fields.quran_gloss ?? "").trim(),
                ref: (fields.quran_ref ?? "").trim(),
            });
        }
        if (everyday.length === 0 && (fields.everyday_word ?? "").trim()) {
            everyday.push({
                word: (fields.everyday_word ?? "").trim(),
                gloss: (fields.everyday_gloss ?? "").trim(),
            });
        }
        if (exercises.length === 0 && (fields.quiz_sentence ?? "").trim()) {
            exercises.push({
                sentence: (fields.quiz_sentence ?? "").trim(),
                choices: splitChoices(fields.quiz_choices ?? ""),
                answer: (fields.quiz_answer ?? "").trim(),
                why: (fields.quiz_why ?? "").trim(),
                translation: "",
            });
        }

        return {
            title: (fields.title ?? "").trim(),
            subtitle: (fields.subtitle ?? "").trim(),
            explanation: (fields.explanation ?? "").trim(),
            quran,
            everyday,
            exercises,
        };
    }

    const parsed = $derived(parseTopic(rawContent));

    async function generate() {
        const topic = selectedTopic;
        if (!topic) return;
        controller?.abort();
        error = "";
        quota = null;
        modelFellBack = false;
        rawContent = "";
        quizPicked = {};
        loading = true;
        const ac = new AbortController();
        controller = ac;
        try {
            const language = get(grammarLanguage);
            const text = await fetchGrammarTopic({
                topicTitle: topic.label,
                level,
                locale: language,
                advanced: get(grammarModel) === "advanced" && get(isPro),
                onModelFallback: () => (modelFellBack = true),
                signal: ac.signal,
                onPartial: (partial) => {
                    if (!ac.signal.aborted) rawContent = partial;
                },
            });
            if (!ac.signal.aborted) {
                rawContent = text;
                await saveTopicContent(topic.id, text, language);
                cachedIds = new Set([...cachedIds, topic.id]);
            }
        } catch (e) {
            if (!ac.signal.aborted) {
                error = e instanceof Error ? e.message : String(e);
                quota = quotaFailure(e);
            }
        } finally {
            if (controller === ac) {
                loading = false;
                controller = null;
            }
        }
    }

    let followUpText = $state("");

    function askFollowUp(prompt: string) {
        if (!prompt.trim() || !selectedTopic) return;
        askAiAboutSelection({
            prompt: prompt.trim(),
            selectedText: parsed.title || selectedTopic.label,
            contextPrompt: parsed.explanation,
            feature: AI_FEATURE_TAGS.arabicStudyGrammarTopic,
        });
        followUpText = "";
    }

    const moreTopics = $derived(
        topics.filter((tp) => tp.id !== selectedId).slice(0, 3),
    );
</script>

<div class="flex min-h-0 flex-1 overflow-hidden bg-white dark:bg-[#303446]">
    <!-- Topic sidebar -->
    <div
        class="flex w-56 shrink-0 flex-col border-r border-brand-sand-200 bg-brand-sand-50 dark:border-[#414559] dark:bg-[#232634]"
    >
        <div class="default-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-4">
            <h4
                class="mb-1 text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
            >
                {$t("arabicStudy.grammar.path")}
            </h4>
            {#each topics as tp (tp.id)}
                {@const done = cachedIds.has(tp.id)}
                {@const current = tp.id === selectedId}
                <button
                    onclick={() => (selectedId = tp.id)}
                    class="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors {current
                        ? 'bg-white shadow-sm ring-1 ring-brand-gold-300 dark:bg-[#292c3c] dark:ring-[#e5c890]/40'
                        : 'hover:bg-white/60 dark:hover:bg-[#292c3c]/60'}"
                >
                    <span
                        class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.5625rem] font-bold {done
                            ? 'bg-brand-emerald-400 text-white'
                            : current
                              ? 'bg-brand-gold-400 text-white'
                              : 'bg-brand-sand-200 text-brand-charcoal-400 dark:bg-[#414559] dark:text-[#838ba7]'}"
                    >
                        {#if done}
                            <Icon icon="solar:check-bold" width="0.5rem" />
                        {:else}
                            {topics.indexOf(tp) + 1}
                        {/if}
                    </span>
                    <span
                        class="text-[0.71875rem] font-semibold leading-snug {current
                            ? 'text-brand-charcoal-900 dark:text-[#c6d0f5]'
                            : 'text-brand-charcoal-500 dark:text-[#a5adce]'}"
                    >
                        {tp.label}
                    </span>
                </button>
            {/each}
        </div>

        <div class="shrink-0 border-t border-brand-sand-200 px-4 py-3 dark:border-[#414559]">
            <button
                onclick={onBack}
                class="flex cursor-pointer items-center gap-1.5 text-[0.75rem] font-semibold text-brand-charcoal-400 hover:text-brand-charcoal-600 dark:text-[#838ba7] dark:hover:text-[#c6d0f5]"
            >
                <Icon icon="solar:arrow-left-linear" width="0.8rem" />
                {$t("arabicStudy.grammar.back")}
            </button>
        </div>
    </div>

    <!-- Lesson -->
    <div class="default-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div class="flex flex-1 justify-center px-6 py-6">
            <div class="flex w-full max-w-2xl flex-col gap-4">
                {#if !$isPro}
                    <div class="flex flex-col items-center gap-2 py-16 text-center">
                        <Icon
                            icon="solar:lock-keyhole-bold-duotone"
                            class="text-brand-gold-500 dark:text-[#e5c890]"
                            width="1.5rem"
                        />
                        <p class="max-w-xs text-xs leading-relaxed text-brand-charcoal-400 dark:text-[#838ba7]">
                            {$t("arabicStudy.grammar.pro_desc")}
                        </p>
                    </div>
                {:else if error || quota}
                    <div class="flex flex-col items-center gap-2 py-16 text-center">
                        <p
                            class="text-xs {quota
                                ? 'text-brand-charcoal-500 dark:text-[#c6d0f5]'
                                : 'text-red-500 dark:text-red-400'}"
                        >
                            {quota
                                ? $t(quotaMessageKey(quota), {
                                      detail: quota.message,
                                      time: formatRetryWindow(quota.retryAfterSeconds),
                                  })
                                : error}
                        </p>
                        <button
                            onclick={generate}
                            class="cursor-pointer rounded-full border border-brand-sand-200 bg-brand-sand-100 px-3 py-1 text-[0.6875rem] font-semibold text-brand-charcoal-500 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                        >
                            {$t("takehome.try_again")}
                        </button>
                    </div>
                {:else}
                    {@const notStarted = !rawContent && !loading}
                    <!-- AI Explanation — always shown, filled in as it streams -->
                    <div
                        class="rounded-2xl border border-[#e6cf96] bg-linear-to-b from-[#fdf6e6] to-white p-5 dark:border-[#6b5b37] dark:from-[#34302a] dark:to-[#292c3c]"
                    >
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <span
                                class="inline-flex items-center gap-1.5 rounded-lg border border-brand-gold-400 bg-brand-gold-100 px-2.5 py-1 text-[0.625rem] font-semibold text-brand-gold-600 dark:bg-[#e5c890]/30 dark:text-[#e5c890]"
                            >
                                <Icon icon="solar:bolt-bold-duotone" width="0.65rem" />
                                {$t("arabicStudy.grammar.ai_badge")}
                            </span>
                            {#if modelFellBack}
                                <span
                                    class="text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]"
                                    title={$t("arabicStudy.grammar.model_fallback")}
                                >
                                    {$t("arabicStudy.grammar.model_fallback")}
                                </span>
                            {/if}
                        </div>
                        {#if parsed.title}
                            <div dir="rtl" class="mt-2.5 pb-2 font-scheherazade text-2xl text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                {@html renderInlineMarkdown(parsed.title)}
                            </div>
                        {:else}
                            <div class="mt-3 h-6 w-2/3 animate-pulse rounded bg-[#f0e2bb] dark:bg-[#4a4331]"></div>
                        {/if}
                        {#if parsed.subtitle}
                            <div class="mt-0.5 text-[0.71875rem] italic text-brand-gold-500 dark:text-[#e5c890]">
                                {@html renderInlineMarkdown(parsed.subtitle)}
                            </div>
                        {/if}
                        {#if parsed.explanation}
                            <div
                                class="topic-explanation mt-2.5 text-[0.78125rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]"
                            >
                                {@html renderMarkdown(parsed.explanation)}
                            </div>
                        {:else}
                            <div class="mt-3 flex flex-col gap-1.5">
                                <div class="h-3 w-full animate-pulse rounded bg-[#f0e2bb] dark:bg-[#4a4331]"></div>
                                <div class="h-3 w-11/12 animate-pulse rounded bg-[#f0e2bb] dark:bg-[#4a4331]"></div>
                                <div class="h-3 w-2/3 animate-pulse rounded bg-[#f0e2bb] dark:bg-[#4a4331]"></div>
                            </div>
                        {/if}
                    </div>

                    <!-- From the Qur'an / Everyday Arabic — always shown -->
                    <div class="flex gap-3">
                        <div
                            class="flex-1 rounded-2xl border border-brand-emerald-200 bg-brand-emerald-50 p-3 dark:border-[#414559] dark:bg-[#292c3c]"
                        >
                            <span
                                class="rounded-full bg-brand-emerald-100 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-brand-emerald-600 dark:bg-[#414559] dark:text-[#9dd4c8]"
                            >
                                {$t("arabicStudy.alphabet.from_quran")}
                            </span>
                            {#if parsed.quran.length}
                                <div class="mt-2 flex flex-col gap-3">
                                    {#each parsed.quran as example, i (i)}
                                        <div class={i > 0 ? "border-t border-brand-emerald-200/60 pt-3 dark:border-[#414559]" : ""}>
                                            <div dir="rtl" class="pb-2 font-scheherazade text-lg leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                                {@html renderInlineMarkdown(example.word)}
                                            </div>
                                            {#if example.gloss}
                                                <p class="mt-1 text-[0.65625rem] text-brand-charcoal-400 dark:text-[#a5adce]">{@html renderInlineMarkdown(example.gloss)}</p>
                                            {/if}
                                            {#if example.ref}
                                                <div class="mt-1.5">
                                                    <VerseRefBadge verseRef={example.ref} />
                                                </div>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            {:else}
                                <div class="mt-2 flex flex-col gap-1.5">
                                    <div class="h-5 w-2/3 animate-pulse rounded bg-brand-emerald-100 dark:bg-[#414559]"></div>
                                    <div class="h-2.5 w-full animate-pulse rounded bg-brand-emerald-100 dark:bg-[#414559]"></div>
                                </div>
                            {/if}
                        </div>
                        <div
                            class="flex-1 rounded-2xl border border-brand-teal-200 bg-brand-teal-50 p-3 dark:border-[#414559] dark:bg-[#292c3c]"
                        >
                            <span
                                class="rounded-full bg-brand-teal-100 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-brand-teal-600 dark:bg-[#414559] dark:text-[#92cccc]"
                            >
                                {$t("arabicStudy.alphabet.everyday")}
                            </span>
                            {#if parsed.everyday.length}
                                <div class="mt-2 flex flex-col gap-3">
                                    {#each parsed.everyday as example, i (i)}
                                        <div class={i > 0 ? "border-t border-brand-teal-200/60 pt-3 dark:border-[#414559]" : ""}>
                                            <div dir="rtl" class="pb-2 font-scheherazade text-lg leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                                {@html renderInlineMarkdown(example.word)}
                                            </div>
                                            {#if example.gloss}
                                                <p class="mt-1 text-[0.65625rem] text-brand-charcoal-400 dark:text-[#a5adce]">{@html renderInlineMarkdown(example.gloss)}</p>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            {:else}
                                <div class="mt-2 flex flex-col gap-1.5">
                                    <div class="h-5 w-2/3 animate-pulse rounded bg-brand-teal-100 dark:bg-[#414559]"></div>
                                    <div class="h-2.5 w-full animate-pulse rounded bg-brand-teal-100 dark:bg-[#414559]"></div>
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- Try It — always shown -->
                    <div
                        class="rounded-2xl border border-brand-sand-200 bg-white p-4 dark:border-[#414559] dark:bg-[#292c3c]"
                    >
                        <div class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">
                            {$t("arabicStudy.grammar.try_it")}
                        </div>
                        {#if parsed.exercises.length}
                            <div class="mt-2 flex flex-col gap-3">
                                {#each parsed.exercises as exercise, index (index)}
                                    {@const picked = quizPicked[index]}
                                    <div class={index > 0 ? "border-t border-brand-sand-200 pt-3 dark:border-[#414559]" : ""}>
                                        <div class="flex items-baseline gap-2">
                                            <span
                                                class="shrink-0 text-[0.5625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                                            >
                                                {index + 1}
                                            </span>
                                            <div class="flex-1">
                                                <div dir="rtl" class="pb-2 text-center font-scheherazade text-xl leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                                    {@html renderInlineMarkdown(exercise.sentence)}
                                                </div>
                                                {#if exercise.translation}
                                                    <p class="mt-0.5 text-center text-[0.625rem] italic text-brand-charcoal-400 dark:text-[#838ba7]">
                                                        {@html renderInlineMarkdown(exercise.translation)}
                                                    </p>
                                                {/if}
                                            </div>
                                        </div>
                                        <div class="mt-1 flex flex-wrap items-center justify-center gap-2">
                                            {#each exercise.choices as choice (choice)}
                                                {@const isAnswer = choice === exercise.answer}
                                                {@const revealed = picked !== undefined}
                                                <button
                                                    onclick={() =>
                                                        (quizPicked = { ...quizPicked, [index]: choice })}
                                                    class="cursor-pointer rounded-full border px-4 py-1 font-scheherazade text-base transition-colors {revealed && isAnswer
                                                        ? 'border-brand-emerald-400 bg-brand-emerald-50 font-bold text-brand-emerald-600 dark:border-[#3d9b86] dark:bg-[#292c3c] dark:text-[#9dd4c8]'
                                                        : revealed && picked === choice
                                                          ? 'border-red-300 bg-red-50 text-red-500 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
                                                          : 'border-brand-sand-200 text-brand-charcoal-500 hover:bg-brand-sand-50 dark:border-[#414559] dark:text-[#a5adce] dark:hover:bg-[#363a4f]'}"
                                                >
                                                    {choice}
                                                </button>
                                            {/each}
                                        </div>
                                        {#if picked !== undefined && exercise.why}
                                            <p class="mt-2 text-center text-[0.6875rem] text-brand-charcoal-400 dark:text-[#a5adce]">
                                                {@html renderInlineMarkdown(exercise.why)}
                                            </p>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div class="mt-2.5 flex flex-col items-center gap-2">
                                <div class="h-5 w-1/2 animate-pulse rounded bg-brand-sand-100 dark:bg-[#414559]"></div>
                                <div class="flex gap-2">
                                    <div class="h-6 w-14 animate-pulse rounded-full bg-brand-sand-100 dark:bg-[#414559]"></div>
                                    <div class="h-6 w-14 animate-pulse rounded-full bg-brand-sand-100 dark:bg-[#414559]"></div>
                                    <div class="h-6 w-14 animate-pulse rounded-full bg-brand-sand-100 dark:bg-[#414559]"></div>
                                </div>
                            </div>
                        {/if}
                    </div>

                    {#if moreTopics.length && rawContent}
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">
                                {$t("arabicStudy.grammar.more_like_this")}
                            </span>
                            {#each moreTopics as tp (tp.id)}
                                <button
                                    onclick={() => (selectedId = tp.id)}
                                    class="cursor-pointer rounded-full border border-brand-gold-200 bg-brand-gold-50 px-3 py-1 text-[0.6875rem] font-semibold text-brand-gold-600 hover:bg-brand-gold-100 dark:border-[#5a5030] dark:bg-[#34302a] dark:text-[#e5c890]"
                                >
                                    {tp.label}
                                </button>
                            {/each}
                        </div>
                    {/if}

                    <!-- The model rides with the button that spends it, same as
                         the take-home message's generate control. -->
                    {#if notStarted}
                        <div class="relative flex self-center">
                            <button
                                onclick={generate}
                                class="flex cursor-pointer items-center gap-1.5 rounded-l-full bg-brand-gold-400 py-1.5 pl-3.5 pr-2.5 text-[0.75rem] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400"
                            >
                                <Icon icon="solar:magic-stick-3-bold-duotone" width="0.8rem" />
                                {$t("arabicStudy.grammar.generate")}
                            </button>
                            <button
                                onclick={() => (modelMenuOpen = !modelMenuOpen)}
                                disabled={loading}
                                title={$grammarModel === "advanced"
                                    ? $t("arabicStudy.grammar.model_advanced_hint")
                                    : $t("arabicStudy.grammar.model_standard_hint")}
                                aria-label={$grammarModel === "advanced"
                                    ? $t("arabicStudy.grammar.model_advanced")
                                    : $t("arabicStudy.grammar.model_standard")}
                                class="flex cursor-pointer items-center gap-1 rounded-r-full border-l border-white/25 bg-brand-gold-400 pl-2 pr-2.5 text-gray-100 transition-colors hover:bg-brand-gold-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400"
                            >
                                <Icon
                                    icon={$grammarModel === "advanced"
                                        ? "solar:bolt-bold-duotone"
                                        : "solar:bolt-linear"}
                                    width="0.75rem"
                                />
                                <Icon
                                    icon="solar:alt-arrow-down-bold"
                                    width="0.6rem"
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
                                    class="absolute right-0 top-full z-20 mt-1.5 w-36 overflow-hidden rounded-xl border border-brand-sand-200 bg-white py-1 shadow-lg dark:border-[#414559] dark:bg-[#303446]"
                                >
                                    {#each ["standard", "advanced"] as const as option (option)}
                                        <button
                                            onclick={() => {
                                                grammarModel.set(option);
                                                modelMenuOpen = false;
                                            }}
                                            class="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 text-left text-[0.6875rem] font-semibold transition-colors hover:bg-brand-sand-100 dark:hover:bg-[#414559] {$grammarModel ===
                                            option
                                                ? 'text-brand-gold-600 dark:text-[#e5c890]'
                                                : 'text-brand-charcoal-500 dark:text-[#c6d0f5]'}"
                                        >
                                            <Icon
                                                icon={option === "advanced"
                                                    ? "solar:bolt-bold-duotone"
                                                    : "solar:bolt-linear"}
                                                width="0.7rem"
                                            />
                                            {option === "advanced"
                                                ? $t("arabicStudy.grammar.model_advanced")
                                                : $t("arabicStudy.grammar.model_standard")}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {:else}
                        <div class="relative flex self-center">
                            <button
                                onclick={generate}
                                disabled={loading}
                                class="flex cursor-pointer items-center gap-1.5 rounded-l-full border border-r-0 border-brand-sand-200 bg-brand-sand-100 py-1 pl-3 pr-2 text-[0.625rem] font-semibold text-brand-charcoal-500 hover:bg-brand-sand-200 disabled:opacity-50 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                            >
                                <Icon icon={loading ? "svg-spinners:3-dots-fade" : "solar:refresh-bold"} width="0.7rem" />
                                {$t(loading ? "arabicStudy.grammar.loading" : "arabicStudy.grammar.regenerate")}
                            </button>
                            <button
                                onclick={() => (modelMenuOpen = !modelMenuOpen)}
                                disabled={loading}
                                title={$grammarModel === "advanced"
                                    ? $t("arabicStudy.grammar.model_advanced_hint")
                                    : $t("arabicStudy.grammar.model_standard_hint")}
                                aria-label={$grammarModel === "advanced"
                                    ? $t("arabicStudy.grammar.model_advanced")
                                    : $t("arabicStudy.grammar.model_standard")}
                                class="flex cursor-pointer items-center gap-1 rounded-r-full border border-brand-sand-200 bg-brand-sand-100 pl-1.5 pr-2 text-brand-charcoal-500 transition-colors hover:bg-brand-sand-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                            >
                                <Icon
                                    icon={$grammarModel === "advanced"
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
                                    class="absolute right-0 top-full z-20 mt-1.5 w-36 overflow-hidden rounded-xl border border-brand-sand-200 bg-white py-1 shadow-lg dark:border-[#414559] dark:bg-[#303446]"
                                >
                                    {#each ["standard", "advanced"] as const as option (option)}
                                        <button
                                            onclick={() => {
                                                grammarModel.set(option);
                                                modelMenuOpen = false;
                                            }}
                                            class="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 text-left text-[0.6875rem] font-semibold transition-colors hover:bg-brand-sand-100 dark:hover:bg-[#414559] {$grammarModel ===
                                            option
                                                ? 'text-brand-gold-600 dark:text-[#e5c890]'
                                                : 'text-brand-charcoal-500 dark:text-[#c6d0f5]'}"
                                        >
                                            <Icon
                                                icon={option === "advanced"
                                                    ? "solar:bolt-bold-duotone"
                                                    : "solar:bolt-linear"}
                                                width="0.7rem"
                                            />
                                            {option === "advanced"
                                                ? $t("arabicStudy.grammar.model_advanced")
                                                : $t("arabicStudy.grammar.model_standard")}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}
                {/if}
            </div>
        </div>

        {#if $isPro}
            <div
                class="flex shrink-0 justify-center border-t border-brand-sand-200 bg-brand-sand-50 px-6 py-2.5 dark:border-[#414559] dark:bg-[#232634]"
            >
                <div
                    class="flex w-full max-w-2xl items-center gap-2 rounded-full border border-brand-sand-200 bg-white py-1.5 pl-4 pr-1.5 dark:border-[#414559] dark:bg-[#1e2030]"
                >
                    <input
                        type="text"
                        bind:value={followUpText}
                        onkeydown={(e) => e.key === "Enter" && askFollowUp(followUpText)}
                        placeholder={$t("arabicStudy.grammar.ask_placeholder")}
                        class="min-w-0 flex-1 bg-transparent text-[0.6875rem] text-brand-charcoal-900 placeholder-brand-charcoal-300 outline-none dark:text-[#c6d0f5] dark:placeholder-[#626880]"
                    />
                    <button
                        onclick={() => askFollowUp(followUpText)}
                        disabled={!followUpText.trim()}
                        class="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand-gold-400 text-gray-100 transition-colors hover:bg-brand-gold-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-gold-500 dark:text-gray-800"
                    >
                        <Icon icon="solar:arrow-right-linear" width="0.75rem" />
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .topic-explanation :global(p) {
        margin: 0.35em 0;
    }
    .topic-explanation :global(p:first-child) {
        margin-top: 0;
    }
    .topic-explanation :global(p:last-child) {
        margin-bottom: 0;
    }
    .topic-explanation :global(strong) {
        font-weight: 700;
        color: #383a52;
    }
    :global(.dark) .topic-explanation :global(strong) {
        color: #eff1f5;
    }
    .topic-explanation :global(ul) {
        margin: 0.3em 0;
        padding-left: 1.1em;
    }
    .topic-explanation :global(li) {
        margin: 0.2em 0;
    }
</style>
