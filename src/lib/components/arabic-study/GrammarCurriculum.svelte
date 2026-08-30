<!-- The intermediate/advanced grammar curriculum: pick a topic, get an
     AI-generated lesson (title, explanation, a Qur'anic + an everyday
     example, a short quiz). Content is generated on demand and cached —
     revisiting an already-generated topic shows it instantly. Body-only,
     same reasoning as AlphabetLesson/PairingLesson. -->
<script lang="ts">
    import { get } from "svelte/store";
    import Icon from "@iconify/svelte";
    import { t, locale } from "$lib/i18n";
    import { isPro, isProPlus } from "$lib/stores/auth.store";
    import { askAiAboutSelection, AI_FEATURE_TAGS } from "$lib/stores/ai-chat.store";
    import { renderMarkdown } from "$lib/utils/markdown";
    import { topicsForLevel, type GrammarTopic } from "$lib/data/arabic-grammar-topics";
    import { fetchTopicContent, saveTopicContent } from "$lib/stores/arabic-study.store";
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
    let quotaExceeded = $state(false);
    let quizPicked = $state<string | null>(null);
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
        quotaExceeded = false;
        quizPicked = null;
        rawContent = "";
        if (!id) return;
        void fetchTopicContent()
            .then((rows) => {
                const hit = rows.find((r) => r.topic_id === id);
                if (hit && selectedId === id) rawContent = hit.content;
            })
            .catch(() => {});
    });

    interface ParsedTopic {
        title: string;
        subtitle: string;
        explanation: string;
        quranWord: string;
        quranGloss: string;
        quranRef: string;
        everydayWord: string;
        everydayGloss: string;
        quizSentence: string;
        quizChoices: string[];
        quizAnswer: string;
        quizWhy: string;
    }

    // Most fields are single-line ("@@id@@ value"); only @@explanation@@
    // spans lines until the next marker. Tolerant of a partial trailing
    // field while streaming — same spirit as TakeHomeMessageDialog's
    // parseSections(), just a different per-field shape.
    function parseTopic(raw: string): ParsedTopic {
        const fields: Record<string, string> = {};
        let currentKey: string | null = null;
        for (const line of raw.split("\n")) {
            const m = line.match(/^\s*@@\s*([a-z_]+)\s*@@\s*(.*)$/i);
            if (m) {
                currentKey = m[1].toLowerCase();
                fields[currentKey] = m[2] ?? "";
            } else if (currentKey === "explanation") {
                fields.explanation = (fields.explanation ?? "") + "\n" + line;
            }
        }
        return {
            title: (fields.title ?? "").trim(),
            subtitle: (fields.subtitle ?? "").trim(),
            explanation: (fields.explanation ?? "").trim(),
            quranWord: (fields.quran_word ?? "").trim(),
            quranGloss: (fields.quran_gloss ?? "").trim(),
            quranRef: (fields.quran_ref ?? "").trim(),
            everydayWord: (fields.everyday_word ?? "").trim(),
            everydayGloss: (fields.everyday_gloss ?? "").trim(),
            quizSentence: (fields.quiz_sentence ?? "").trim(),
            quizChoices: (fields.quiz_choices ?? "")
                .split("|")
                .map((s) => s.trim())
                .filter(Boolean),
            quizAnswer: (fields.quiz_answer ?? "").trim(),
            quizWhy: (fields.quiz_why ?? "").trim(),
        };
    }

    const parsed = $derived(parseTopic(rawContent));

    async function generate() {
        const topic = selectedTopic;
        if (!topic) return;
        controller?.abort();
        error = "";
        quotaExceeded = false;
        rawContent = "";
        quizPicked = null;
        loading = true;
        const ac = new AbortController();
        controller = ac;
        try {
            const text = await fetchGrammarTopic({
                topicTitle: topic.label,
                level,
                locale: get(locale),
                advanced: get(grammarModel) === "advanced" && get(isProPlus),
                signal: ac.signal,
                onPartial: (partial) => {
                    if (!ac.signal.aborted) rawContent = partial;
                },
            });
            if (!ac.signal.aborted) {
                rawContent = text;
                await saveTopicContent(topic.id, text, get(locale));
                cachedIds = new Set([...cachedIds, topic.id]);
            }
        } catch (e) {
            if (!ac.signal.aborted) {
                error = e instanceof Error ? e.message : String(e);
                quotaExceeded = (e as { status?: number } | null)?.status === 429;
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
                {:else if error || quotaExceeded}
                    <div class="flex flex-col items-center gap-2 py-16 text-center">
                        <p
                            class="text-xs {quotaExceeded
                                ? 'text-brand-charcoal-500 dark:text-[#c6d0f5]'
                                : 'text-red-500 dark:text-red-400'}"
                        >
                            {quotaExceeded ? $t("takehome.quota_advanced") : error}
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
                            {#if $isProPlus}
                                <button
                                    onclick={() =>
                                        grammarModel.set($grammarModel === "advanced" ? "standard" : "advanced")}
                                    title={$grammarModel === "advanced"
                                        ? $t("arabicStudy.grammar.model_advanced_hint")
                                        : $t("arabicStudy.grammar.model_standard_hint")}
                                    class="flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold transition-colors {$grammarModel ===
                                    'advanced'
                                        ? 'border-brand-gold-400 bg-brand-gold-100 text-brand-gold-600 dark:bg-[#e5c890]/30 dark:text-[#e5c890]'
                                        : 'border-brand-sand-200 text-brand-charcoal-400 hover:bg-brand-sand-100 dark:border-[#414559] dark:text-[#8087a2] dark:hover:bg-[#292c3c]'}"
                                >
                                    <Icon
                                        icon={$grammarModel === "advanced" ? "solar:bolt-bold-duotone" : "solar:bolt-linear"}
                                        width="0.65rem"
                                    />
                                    {$grammarModel === "advanced"
                                        ? $t("arabicStudy.grammar.model_advanced")
                                        : $t("arabicStudy.grammar.model_standard")}
                                </button>
                            {/if}
                        </div>
                        {#if parsed.title}
                            <div dir="rtl" class="mt-2.5 pb-2 font-scheherazade text-2xl text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                {parsed.title}
                            </div>
                        {:else}
                            <div class="mt-3 h-6 w-2/3 animate-pulse rounded bg-[#f0e2bb] dark:bg-[#4a4331]"></div>
                        {/if}
                        {#if parsed.subtitle}
                            <div class="mt-0.5 text-[0.71875rem] italic text-brand-gold-500 dark:text-[#e5c890]">
                                {parsed.subtitle}
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
                            {#if parsed.quranWord}
                                <div dir="rtl" class="mt-2 pb-2 font-scheherazade text-lg text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                    {parsed.quranWord}
                                </div>
                                {#if parsed.quranGloss}
                                    <p class="mt-1 text-[0.65625rem] text-brand-charcoal-400 dark:text-[#a5adce]">{parsed.quranGloss}</p>
                                {/if}
                                {#if parsed.quranRef}
                                    <div class="mt-1.5">
                                        <VerseRefBadge verseRef={parsed.quranRef} />
                                    </div>
                                {/if}
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
                            {#if parsed.everydayWord}
                                <div dir="rtl" class="mt-2 pb-2 font-scheherazade text-lg text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                    {parsed.everydayWord}
                                </div>
                                {#if parsed.everydayGloss}
                                    <p class="mt-1 text-[0.65625rem] text-brand-charcoal-400 dark:text-[#a5adce]">{parsed.everydayGloss}</p>
                                {/if}
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
                        {#if parsed.quizSentence && parsed.quizChoices.length}
                            <div dir="rtl" class="mt-2 text-center font-scheherazade text-xl text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                {parsed.quizSentence}
                            </div>
                            <div class="mt-2.5 flex flex-wrap items-center justify-center gap-2">
                                {#each parsed.quizChoices as choice (choice)}
                                    {@const isAnswer = choice === parsed.quizAnswer}
                                    {@const revealed = quizPicked !== null}
                                    <button
                                        onclick={() => (quizPicked = choice)}
                                        class="cursor-pointer rounded-full border px-4 py-1 font-scheherazade text-base transition-colors {revealed && isAnswer
                                            ? 'border-brand-emerald-400 bg-brand-emerald-50 font-bold text-brand-emerald-600 dark:border-[#3d9b86] dark:bg-[#292c3c] dark:text-[#9dd4c8]'
                                            : revealed && quizPicked === choice
                                              ? 'border-red-300 bg-red-50 text-red-500 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
                                              : 'border-brand-sand-200 text-brand-charcoal-500 hover:bg-brand-sand-50 dark:border-[#414559] dark:text-[#a5adce] dark:hover:bg-[#363a4f]'}"
                                    >
                                        {choice}
                                    </button>
                                {/each}
                            </div>
                            {#if quizPicked && parsed.quizWhy}
                                <p class="mt-2.5 text-center text-[0.6875rem] text-brand-charcoal-400 dark:text-[#a5adce]">
                                    {parsed.quizWhy}
                                </p>
                            {/if}
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

                    {#if notStarted}
                        <button
                            onclick={generate}
                            class="flex w-fit cursor-pointer items-center gap-1.5 self-center rounded-full bg-brand-gold-400 px-3.5 py-1.5 text-[0.75rem] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400"
                        >
                            <Icon icon="solar:magic-stick-3-bold-duotone" width="0.8rem" />
                            {$t("arabicStudy.grammar.generate")}
                        </button>
                    {:else}
                        <button
                            onclick={generate}
                            disabled={loading}
                            class="flex w-fit cursor-pointer items-center gap-1.5 self-center rounded-full border border-brand-sand-200 bg-brand-sand-100 px-3 py-1 text-[0.625rem] font-semibold text-brand-charcoal-500 hover:bg-brand-sand-200 disabled:opacity-50 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                        >
                            <Icon icon={loading ? "svg-spinners:3-dots-fade" : "solar:refresh-bold"} width="0.7rem" />
                            {$t(loading ? "arabicStudy.grammar.loading" : "arabicStudy.grammar.regenerate")}
                        </button>
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
