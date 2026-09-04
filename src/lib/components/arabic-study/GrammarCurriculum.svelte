<!-- The intermediate/advanced grammar curriculum: pick a topic, get an
     AI-generated lesson (title, explanation, a Qur'anic + an everyday
     example, a short quiz). Content is generated on demand and cached —
     revisiting an already-generated topic shows it instantly. Body-only,
     same reasoning as AlphabetLesson/PairingLesson. -->
<script lang="ts">
    import { untrack } from "svelte";
    import { fly } from "svelte/transition";
    import { get } from "svelte/store";
    import Icon from "@iconify/svelte";
    import { LOCALE_NAMES, t } from "$lib/i18n";
    import { isPro } from "$lib/stores/auth.store";
    import { askAiAboutSelection, AI_FEATURE_TAGS } from "$lib/stores/ai-chat.store";
    import { findMorphologyExamples } from "$lib/data/arabic-study";
    import { fetchVerseTexts, type VerseText } from "$lib/data/verse-of-day";
    import { availableTranslators, ensureTranslators } from "$lib/stores/translation.store";
    import { renderInlineMarkdown, renderMarkdown } from "$lib/utils/markdown";
    import {
        formatRetryWindow,
        quotaFailure,
        quotaMessageKey,
        type QuotaFailure,
    } from "$lib/utils/ai-quota";
    import { topicsForLevel, type GrammarTopic } from "$lib/data/arabic-grammar-topics";
    import {
        deleteTopicSection,
        fetchTopicContent,
        fetchTopicSections,
        grammarLanguage,
        recordStudyActivity,
        saveTopicContent,
        saveTopicSection,
        STUDY_AREA,
        activeVersionId,
        fetchTopicVersions,
        lessonVersions,
        saveTopicVersion,
        type TopicVersion,
        fetchLessonAnnotations,
        saveLessonAnnotation,
        deleteLessonAnnotation,
        type AnnotationAnchorKind,
    } from "$lib/stores/arabic-study.store";
    import { PREMADE_LESSONS, PREMADE_LOCALE } from "$lib/data/grammar-premade";
    import {
        askLessonFollowUp,
        fetchGrammarTopic,
        fetchLessonSection,
        grammarModel,
        translateVerses,
        type FollowUpTurn,
    } from "$lib/stores/ai-grammar-topic.store";
    import VerseRefBadge from "./VerseRefBadge.svelte";
    import AnnotationMenu from "./AnnotationMenu.svelte";
    import FloatingAnnotationCard from "./FloatingAnnotationCard.svelte";
    import {
        createAnchorRegistry,
        linkPath,
        linkEndpoints,
        ANNOTATION_CARD_WIDTH,
        ANNOTATION_GAP,
        type AnchorRect,
        type AnnotationDraft,
    } from "./annotation-layout";
    import { exportLessonSvg, exportLessonPdf, type ExportBox, type ExportAnnotation } from "./lesson-export";

    interface Props {
        level: "beginner" | "intermediate" | "advanced";
        onBack: () => void;
    }
    let { level, onBack }: Props = $props();

    const topics = $derived(topicsForLevel(level));

    let sidebarOpen = $state(true);

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

    /**
     * Loads the versions for the topic and language on screen and shows the
     * newest. The English lessons that ship with the app are seeded here as the
     * first version the first time a topic is opened, so a reader without an AI
     * subscription still has a lesson to study — and a regeneration adds to the
     * history rather than replacing it.
     */
    async function loadVersions(topicId: string, locale: string) {
        try {
            let versions = await fetchTopicVersions(topicId, locale);
            if (versions.length === 0 && locale === PREMADE_LOCALE && PREMADE_LESSONS[topicId]) {
                await saveTopicVersion(topicId, locale, PREMADE_LESSONS[topicId], "premade");
                versions = await fetchTopicVersions(topicId, locale);
            }
            if (selectedTopic?.id !== topicId || $grammarLanguage !== locale) return;
            lessonVersions.set(versions);
            const newest = versions.at(-1) ?? null;
            activeVersionId.set(newest?.id ?? null);
            rawContent = newest?.content ?? "";
        } catch {
            // No database here (browser dev): fall back to the shipped lesson
            // in memory so the panel is not empty.
            const premade = locale === PREMADE_LOCALE ? PREMADE_LESSONS[topicId] : undefined;
            lessonVersions.set([]);
            activeVersionId.set(null);
            rawContent = premade ?? "";
        }
    }

    /** 'premade' while a shipped lesson is on screen, 'ai' for a generation. */
    const activeSource = $derived(
        $lessonVersions.find((v: TopicVersion) => v.id === $activeVersionId)?.source ?? "ai",
    );

    // Show whichever version the header selects.
    $effect(() => {
        const id = $activeVersionId;
        const version = $lessonVersions.find((v: TopicVersion) => v.id === id);
        if (version) rawContent = version.content;
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
        // A follow-up thread belongs to the lesson it was asked about: leaving
        // it on screen across topics would show one page's answers under
        // another's, and its context would be carried into the next question.
        followUpController?.abort();
        followUpController = null;
        followUpLoading = false;
        followUpTurns = [];
        followUpPending = "";
        followUpError = "";
        followUpText = "";
        lessonVersions.set([]);
        activeVersionId.set(null);
        if (!id) return;
        void loadVersions(id, $grammarLanguage);
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

    /** First non-empty line — every field but the explanation is a one-liner. */
    const firstLine = (value: string) =>
        value
            .split("\n")
            .map((line) => line.trim())
            .find(Boolean) ?? "";

    // Markers delimit the fields; anything between two of them belongs to the
    // first. Scanning for them anywhere in the text rather than only at the
    // start of a line matters: a model that runs the explanation straight into
    // `@@quran_1@@` on one line would otherwise leave the marker sitting in the
    // explanation and lose the example entirely. Tolerant of a partial trailing
    // field while streaming — same spirit as TakeHomeMessageDialog's
    // parseSections(), just a different per-field shape.
    function parseTopic(raw: string): ParsedTopic {
        const fields: Record<string, string> = {};
        const marker = /@@\s*([a-z_0-9]+)\s*@@/gi;
        let currentKey: string | null = null;
        let contentFrom = 0;
        let match: RegExpExecArray | null;
        while ((match = marker.exec(raw)) !== null) {
            if (currentKey !== null) {
                fields[currentKey] += raw.slice(contentFrom, match.index);
            }
            currentKey = match[1].toLowerCase();
            fields[currentKey] = "";
            contentFrom = marker.lastIndex;
        }
        if (currentKey !== null) fields[currentKey] += raw.slice(contentFrom);

        const quran: TopicExample[] = [];
        for (let i = 1; i <= QURAN_EXAMPLES; i++) {
            const [word = "", gloss = "", ref = ""] = splitFields(firstLine(fields[`quran_${i}`] ?? ""));
            if (word) quran.push({ word, gloss, ref });
        }
        const everyday: TopicExample[] = [];
        for (let i = 1; i <= EVERYDAY_EXAMPLES; i++) {
            const [word = "", gloss = ""] = splitFields(firstLine(fields[`everyday_${i}`] ?? ""));
            if (word) everyday.push({ word, gloss });
        }
        const exercises: TopicExercise[] = [];
        for (let i = 1; i <= EXERCISES; i++) {
            // Translation is last so a lesson cached with four fields still
            // reads correctly — it simply has none.
            const [sentence = "", choices = "", answer = "", why = "", translation = ""] =
                splitFields(firstLine(fields[`exercise_${i}`] ?? ""));
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
        if (quran.length === 0 && firstLine(fields.quran_word ?? "")) {
            quran.push({
                word: firstLine(fields.quran_word ?? ""),
                gloss: firstLine(fields.quran_gloss ?? ""),
                ref: firstLine(fields.quran_ref ?? ""),
            });
        }
        if (everyday.length === 0 && firstLine(fields.everyday_word ?? "")) {
            everyday.push({
                word: firstLine(fields.everyday_word ?? ""),
                gloss: firstLine(fields.everyday_gloss ?? ""),
            });
        }
        if (exercises.length === 0 && firstLine(fields.quiz_sentence ?? "")) {
            exercises.push({
                sentence: firstLine(fields.quiz_sentence ?? ""),
                choices: splitChoices(firstLine(fields.quiz_choices ?? "")),
                answer: firstLine(fields.quiz_answer ?? ""),
                why: firstLine(fields.quiz_why ?? ""),
                translation: "",
            });
        }

        return {
            title: firstLine(fields.title ?? ""),
            subtitle: firstLine(fields.subtitle ?? ""),
            explanation: (fields.explanation ?? "").trim(),
            quran,
            everyday,
            exercises,
        };
    }

    const parsed = $derived(parseTopic(rawContent));

    // ── Grounding the Qur'anic examples in the actual muṣḥaf ─────────────────
    //
    // The model picks which ayah demonstrates the topic and explains it; the
    // text and the translation come from the bundled Qur'an, never from the
    // model. A citation it invents therefore cannot reach the reader: the ref
    // either resolves against the database or the example is dropped, and the
    // Arabic shown is the ayah's own, not what the model typed.
    let verses = $state<Map<string, VerseText>>(new Map());
    /** False until the lookup has actually answered for this lesson. */
    let versesChecked = $state(false);
    /** ref -> translation the AI produced, for languages the app has none for. */
    let aiVerseTranslations = $state<Map<string, string>>(new Map());

    void ensureTranslators().catch(() => {});

    /**
     * A published translation in the lesson's own language, if the app ships
     * one. The reader's chosen translator is deliberately ignored here: the
     * examples are part of a lesson written in the header's language, and a
     * translation in some other language would read as a mistake.
     */
    const lessonTranslatorId = $derived.by(() => {
        const locale = $grammarLanguage.toLowerCase();
        const match = $availableTranslators.find(
            (translator) => translator.lang.toLowerCase() === locale,
        );
        return match?.id;
    });

    /**
     * "٢:٢٥٥", "2 : 255", "Q 2:255" — normalise whatever the model wrote into
     * the "surah:ayah" the lookup is keyed by, or "" when it is not a
     * reference at all.
     */
    function normaliseRef(raw: string): string {
        const digits = raw.replace(/[\u0660-\u0669]/g, (d) =>
            String(d.charCodeAt(0) - 0x0660),
        );
        const match = /(\d{1,3})\s*[:：]\s*(\d{1,3})/.exec(digits);
        return match ? `${Number(match[1])}:${Number(match[2])}` : "";
    }

    const DIACRITICS = /[\u064B-\u065F\u0610-\u061A\u0670\u06D6-\u06ED\u0640\s]/g;
    // Normalise first: the model may write decomposed forms where the database
    // holds composed ones, and an unnormalised compare reports a real quotation
    // as absent.
    const bare = (text: string) => text.normalize("NFC").replace(DIACRITICS, "");

    $effect(() => {
        const refs = parsed.quran
            .map((example) => normaliseRef(example.ref ?? ""))
            .filter(Boolean);
        if (refs.length === 0) {
            verses = new Map();
            versesChecked = false;
            return;
        }
        const translatorId = lessonTranslatorId;
        void untrack(() =>
            fetchVerseTexts(
                refs.map((ref) => {
                    const [surah, ayah] = ref.split(":").map(Number);
                    return { surah, ayah };
                }),
                translatorId,
            )
                .then((rows) => {
                    verses = new Map(rows.map((row) => [`${row.surah}:${row.ayah}`, row]));
                    versesChecked = true;
                })
                .catch(() => {
                    // Outside Tauri there is no database to check against.
                    verses = new Map();
                    versesChecked = false;
                }),
        );
    });

    // No bundled translator for this language: translate the examples with the
    // AI instead, and label them, since they are not a published translation.
    $effect(() => {
        const locale = $grammarLanguage;
        const shown = groundedQuran;
        // Arabic needs no translation of Arabic; the app ships no Arabic
        // "translation" either, so it would otherwise fall to the AI.
        if (
            lessonTranslatorId !== undefined ||
            locale === "ar" ||
            !$isPro ||
            shown.length === 0
        ) {
            aiVerseTranslations = new Map();
            return;
        }
        // Read what is already translated without subscribing to it: this
        // effect writes that same map, and tracking it would re-run the effect
        // for every answer it stores.
        const missing = untrack(() =>
            shown.filter((example) => example.ref && !aiVerseTranslations.has(example.ref)),
        );
        if (missing.length === 0) return;
        void untrack(() =>
            translateVerses({
                verses: missing.map((example) => ({
                    ref: example.ref,
                    arabic: example.arabic,
                })),
                language: `${LOCALE_NAMES[locale as keyof typeof LOCALE_NAMES] ?? locale} (locale ${locale})`,
                feature: `${AI_FEATURE_TAGS.arabicStudyVerseTranslate}_${level}`,
                advanced: get(grammarModel) === "advanced" && get(isPro),
            })
                .then((rows) => {
                    const next = new Map(aiVerseTranslations);
                    for (const [ref, text] of Object.entries(rows)) next.set(ref, text);
                    aiVerseTranslations = next;
                })
                .catch(() => {}),
        );
    });

    interface GroundedExample {
        /** The muṣḥaf's own words: the model's phrase when it really occurs in
         *  the ayah, otherwise the whole ayah. */
        arabic: string;
        /** The ayah's translation, from the reader's chosen translator. */
        translation: string | null;
        gloss: string;
        ref: string;
    }

    const groundedQuran = $derived.by<GroundedExample[]>(() => {
        if (verses.size === 0) {
            // Nothing verified yet (still loading, or no database): show the
            // model's own phrases, but never a citation we could not resolve.
            return parsed.quran.map((example) => ({
                arabic: example.word,
                translation: null,
                gloss: example.gloss,
                ref: normaliseRef(example.ref ?? "") || normaliseRef(example.gloss ?? ""),
            }));
        }
        const out: GroundedExample[] = [];
        for (const example of parsed.quran) {
            // Models sometimes drop the reference into the gloss instead of its
            // own field; a real citation should not be lost to that.
            const ref = normaliseRef(example.ref ?? "") || normaliseRef(example.gloss ?? "");
            const verse = verses.get(ref);
            if (!verse) continue; // unresolvable citation — drop it
            const quoted = bare(verse.arabic).includes(bare(example.word));
            out.push({
                arabic: quoted ? example.word : verse.arabic,
                translation: verse.translation,
                gloss: example.gloss,
                ref,
            });
        }
        return out;
    });

    /**
     * Pulls the topic's verified occurrences out of the corpus, formatted for
     * the prompt. Topics with no morphological signature return nothing and the
     * model proposes its own examples, which are still checked against the
     * muṣḥaf before they are shown.
     */
    async function corpusSample(topic: GrammarTopic): Promise<string | undefined> {
        if (!topic.corpus?.length) return undefined;
        const perQuery = Math.max(2, Math.ceil(9 / topic.corpus.length));
        try {
            const groups = await Promise.all(
                topic.corpus.map(async (query) => {
                    const found = await findMorphologyExamples(query, perQuery);
                    return found.map(
                        (example) =>
                            `- ${example.surah}:${example.ayah} — ${example.arabic} ` +
                            `(${query.label}; ${example.tag} ${example.features})`,
                    );
                }),
            );
            const lines = groups.flat();
            return lines.length ? lines.join("\n") : undefined;
        } catch {
            // No database here (browser dev) — fall back to the model's own.
            return undefined;
        }
    }

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
            const corpusExamples = await corpusSample(topic);
            if (ac.signal.aborted) return;
            const text = await fetchGrammarTopic({
                topicTitle: topic.label,
                topicBrief: $t(`arabicStudy.topic.${topic.id}`),
                level,
                locale: language,
                corpusExamples,
                advanced: get(grammarModel) === "advanced" && get(isPro),
                onModelFallback: () => (modelFellBack = true),
                signal: ac.signal,
                onPartial: (partial) => {
                    if (!ac.signal.aborted) rawContent = partial;
                },
            });
            if (!ac.signal.aborted) {
                rawContent = text;
                // Keep the single-row cache in step for the progress panel, and
                // record the generation as a version of its own.
                await saveTopicContent(topic.id, text, language);
                await saveTopicVersion(topic.id, language, text, "ai").catch(() => {});
                await loadVersions(topic.id, language);
                cachedIds = new Set([...cachedIds, topic.id]);
                // A reader's own sections are part of the lesson now: a
                // regeneration refills them from their own title and brief,
                // against the lesson that was just written.
                for (const section of customSections) {
                    if (ac.signal.aborted) break;
                    if (!section.title.trim() && !section.brief.trim()) continue;
                    await generateSection(section.id);
                }
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

    // Where a follow-up answer lands: the AI chat window, or inline under the
    // lesson so the whole thing stays one scroll.
    type FollowUpTarget = "chat" | "inline";
    const TARGET_KEY = "arabicStudyFollowUpTarget";

    function initialTarget(): FollowUpTarget {
        try {
            const stored = localStorage.getItem(TARGET_KEY);
            if (stored === "chat" || stored === "inline") return stored;
        } catch {
            /* ignore */
        }
        return "inline";
    }

    /**
     * Sections the reader adds themselves. They live beside the generated
     * lesson for the session rather than in its cached text — the cache holds
     * one AI-authored string per topic, and a reader's own section is not that.
     */
    interface CustomSection {
        /** Local key for the list; `storedId` is the database row. */
        id: number;
        storedId?: number;
        title: string;
        brief: string;
        content: string;
        expanded: boolean;
        loading: boolean;
        error: string;
        controller: AbortController | null;
    }
    let customSections = $state<CustomSection[]>([]);
    let nextSectionId = 0;

    // A new section lands at the bottom of a grid the reader may already have
    // scrolled past, so the toolbar button alone left them unsure it did
    // anything — this toast confirms it and points them at where to look.
    let sectionAddedToast = $state(false);
    let sectionAddedTimeout: ReturnType<typeof setTimeout> | undefined;

    /** Write one section back, remembering the id a new row is given. */
    async function persistSection(id: number) {
        const topic = selectedTopic;
        const section = customSections.find((s) => s.id === id);
        if (!topic || !section) return;
        try {
            const saved = await saveTopicSection({
                id: section.storedId,
                topicId: topic.id,
                locale: get(grammarLanguage),
                position: customSections.findIndex((s) => s.id === id),
                title: section.title,
                brief: section.brief,
                content: section.content,
                expanded: section.expanded,
            });
            if (section.storedId === undefined) updateSection(id, { storedId: saved.id });
        } catch {
            // No database here (browser dev); the section still works for the
            // session, it just will not survive a restart.
        }
    }

    // Opening a topic is the event worth recording; generating it is already
    // visible in the cached-lesson table.
    $effect(() => {
        if (selectedTopic) recordStudyActivity(STUDY_AREA.topics, selectedTopic.id);
    });

    // Load the reader's sections for whichever topic and language is on show.
    $effect(() => {
        const topic = selectedTopic;
        const locale = $grammarLanguage;
        if (!topic) {
            customSections = [];
            return;
        }
        void untrack(() =>
            fetchTopicSections(topic.id, locale)
                .then((rows) => {
                    customSections = rows.map((row) => ({
                        id: nextSectionId++,
                        storedId: row.id,
                        title: row.title,
                        brief: row.brief,
                        content: row.content,
                        expanded: row.expanded,
                        loading: false,
                        error: "",
                        controller: null,
                    }));
                })
                .catch(() => {
                    customSections = [];
                }),
        );
    });

    // ── Card annotations: comments and AI prompts pinned to a card ──────────

    let lessonAnnotations = $state<AnnotationDraft[]>([]);
    let nextAnnotationId = 0;
    const anchors = createAnchorRegistry();
    let anchorRects = $state<Record<string, AnchorRect>>({});
    let lessonBodyEl: HTMLDivElement | undefined = $state();
    let menuState = $state<{
        x: number;
        y: number;
        anchorKind: AnnotationAnchorKind;
        anchorSectionId: number | null;
    } | null>(null);
    let exportMenuOpen = $state(false);
    let exportBusy = $state(false);
    let exportError = $state("");

    function measureAnchors() {
        anchorRects = anchors.measureAll();
    }

    // Re-measure whenever something that can shift a card's position changes:
    // the streamed-in lesson, a section expanding, or a note being added.
    $effect(() => {
        void parsed;
        void customSections.map((s) => s.expanded);
        void lessonAnnotations.length;
        requestAnimationFrame(measureAnchors);
    });

    $effect(() => {
        if (!lessonBodyEl) return;
        const observer = new ResizeObserver(() => measureAnchors());
        observer.observe(lessonBodyEl);
        return () => observer.disconnect();
    });

    // Load the reader's comments/prompts for whichever topic and language is on show.
    $effect(() => {
        const topic = selectedTopic;
        const locale = $grammarLanguage;
        if (!topic) {
            lessonAnnotations = [];
            return;
        }
        void untrack(() =>
            fetchLessonAnnotations(topic.id, locale)
                .then((rows) => {
                    lessonAnnotations = rows.map((row) => ({
                        id: nextAnnotationId++,
                        storedId: row.id,
                        anchorKind: row.anchor_kind,
                        anchorSectionId: row.anchor_section_id,
                        kind: row.kind,
                        title: row.title,
                        brief: row.brief,
                        content: row.content,
                        offsetX: row.offset_x,
                        offsetY: row.offset_y,
                        loading: false,
                        error: "",
                        controller: null,
                    }));
                })
                .catch(() => {
                    lessonAnnotations = [];
                }),
        );
    });

    function anchorKey(kind: AnnotationAnchorKind, sectionId: number | null): string {
        return kind === "section" ? `section:${sectionId}` : kind;
    }

    function openMenu(event: MouseEvent, anchorKind: AnnotationAnchorKind, anchorSectionId: number | null = null) {
        event.stopPropagation();
        const width = 160;
        const height = 90;
        menuState = {
            x: Math.min(event.clientX, window.innerWidth - width - 8),
            y: Math.min(event.clientY, window.innerHeight - height - 8),
            anchorKind,
            anchorSectionId,
        };
    }

    /** Opens the Comment/Prompt menu unless the click landed on an interactive
     *  child (a button, an input, a quiz choice) that should handle it itself. */
    function handleCardClick(
        event: MouseEvent,
        anchorKind: AnnotationAnchorKind,
        anchorSectionId: number | null = null,
    ) {
        const target = event.target as HTMLElement;
        if (target.closest("button, input, textarea, a, select")) return;
        openMenu(event, anchorKind, anchorSectionId);
    }

    function closeMenu() {
        menuState = null;
    }

    function addAnnotation(kind: "comment" | "prompt", side: "left" | "right") {
        if (!menuState) return;
        const { anchorKind, anchorSectionId } = menuState;
        const siblings = lessonAnnotations.filter(
            (a) => a.anchorKind === anchorKind && a.anchorSectionId === anchorSectionId && sideOf(a) === side,
        );
        const anchorWidth = anchorRects[anchorKey(anchorKind, anchorSectionId)]?.width ?? 0;
        const baseOffsetX =
            side === "left" ? -(anchorWidth + ANNOTATION_CARD_WIDTH + ANNOTATION_GAP) : ANNOTATION_GAP;
        const id = nextAnnotationId++;
        lessonAnnotations = [
            ...lessonAnnotations,
            {
                id,
                anchorKind,
                anchorSectionId,
                kind,
                title: "",
                brief: "",
                content: "",
                offsetX: baseOffsetX,
                offsetY: siblings.length * 18,
                loading: false,
                error: "",
                controller: null,
            },
        ];
        closeMenu();
        void persistAnnotation(id);
    }

    /** Which side of its anchor a card currently sits on — for staggering new
     *  cards away from existing ones on the same side, not for persistence. */
    function sideOf(annotation: AnnotationDraft): "left" | "right" {
        return annotation.offsetX < 0 ? "left" : "right";
    }

    function updateAnnotation(id: number, patch: Partial<AnnotationDraft>) {
        lessonAnnotations = lessonAnnotations.map((a) => (a.id === id ? { ...a, ...patch } : a));
    }

    /** Write one annotation back, remembering the id a new row is given. */
    async function persistAnnotation(id: number) {
        const topic = selectedTopic;
        const annotation = lessonAnnotations.find((a) => a.id === id);
        if (!topic || !annotation) return;
        try {
            const saved = await saveLessonAnnotation({
                id: annotation.storedId,
                topicId: topic.id,
                locale: get(grammarLanguage),
                anchorKind: annotation.anchorKind,
                anchorSectionId: annotation.anchorSectionId,
                kind: annotation.kind,
                title: annotation.title,
                brief: annotation.brief,
                content: annotation.content,
                offsetX: annotation.offsetX,
                offsetY: annotation.offsetY,
            });
            if (annotation.storedId === undefined) updateAnnotation(id, { storedId: saved.id });
        } catch {
            // No database here (browser dev); the note still works for the
            // session, it just will not survive a restart.
        }
    }

    function removeAnnotation(id: number) {
        const annotation = lessonAnnotations.find((a) => a.id === id);
        annotation?.controller?.abort();
        if (annotation?.storedId !== undefined) void deleteLessonAnnotation(annotation.storedId).catch(() => {});
        lessonAnnotations = lessonAnnotations.filter((a) => a.id !== id);
    }

    /** Plain-text summary of one card's current content, for scoping a Prompt's
     *  AI call to "this card" instead of the whole lesson. */
    function anchorContextText(anchorKind: AnnotationAnchorKind, anchorSectionId: number | null): string {
        switch (anchorKind) {
            case "explanation":
                return parsed.explanation;
            case "quran":
                return groundedQuran.map((ex) => `${ex.arabic} — ${ex.translation ?? ex.gloss}`).join("\n");
            case "everyday":
                return parsed.everyday.map((ex) => `${ex.word} — ${ex.gloss}`).join("\n");
            case "exercises":
                return parsed.exercises.map((ex) => `${ex.sentence} (${ex.answer})`).join("\n");
            case "section": {
                const section = customSections.find((s) => s.storedId === anchorSectionId);
                return section ? `${section.title}\n${section.content || section.brief}` : "";
            }
            default:
                return "";
        }
    }

    async function generateAnnotation(id: number) {
        const annotation = lessonAnnotations.find((a) => a.id === id);
        const topic = selectedTopic;
        if (!annotation || !topic || annotation.loading) return;
        annotation.controller?.abort();
        const ac = new AbortController();
        updateAnnotation(id, { loading: true, error: "", content: "", controller: ac });
        try {
            const text = await fetchLessonSection({
                topicTitle: topic.label,
                sectionTitle: annotation.title.trim() || $t("arabicStudy.grammar.section_untitled"),
                brief: annotation.brief.trim(),
                lesson: anchorContextText(annotation.anchorKind, annotation.anchorSectionId),
                locale: get(grammarLanguage),
                level,
                advanced: get(grammarModel) === "advanced" && get(isPro),
                signal: ac.signal,
                onPartial: (partial) => {
                    if (!ac.signal.aborted) updateAnnotation(id, { content: partial });
                },
            });
            if (!ac.signal.aborted) {
                updateAnnotation(id, { content: text });
                await persistAnnotation(id);
            }
        } catch (e) {
            if (!ac.signal.aborted) {
                const failure = quotaFailure(e);
                updateAnnotation(id, {
                    error: failure
                        ? $t(quotaMessageKey(failure), {
                              detail: failure.message,
                              time: formatRetryWindow(failure.retryAfterSeconds),
                          })
                        : e instanceof Error
                          ? e.message
                          : String(e),
                });
            }
        } finally {
            updateAnnotation(id, { loading: false, controller: null });
        }
    }

    /** Screen position for one floating card: its anchor's box plus its own offset. */
    function annotationPosition(annotation: AnnotationDraft): { left: number; top: number } {
        const anchor = anchorRects[anchorKey(annotation.anchorKind, annotation.anchorSectionId)];
        if (!anchor) return { left: annotation.offsetX, top: annotation.offsetY };
        return { left: anchor.left + anchor.width + annotation.offsetX, top: anchor.top + annotation.offsetY };
    }

    function buildExportCards(): ExportBox[] {
        const cards: ExportBox[] = [];
        const push = (key: string, title: string, body: string) => {
            const rect = anchorRects[key];
            if (!rect) return;
            cards.push({ key, title, body, left: rect.left, top: rect.top, width: rect.width, height: rect.height });
        };
        push("explanation", parsed.title || selectedTopic?.label || "", parsed.explanation);
        push(
            "quran",
            $t("arabicStudy.alphabet.from_quran"),
            groundedQuran.map((ex) => `${ex.arabic} — ${ex.translation ?? ex.gloss}`).join("\n"),
        );
        push(
            "everyday",
            $t("arabicStudy.alphabet.everyday"),
            parsed.everyday.map((ex) => `${ex.word} — ${ex.gloss}`).join("\n"),
        );
        push("exercises", $t("arabicStudy.grammar.try_it"), parsed.exercises.map((ex) => ex.sentence).join("\n"));
        for (const section of customSections) {
            if (section.storedId === undefined) continue;
            push(`section:${section.storedId}`, section.title, section.content || section.brief);
        }
        return cards;
    }

    function buildExportAnnotations(): ExportAnnotation[] {
        return lessonAnnotations.map((a) => {
            const pos = annotationPosition(a);
            return {
                key: `annotation:${a.id}`,
                anchorKey: anchorKey(a.anchorKind, a.anchorSectionId),
                title: a.title,
                body: a.kind === "comment" ? a.content : `${a.brief}\n${a.content}`,
                left: pos.left,
                top: pos.top,
                width: 256,
                height: 120,
            };
        });
    }

    async function runExport(kind: "svg" | "pdf") {
        exportMenuOpen = false;
        exportBusy = true;
        exportError = "";
        try {
            const cards = buildExportCards();
            const exported = buildExportAnnotations();
            const title = parsed.title || selectedTopic?.label || "lesson";
            const ok =
                kind === "svg"
                    ? await exportLessonSvg(title, cards, exported)
                    : await exportLessonPdf(title, cards, exported);
            if (!ok) return;
        } catch (e) {
            exportError = e instanceof Error ? e.message : String(e);
        } finally {
            exportBusy = false;
        }
    }

    function addSection() {
        const id = nextSectionId++;
        customSections = [
            ...customSections,
            {
                id,
                title: "",
                brief: "",
                content: "",
                expanded: false,
                loading: false,
                error: "",
                controller: null,
            },
        ];
        void persistSection(id);

        sectionAddedToast = true;
        clearTimeout(sectionAddedTimeout);
        sectionAddedTimeout = setTimeout(() => (sectionAddedToast = false), 2500);
    }

    function removeSection(id: number) {
        const section = customSections.find((s) => s.id === id);
        section?.controller?.abort();
        if (section?.storedId !== undefined) void deleteTopicSection(section.storedId).catch(() => {});
        customSections = customSections.filter((s) => s.id !== id);
    }

    function updateSection(id: number, patch: Partial<CustomSection>) {
        customSections = customSections.map((s) => (s.id === id ? { ...s, ...patch } : s));
    }

    async function generateSection(id: number) {
        const section = customSections.find((s) => s.id === id);
        const topic = selectedTopic;
        if (!section || !topic || section.loading) return;
        section.controller?.abort();
        const ac = new AbortController();
        updateSection(id, { loading: true, error: "", content: "", controller: ac });
        try {
            const text = await fetchLessonSection({
                topicTitle: topic.label,
                sectionTitle: section.title.trim() || $t("arabicStudy.grammar.section_untitled"),
                brief: section.brief.trim(),
                lesson: rawContent,
                // The header's language governs, whatever language the reader
                // typed their title and brief in.
                locale: get(grammarLanguage),
                level,
                advanced: get(grammarModel) === "advanced" && get(isPro),
                signal: ac.signal,
                onPartial: (partial) => {
                    if (!ac.signal.aborted) updateSection(id, { content: partial });
                },
            });
            if (!ac.signal.aborted) {
                updateSection(id, { content: text });
                await persistSection(id);
            }
        } catch (e) {
            if (!ac.signal.aborted) {
                const failure = quotaFailure(e);
                updateSection(id, {
                    error: failure
                        ? $t(quotaMessageKey(failure), {
                              detail: failure.message,
                              time: formatRetryWindow(failure.retryAfterSeconds),
                          })
                        : e instanceof Error
                          ? e.message
                          : String(e),
                });
            }
        } finally {
            updateSection(id, { loading: false, controller: null });
        }
    }

    /**
     * The lesson scrolls inside a 4px-wide scrollbar gutter (see .default-scroll),
     * so its content centres in a box that narrow. The floating ask box is
     * positioned against the pane itself, which includes the gutter — without
     * subtracting it the pill sits half a scrollbar to the right of the text it
     * floats over.
     */
    let lessonScroll = $state<HTMLElement | null>(null);
    let scrollGutter = $state(0);

    $effect(() => {
        const node = lessonScroll;
        if (!node) return;
        const measure = () => (scrollGutter = node.offsetWidth - node.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    });

    let followUpText = $state("");
    let followUpTarget = $state<FollowUpTarget>(initialTarget());
    let targetMenuOpen = $state(false);
    let followUpTurns = $state<FollowUpTurn[]>([]);
    let followUpPending = $state("");
    let followUpLoading = $state(false);
    let followUpError = $state("");
    let followUpController: AbortController | null = null;

    function setFollowUpTarget(target: FollowUpTarget) {
        followUpTarget = target;
        targetMenuOpen = false;
        try {
            localStorage.setItem(TARGET_KEY, target);
        } catch {
            /* ignore */
        }
    }

    async function askFollowUp(prompt: string) {
        const question = prompt.trim();
        if (!question || !selectedTopic) return;
        recordStudyActivity(STUDY_AREA.followUps, selectedTopic.id);

        if (followUpTarget === "chat") {
            // The chat window keeps its own thread; the lesson goes with the
            // first question only, the same economy the inline thread uses.
            askAiAboutSelection({
                prompt: question,
                selectedText: parsed.title || selectedTopic.label,
                contextPrompt: followUpTurns.length === 0 ? rawContent : "",
                feature: `${AI_FEATURE_TAGS.arabicStudyGrammarTopic}_${level}`,
            });
            followUpTurns = [
                ...followUpTurns,
                { role: "user", content: question },
                { role: "assistant", content: "" },
            ];
            followUpText = "";
            return;
        }

        followUpController?.abort();
        const ac = new AbortController();
        followUpController = ac;
        followUpText = "";
        followUpError = "";
        followUpPending = "";
        followUpLoading = true;
        const history = followUpTurns.filter((turn) => turn.content.trim() !== "");
        try {
            const answer = await askLessonFollowUp({
                question,
                lesson: rawContent,
                history,
                locale: get(grammarLanguage),
                level,
                advanced: get(grammarModel) === "advanced" && get(isPro),
                signal: ac.signal,
                onPartial: (partial) => {
                    if (!ac.signal.aborted) followUpPending = partial;
                },
            });
            if (ac.signal.aborted) return;
            followUpTurns = [
                ...history,
                { role: "user", content: question },
                { role: "assistant", content: answer },
            ];
        } catch (e) {
            if (!ac.signal.aborted) {
                const failure = quotaFailure(e);
                followUpError = failure
                    ? $t(quotaMessageKey(failure), {
                          detail: failure.message,
                          time: formatRetryWindow(failure.retryAfterSeconds),
                      })
                    : e instanceof Error
                      ? e.message
                      : String(e);
            }
        } finally {
            if (followUpController === ac) {
                followUpLoading = false;
                followUpPending = "";
                followUpController = null;
            }
        }
    }

    const moreTopics = $derived(
        topics.filter((tp) => tp.id !== selectedId).slice(0, 3),
    );
</script>

<div class="relative flex min-h-0 flex-1 overflow-hidden bg-white dark:bg-[#303446]">
    <!-- Topic sidebar — a docked panel when open; just the two buttons,
         floating with no panel of their own, once it is hidden. -->
    <div
        class={sidebarOpen
            ? "flex w-56 shrink-0 flex-col border-r border-brand-sand-200 bg-brand-sand-50 dark:border-[#414559] dark:bg-[#232634]"
            : "absolute bottom-3 left-2 z-30 flex items-center gap-1"}
    >
        {#if sidebarOpen}
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
        {/if}

        <div class="flex shrink-0 items-center gap-1 {sidebarOpen ? 'px-2 py-3' : ''}">
            <button
                onclick={onBack}
                title={$t("arabicStudy.grammar.back")}
                aria-label={$t("arabicStudy.grammar.back")}
                class="flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-brand-charcoal-400 hover:bg-white/60 hover:text-brand-charcoal-600 dark:text-[#838ba7] dark:hover:bg-[#292c3c]/60 dark:hover:text-[#c6d0f5]"
            >
                <Icon icon="solar:arrow-left-linear" width="0.9rem" />
            </button>
            <button
                onclick={() => (sidebarOpen = !sidebarOpen)}
                title={sidebarOpen
                    ? $t("arabicStudy.grammar.sidebar_hide")
                    : $t("arabicStudy.grammar.sidebar_show")}
                aria-label={sidebarOpen
                    ? $t("arabicStudy.grammar.sidebar_hide")
                    : $t("arabicStudy.grammar.sidebar_show")}
                class="flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-brand-charcoal-400 hover:bg-white/60 hover:text-brand-charcoal-600 dark:text-[#838ba7] dark:hover:bg-[#292c3c]/60 dark:hover:text-[#c6d0f5]"
            >
                <Icon
                    icon={sidebarOpen
                        ? "solar:sidebar-minimalistic-bold-duotone"
                        : "solar:sidebar-minimalistic-bold"}
                    width="0.9rem"
                />
            </button>
        </div>
    </div>

    <!-- Lesson -->
    <div class="relative flex min-h-0 flex-1 flex-col">
        {#if sectionAddedToast}
            <div class="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
                <div
                    in:fly={{ y: -16, duration: 200 }}
                    out:fly={{ y: -16, duration: 150 }}
                    class="flex items-center gap-1.5 rounded-full border border-brand-emerald-300 bg-brand-emerald-50 px-3 py-1.5 text-[0.6875rem] font-semibold text-brand-emerald-600 shadow-lg shadow-stone-300/30 dark:border-[#3d9b86] dark:bg-[#292c3c] dark:text-[#9dd4c8] dark:shadow-black/40"
                >
                    <Icon icon="solar:check-circle-bold-duotone" width="0.85rem" />
                    {$t("arabicStudy.grammar.section_added")}
                </div>
            </div>
        {/if}
        <div
            bind:this={lessonScroll}
            class="default-scroll flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
            <div class="flex flex-1 justify-center px-6 pb-16 pt-6">
                <div bind:this={lessonBodyEl} class="relative flex w-full max-w-2xl flex-col gap-4">
                    {#if !$isPro && !rawContent}
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
                            use:anchors.ref={"explanation"}
                            onclick={(e) => handleCardClick(e, "explanation")}
                            class="cursor-pointer rounded-2xl border border-[#e6cf96] bg-linear-to-b from-[#fdf6e6] to-white p-5 shadow-sm shadow-transparent transition-shadow duration-150 hover:shadow-md hover:shadow-stone-300/40 dark:border-[#6b5b37] dark:from-[#34302a] dark:to-[#292c3c] dark:hover:shadow-black/30"
                        >
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <!-- The shipped English lessons were written for
                                     the app, not by the model on this machine —
                                     so the badge says which one you are reading. -->
                                <span
                                    class="inline-flex items-center gap-1.5 rounded-lg border border-brand-gold-400 bg-brand-gold-100 px-2.5 py-1 text-[0.625rem] font-semibold text-brand-gold-600 dark:bg-[#e5c890]/30 dark:text-[#e5c890]"
                                >
                                    <Icon
                                        icon={activeSource === "premade"
                                            ? "solar:book-bookmark-bold-duotone"
                                            : "solar:bolt-bold-duotone"}
                                        width="0.65rem"
                                    />
                                    {activeSource === "premade"
                                        ? $t("arabicStudy.grammar.premade_badge")
                                        : $t("arabicStudy.grammar.ai_badge")}
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
                            {#if selectedTopic}
                            <p class="text-[0.75rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                                {$t(`arabicStudy.topic.${selectedTopic.id}`)}
                            </p>
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

                        {#if $isPro}
                        <!-- Lesson tools -->
                        <div
                            class="flex items-center gap-2 rounded-xl border border-brand-sand-200 bg-brand-sand-50 px-2.5 py-1.5 dark:border-[#414559] dark:bg-[#232634]"
                        >
                            <span
                                class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                            >
                                {$t("arabicStudy.grammar.toolbar")}
                            </span>
                            <button
                                onclick={addSection}
                                class="flex cursor-pointer items-center gap-1 rounded-full border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.625rem] font-semibold text-brand-charcoal-500 transition-colors hover:bg-brand-sand-100 dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5] dark:hover:bg-[#363a4f]"
                            >
                                <Icon icon="solar:add-square-linear" width="0.7rem" />
                                {$t("arabicStudy.grammar.add_section")}
                            </button>
                            <div class="relative ml-auto">
                                <button
                                    onclick={() => (exportMenuOpen = !exportMenuOpen)}
                                    disabled={exportBusy}
                                    class="flex cursor-pointer items-center gap-1 rounded-full border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.625rem] font-semibold text-brand-charcoal-500 transition-colors hover:bg-brand-sand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5] dark:hover:bg-[#363a4f]"
                                >
                                    <Icon
                                        icon={exportBusy ? "svg-spinners:180-ring-with-bg" : "solar:download-minimalistic-linear"}
                                        width="0.7rem"
                                    />
                                    {$t("arabicStudy.grammar.export")}
                                </button>
                                {#if exportMenuOpen}
                                    <div
                                        role="presentation"
                                        class="fixed inset-0"
                                        style="z-index: 40;"
                                        onclick={() => (exportMenuOpen = false)}
                                    ></div>
                                    <div
                                        class="absolute right-0 top-full mt-1 min-w-32 rounded-xl border border-brand-sand-200 bg-white p-1 shadow-lg dark:border-[#414559] dark:bg-[#292c3c]"
                                        style="z-index: 50;"
                                    >
                                        <button
                                            onclick={() => runExport("svg")}
                                            class="flex w-full cursor-pointer items-center rounded-lg px-2 py-1 text-left text-[0.625rem] font-semibold text-brand-charcoal-500 hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#363a4f]"
                                        >
                                            {$t("arabicStudy.grammar.export_svg")}
                                        </button>
                                        <button
                                            onclick={() => runExport("pdf")}
                                            class="flex w-full cursor-pointer items-center rounded-lg px-2 py-1 text-left text-[0.625rem] font-semibold text-brand-charcoal-500 hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#363a4f]"
                                        >
                                            {$t("arabicStudy.grammar.export_pdf")}
                                        </button>
                                    </div>
                                {/if}
                            </div>
                        </div>
                        {#if exportError}
                            <p class="text-[0.625rem] text-red-500 dark:text-red-400">{exportError}</p>
                        {/if}
                        {/if}

                    <!-- From the Qur'an / Everyday Arabic — always shown, with
                         the reader's own sections filling the cells below. -->
                        <div class="grid grid-cols-2 gap-3">
                            <div
                                use:anchors.ref={"quran"}
                                onclick={(e) => handleCardClick(e, "quran")}
                                class="flex-1 cursor-pointer rounded-2xl border border-brand-emerald-200 bg-brand-emerald-50 p-3 shadow-sm shadow-transparent transition-shadow duration-150 hover:shadow-md hover:shadow-stone-300/40 dark:border-[#414559] dark:bg-[#292c3c] dark:hover:shadow-black/30"
                            >
                                <span
                                    class="rounded-full bg-brand-emerald-100 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-brand-emerald-600 dark:bg-[#414559] dark:text-[#9dd4c8]"
                                >
                                    {$t("arabicStudy.alphabet.from_quran")}
                                </span>
                                {#if groundedQuran.length}
                                    <div class="mt-2 flex flex-col gap-3">
                                        {#each groundedQuran as example, i (i)}
                                            <div class={i > 0 ? "border-t border-brand-emerald-200/60 pt-3 dark:border-[#414559]" : ""}>
                                                <div dir="rtl" class="pb-2 font-scheherazade text-lg leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                                    {example.arabic}
                                                </div>
                                                {#if example.translation}
                                                    <p class="mt-1 text-[0.65625rem] italic leading-relaxed text-brand-charcoal-500 dark:text-[#c6d0f5]">
                                                        {example.translation}
                                                    </p>
                                                {:else if aiVerseTranslations.get(example.ref)}
                                                    <p class="mt-1 text-[0.65625rem] italic leading-relaxed text-brand-charcoal-500 dark:text-[#c6d0f5]">
                                                        {aiVerseTranslations.get(example.ref)}
                                                        <span
                                                            class="ml-1 rounded-full bg-brand-gold-100 px-1.5 py-px align-middle text-[0.5rem] font-bold uppercase not-italic tracking-wide text-brand-gold-600 dark:bg-[#414559] dark:text-[#e5c890]"
                                                            title={$t("arabicStudy.grammar.ai_translation_hint")}
                                                        >
                                                            {$t("arabicStudy.grammar.ai_translation")}
                                                        </span>
                                                    </p>
                                                {/if}
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
                                {:else if versesChecked && parsed.quran.length}
                                    <p class="mt-2 text-[0.65625rem] leading-relaxed text-brand-charcoal-400 dark:text-[#838ba7]">
                                        {$t("arabicStudy.grammar.no_verified_examples")}
                                    </p>
                                {:else}
                                    <div class="mt-2 flex flex-col gap-1.5">
                                        <div class="h-5 w-2/3 animate-pulse rounded bg-brand-emerald-100 dark:bg-[#414559]"></div>
                                        <div class="h-2.5 w-full animate-pulse rounded bg-brand-emerald-100 dark:bg-[#414559]"></div>
                                    </div>
                                {/if}
                            </div>
                            <div
                                use:anchors.ref={"everyday"}
                                onclick={(e) => handleCardClick(e, "everyday")}
                                class="flex-1 cursor-pointer rounded-2xl border border-brand-teal-200 bg-brand-teal-50 p-3 shadow-sm shadow-transparent transition-shadow duration-150 hover:shadow-md hover:shadow-stone-300/40 dark:border-[#414559] dark:bg-[#292c3c] dark:hover:shadow-black/30"
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

                            {#each customSections as section (section.id)}
                                <!-- One column by default, so it lands under
                                     "From the Qur'an"; two when widened, so it
                                     runs under both example cards. -->
                                <div
                                    use:anchors.ref={`section:${section.storedId ?? section.id}`}
                                    onclick={(e) =>
                                        section.storedId !== undefined &&
                                        handleCardClick(e, "section", section.storedId)}
                                    class="cursor-pointer rounded-2xl border border-[#cfc4e8] bg-[#f5f1fb] p-3 shadow-sm shadow-transparent transition-shadow duration-150 hover:shadow-md hover:shadow-stone-300/40 dark:border-[#4e4a6b] dark:bg-[#2b2a3d] dark:hover:shadow-black/30 {section.expanded
                                        ? 'col-span-2'
                                        : 'col-span-1'}"
                                >
                                    <div class="flex items-center gap-1.5">
                                        <input
                                            value={section.title}
                                            oninput={(e) =>
                                                updateSection(section.id, { title: e.currentTarget.value })}
                                            readonly={!$isPro}
                                            onblur={() => persistSection(section.id)}
                                            placeholder={$t("arabicStudy.grammar.section_title")}
                                            class="min-w-0 flex-1 rounded-lg border border-[#cfc4e8] bg-white/70 px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-charcoal-700 outline-none placeholder:font-normal placeholder:text-brand-charcoal-300 focus:border-[#a999d6] dark:border-[#4e4a6b] dark:bg-[#232634] dark:text-[#c6d0f5] dark:placeholder:text-[#626880]"
                                        />
                                        <button
                                            onclick={() => {
                                                updateSection(section.id, { expanded: !section.expanded });
                                                void persistSection(section.id);
                                            }}
                                            title={$t(section.expanded
                                                ? "arabicStudy.grammar.section_collapse"
                                                : "arabicStudy.grammar.section_expand")}
                                            aria-label={$t(section.expanded
                                                ? "arabicStudy.grammar.section_collapse"
                                                : "arabicStudy.grammar.section_expand")}
                                            class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg text-brand-charcoal-400 transition-colors hover:bg-white/70 dark:text-[#838ba7] dark:hover:bg-[#232634]"
                                        >
                                            <Icon
                                                icon={section.expanded
                                                    ? "solar:minimize-square-linear"
                                                    : "solar:maximize-square-linear"}
                                                width="0.8rem"
                                            />
                                        </button>
                                        <button
                                            onclick={() => removeSection(section.id)}
                                            title={$t("arabicStudy.grammar.section_remove")}
                                            aria-label={$t("arabicStudy.grammar.section_remove")}
                                            class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg text-brand-charcoal-400 transition-colors hover:bg-white/70 hover:text-red-500 dark:text-[#838ba7] dark:hover:bg-[#232634]"
                                        >
                                            <Icon icon="solar:trash-bin-trash-linear" width="0.8rem" />
                                        </button>
                                    </div>
                                    <input
                                        value={section.brief}
                                        oninput={(e) =>
                                            updateSection(section.id, { brief: e.currentTarget.value })}
                                        readonly={!$isPro}
                                        onblur={() => persistSection(section.id)}
                                        placeholder={$t("arabicStudy.grammar.section_brief")}
                                        class="mt-1.5 w-full rounded-lg border border-[#cfc4e8] bg-white/70 px-2 py-0.5 text-[0.625rem] text-brand-charcoal-600 outline-none placeholder:text-brand-charcoal-300 focus:border-[#a999d6] dark:border-[#4e4a6b] dark:bg-[#232634] dark:text-[#c6d0f5] dark:placeholder:text-[#626880]"
                                    />
                                    {#if !section.content && !section.loading}
                                        <p class="mt-1 text-[0.5625rem] leading-snug text-brand-charcoal-400 dark:text-[#838ba7]">
                                            {$t("arabicStudy.grammar.section_brief_hint")}
                                        </p>
                                    {/if}
                                    {#if $isPro}
                                    <div class="mt-2 flex items-center gap-2">
                                        <button
                                            onclick={() => generateSection(section.id)}
                                            disabled={section.loading ||
                                                (!section.title.trim() && !section.brief.trim())}
                                            class="flex cursor-pointer items-center gap-1 rounded-full border border-[#cfc4e8] bg-white/80 px-2 py-0.5 text-[0.625rem] font-semibold text-[#6b5ba8] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#4e4a6b] dark:bg-[#232634] dark:text-[#c3b6ea] dark:hover:bg-[#363a4f]"
                                        >
                                            <Icon
                                                icon={section.loading
                                                    ? "svg-spinners:180-ring-with-bg"
                                                    : "solar:magic-stick-3-bold-duotone"}
                                                width="0.7rem"
                                            />
                                            {$t("arabicStudy.grammar.section_generate")}
                                        </button>
                                    </div>
                                    {/if}
                                    {#if section.content}
                                        <div class="topic-explanation mt-2 text-[0.71875rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                                            {@html renderMarkdown(section.content)}
                                        </div>
                                    {/if}
                                    {#if section.error}
                                        <p class="mt-2 text-[0.625rem] text-red-500 dark:text-red-400">
                                            {section.error}
                                        </p>
                                    {/if}
                                </div>
                            {/each}
                        </div>

                        <!-- Try It — always shown -->
                        <div
                            use:anchors.ref={"exercises"}
                            onclick={(e) => handleCardClick(e, "exercises")}
                            class="cursor-pointer rounded-2xl border border-brand-sand-200 bg-white p-4 shadow-sm shadow-transparent transition-shadow duration-150 hover:shadow-md hover:shadow-stone-300/40 dark:border-[#414559] dark:bg-[#292c3c] dark:hover:shadow-black/30"
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
                                                {#each exercise.choices as choice, choiceIndex (choiceIndex)}
                                                    {@const isAnswer = choice === exercise.answer}
                                                    {@const revealed = picked !== undefined}
                                                    <button
                                                        onclick={() => {
                                                            quizPicked = { ...quizPicked, [index]: choice };
                                                            if (selectedTopic) {
                                                                recordStudyActivity(
                                                                    STUDY_AREA.exercises,
                                                                    `${selectedTopic.id}:${index}`,
                                                                );
                                                            }
                                                        }}
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

                        <!-- Comment/prompt links, and the floating cards themselves —
                             absolutely positioned within the relative lesson-body
                             wrapper so they scroll with the content they annotate. -->
                        <svg class="pointer-events-none absolute inset-0 z-20 overflow-visible">
                            {#each lessonAnnotations as annotation (annotation.id)}
                                {@const anchor = anchorRects[anchorKey(annotation.anchorKind, annotation.anchorSectionId)]}
                                {#if anchor}
                                    {@const pos = annotationPosition(annotation)}
                                    {@const ends = linkEndpoints(anchor, { ...pos, width: ANNOTATION_CARD_WIDTH })}
                                    <path
                                        d={linkPath(ends.x1, ends.y1, ends.x2, ends.y2, ends.dir)}
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        class="text-brand-gold-400/80 dark:text-[#e5c890]/70"
                                    />
                                    <circle
                                        cx={ends.x2}
                                        cy={ends.y2}
                                        r="3"
                                        fill="currentColor"
                                        class="text-brand-gold-400/80 dark:text-[#e5c890]/70"
                                    />
                                {/if}
                            {/each}
                        </svg>
                        {#each lessonAnnotations as annotation (annotation.id)}
                            {@const pos = annotationPosition(annotation)}
                            <FloatingAnnotationCard
                                {annotation}
                                left={pos.left}
                                top={pos.top}
                                onUpdate={(patch) => updateAnnotation(annotation.id, patch)}
                                onDragMove={(offsetX, offsetY) =>
                                    updateAnnotation(annotation.id, { offsetX, offsetY })}
                                onDragEnd={() => persistAnnotation(annotation.id)}
                                onPersist={() => persistAnnotation(annotation.id)}
                                onGenerate={() => generateAnnotation(annotation.id)}
                                onDelete={() => removeAnnotation(annotation.id)}
                            />
                        {/each}

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

                        {#if followUpTurns.length || followUpPending || followUpError}
                            <div
                                class="rounded-2xl border border-brand-sand-200 bg-white p-4 dark:border-[#414559] dark:bg-[#292c3c]"
                            >
                                <div class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">
                                    {$t("arabicStudy.grammar.follow_up_thread")}
                                </div>
                                <div class="mt-2 flex flex-col gap-3">
                                    {#each followUpTurns as turn, i (i)}
                                        {#if turn.content.trim()}
                                            <div class={turn.role === "user" ? "" : "topic-explanation"}>
                                                {#if turn.role === "user"}
                                                    <p class="text-[0.6875rem] font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">
                                                        {turn.content}
                                                    </p>
                                                {:else}
                                                    <div class="text-[0.71875rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                                                        {@html renderMarkdown(turn.content)}
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                    {/each}
                                    {#if followUpPending}
                                        <div class="topic-explanation text-[0.71875rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                                            {@html renderMarkdown(followUpPending)}
                                        </div>
                                    {:else if followUpLoading}
                                        <p class="flex items-center gap-1.5 text-[0.6875rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                                            <Icon icon="svg-spinners:3-dots-fade" width="0.9rem" />
                                            {$t("arabicStudy.grammar.loading")}
                                        </p>
                                    {/if}
                                    {#if followUpError}
                                        <p class="text-[0.6875rem] text-red-500 dark:text-red-400">{followUpError}</p>
                                    {/if}
                                </div>
                            </div>
                        {/if}

                        <!-- The model rides with the button that spends it, same as
                             the take-home message's generate control. -->
                        {#if !$isPro}
                            <p class="self-center text-center text-[0.6875rem] leading-relaxed text-brand-charcoal-400 dark:text-[#838ba7]">
                                {rawContent
                                    ? $t("arabicStudy.grammar.saved_locally")
                                    : $t("arabicStudy.grammar.premade_only_en")}
                            </p>
                        {:else if notStarted}
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
        </div>

        <!-- Floats over the lesson rather than sitting in a footer bar of its
             own — same glass panel, rounding and shadow as the recitation
             player, which floats over the parchment the same way. -->
        {#if $isPro}
            <div
                class="pointer-events-none absolute bottom-3 left-0 z-20 flex justify-center px-6"
                style:right="{scrollGutter}px"
            >
                <div
                    class="glass-panel pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-brand-sand-200/80 bg-white/90 py-1.5 pl-4 pr-1.5 shadow-md shadow-stone-300/20 backdrop-blur-md dark:border-[#414559] dark:bg-[#292c3c]/95 dark:shadow-black/20"
                >
                    <input
                        type="text"
                        bind:value={followUpText}
                        onkeydown={(e) => e.key === "Enter" && askFollowUp(followUpText)}
                        placeholder={$t("arabicStudy.grammar.ask_placeholder")}
                        class="min-w-0 flex-1 bg-transparent text-[0.6875rem] text-brand-charcoal-900 placeholder-brand-charcoal-300 outline-none dark:text-[#c6d0f5] dark:placeholder-[#626880]"
                    />
                    <div class="relative flex shrink-0">
                        <button
                            onclick={() => (targetMenuOpen = !targetMenuOpen)}
                            title={$t("arabicStudy.grammar.answer_where")}
                            aria-label={$t("arabicStudy.grammar.answer_where")}
                            class="flex cursor-pointer items-center gap-0.5 rounded-full px-1.5 py-1 text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 dark:text-[#838ba7] dark:hover:bg-[#414559]"
                        >
                            <Icon
                                icon={followUpTarget === "chat"
                                    ? "solar:chat-round-line-bold-duotone"
                                    : "solar:document-text-bold-duotone"}
                                width="0.8rem"
                            />
                            <Icon
                                icon="solar:alt-arrow-down-bold"
                                width="0.55rem"
                                class={targetMenuOpen ? "rotate-180" : ""}
                            />
                        </button>
                        {#if targetMenuOpen}
                            <!-- svelte-ignore a11y_no_redundant_roles -->
                            <button
                                type="button"
                                tabindex="-1"
                                aria-label={$t("common.close")}
                                class="fixed inset-0 z-10 cursor-default"
                                onclick={() => (targetMenuOpen = false)}
                            ></button>
                            <div
                                class="absolute bottom-full right-0 z-20 mb-2 w-48 overflow-hidden rounded-xl border border-brand-sand-200 bg-white py-1 shadow-lg dark:border-[#414559] dark:bg-[#303446]"
                            >
                                {#each [["inline", "arabicStudy.grammar.answer_here", "solar:document-text-bold-duotone"], ["chat", "arabicStudy.grammar.answer_chat", "solar:chat-round-line-bold-duotone"]] as const as [value, labelKey, icon] (value)}
                                    <button
                                        onclick={() => setFollowUpTarget(value)}
                                        class="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 text-left text-[0.6875rem] font-semibold transition-colors hover:bg-brand-sand-100 dark:hover:bg-[#414559] {followUpTarget ===
                                        value
                                            ? 'text-brand-gold-600 dark:text-[#e5c890]'
                                            : 'text-brand-charcoal-500 dark:text-[#c6d0f5]'}"
                                    >
                                        <Icon {icon} width="0.7rem" />
                                        {$t(labelKey)}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <button
                        onclick={() => askFollowUp(followUpText)}
                        disabled={!followUpText.trim() || followUpLoading}
                        class="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand-gold-400 text-gray-100 transition-colors hover:bg-brand-gold-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-gold-500 dark:text-gray-800"
                    >
                        <Icon
                            icon={followUpLoading
                                ? "svg-spinners:180-ring-with-bg"
                                : "solar:arrow-right-linear"}
                            width="0.75rem"
                        />
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

{#if menuState}
    <AnnotationMenu
        x={menuState.x}
        y={menuState.y}
        onChoose={(kind, side) => addAnnotation(kind, side)}
        onClose={closeMenu}
    />
{/if}

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
