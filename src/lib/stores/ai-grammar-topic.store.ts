import { writable } from "svelte/store";
import { supabase } from "$lib/supabase";
import {
    readSseText,
    safeReadJson,
    type AiModelClass,
    type SseMeta,
} from "$lib/stores/ai-text-transform.store";
import { AI_FEATURE_TAGS } from "$lib/stores/ai-chat.store";

// The intermediate/advanced grammar curriculum: an AI-generated lesson for
// one named topic (not one specific ayah — see ai-verse-grammar.store.ts for
// that). Structured into marker sections so the UI can place each piece —
// title, explanation, a Qur'anic example, an everyday example, and a short
// quiz — independently, the same way ai-takehome.store.ts's `@@id@@`
// sections work. Pro-gated by the caller via `isPro`, same as every other AI
// surface in this app.

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** The learner's chosen model tier for this feature specifically — separate
 * from `aiTextDefaultModel` (that one's scoped to the text-transform
 * actions), persisted the same way. Advanced is Pro+-gated by the caller,
 * same as `useAdvanced` in ai-chat.store.ts. */
const GRAMMAR_MODEL_KEY = "arabic-grammar-model";

function loadGrammarModel(): AiModelClass {
    try {
        const stored = localStorage.getItem(GRAMMAR_MODEL_KEY);
        if (stored === "advanced" || stored === "standard") return stored;
        // Never chosen for this lesson: follow the AI Tools default from
        // Settings, which is where a reader would expect to set it once.
        const fallback = localStorage.getItem("ai-text-default-model");
        if (fallback === "advanced" || fallback === "standard") return fallback;
    } catch {
        /* ignore */
    }
    return "standard";
}

const _grammarModel = writable<AiModelClass>(loadGrammarModel());

export const grammarModel = {
    subscribe: _grammarModel.subscribe,
    set(value: AiModelClass) {
        try {
            localStorage.setItem(GRAMMAR_MODEL_KEY, value);
        } catch {
            /* ignore */
        }
        _grammarModel.set(value);
    },
};

// One lesson is asked for in two passes. The edge function caps a completion at
// OPENAI_MAX_COMPLETION_TOKENS (8000 by default) and reasoning tokens come out
// of that same budget, so asking for the explanation, the examples and the
// exercises in one go runs dry partway down the list — the reader gets a lesson
// that stops mid-sentence. Two smaller requests each fit, and their markers
// concatenate into one document the parser reads exactly as before.

const SHARED_RULES =
    "You are an Arabic grammar (naḥw/ṣarf) and rhetoric (balāgha) teacher, writing one " +
    "short lesson for a named topic in Qur'anic Arabic. You already know Arabic grammar " +
    "and the Qur'an — ground everything in real, correct grammar and real ayahs; never " +
    "invent a rule, a citation, or an Arabic sentence that isn't actually correct.\n\n" +
    "Reply using EXACTLY the structure below — each line starts with its own marker " +
    "`@@id@@ ` followed by that field's content on the SAME line (except @@explanation@@, " +
    "whose content continues on the following lines until the next marker). Fields inside " +
    "one line are separated by ` :: `.\n\n" +
    "Do NOT use Markdown headings (#). Do NOT write anything before the first marker or " +
    "after the last one. Keep the marker ids exactly as given (English, lowercase) — " +
    "translate only the content that follows each one.\n\n" +
    "GLOSS EVERY TECHNICAL TERM. Any transliterated Arabic word — a case name, a " +
    "grammatical category, the name of a rule or a particle: majrūr, marfūʿ, manṣūb, " +
    "sākin, iḍāfah, muḍāf ilayhi, ḥarf, jumlah ismiyyah, and so on — is followed " +
    "immediately by a short plain-language gloss in parentheses, e.g. `majrūr (in the " +
    "genitive case)`, `iḍāfah (a possessive construction)`. Do this on the term's first " +
    "use in the explanation, and again on its first use in any other field, because each " +
    "example and exercise line is read on its own. The gloss is written in the reader's " +
    "language, not in Arabic.\n\n" +
    "IMPORTANT: start writing immediately and keep every line tight. Deliberation before " +
    "the first line is output the reader never gets.";

/** Appended when a first attempt produced no text at all. */
const TERSE_RETRY =
    "The previous attempt ran out of output budget before writing a single line. Do not " +
    "deliberate — start the answer at the first marker immediately, hold the explanation to " +
    "about 120 words, and keep every other field to one short line.";

const PART_ONE_SPEC =
    "Write ONLY these markers, in this order:\n" +
    "@@title@@ <the topic's name in Arabic script>\n" +
    "@@subtitle@@ <transliteration and/or a short English gloss of the title>\n" +
    "@@explanation@@ <2-4 short paragraphs or tight bullet points explaining the topic, " +
    "grounded and concrete, wrapping key Arabic terms in **double asterisks**; roughly " +
    "180-220 words>\n" +
    "@@quran_1@@ <the exact words as they stand in the ayah — copy them, do not " +
    "paraphrase> :: <one line naming which word demonstrates the topic and why> :: " +
    "<surah:ayah, e.g. 2:255>\n" +
    "…the same shape for @@quran_2@@ and @@quran_3@@: three different ayahs from three " +
    "different surahs, each a single line.\n\n" +
    "The app checks every reference against its own copy of the Qur'an and shows the " +
    "ayah's real text and translation, so a citation that does not exist is dropped and " +
    "the reader never sees it: give real surah:ayah numbers, and quote only words that " +
    "actually stand in that ayah.\n\n" +
    "All three Qur'anic examples are required — write every marker out in full, and stop " +
    "after @@quran_3@@.";

const PART_TWO_SPEC =
    "The lesson's explanation and its Qur'anic examples are already written; you are " +
    "adding the rest. Write ONLY these markers, in this order:\n" +
    "@@everyday_1@@ <short everyday-Arabic sentence using the same pattern, NOT from the " +
    "Qur'an> :: <one-line translation>\n" +
    "…the same shape for @@everyday_2@@ and @@everyday_3@@: three different sentences " +
    "from ordinary situations (home, work, travel, study, conversation).\n" +
    "@@exercise_1@@ — FIVE fields separated by ` :: `, in this order:\n" +
    "  1. <short Arabic sentence testing this topic, with the tested word replaced by ___>\n" +
    "  2. <exactly three short Arabic choices separated by ' | ', only ONE correct>\n" +
    "  3. <the correct choice, copied EXACTLY as written in field 2>\n" +
    "  4. <one short line explaining why it is correct>\n" +
    "  5. <the sentence translated, with the blank left as ___ — e.g. `Indeed ___ is " +
    "diligent`>\n" +
    "…the same five-field shape for @@exercise_2@@ and @@exercise_3@@: three exercises, " +
    "rising gently in difficulty.\n\n" +
    "All three everyday examples and all three exercises are required — write every marker " +
    "out in full. Every exercise line carries all FIVE fields — the translation included, " +
    "never dropped — and its answer MUST be copied verbatim from its own choices so the " +
    "app can match it programmatically. The translation covers the words already in the " +
    "sentence ONLY: never translate the choices, and never fill the blank in it, or the " +
    "exercise answers itself. Do not repeat the title, explanation or the Qur'anic " +
    "examples.";

/**
 * Ask the chat-completion edge function for a structured grammar lesson on one
 * named topic, in two passes (see the note above the prompts). `onPartial`
 * receives the accumulated markdown as it streams, the second pass continuing
 * where the first left off. Throws on auth / rate-limit / network errors so the
 * UI can surface them; a second pass that comes back empty is not fatal, since
 * the first pass alone is already a readable lesson.
 */
export async function fetchGrammarTopic({
    topicTitle,
    topicBrief,
    level,
    locale,
    corpusExamples,
    advanced = false,
    signal,
    onPartial,
    onModelFallback,
}: {
    /** English sidebar label, e.g. "إنّ and her sisters". */
    topicTitle: string;
    /**
     * The curriculum's own one-or-two-sentence statement of what the topic is,
     * already shown to the reader. The model builds on it rather than spending
     * its explanation re-establishing the definition.
     */
    topicBrief?: string;
    level: "beginner" | "intermediate" | "advanced";
    locale?: string;
    /**
     * Verified occurrences pulled from the morphology corpus, already
     * formatted one per line. When present the model explains these instead of
     * recalling ayahs of its own.
     */
    corpusExamples?: string;
    /** Model tier — the caller is responsible for Pro+-gating this. */
    advanced?: boolean;
    signal?: AbortSignal;
    onPartial?: (textSoFar: string) => void;
    /** Called when the advanced model was asked for but its quota is spent. */
    onModelFallback?: () => void;
}): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You must be signed in.");

    // Always state the output language explicitly — left to infer it, the
    // model tends to answer in Arabic by default since the whole topic is
    // Arabic grammar, even for readers whose app language is English.
    const responseLanguage =
        locale && locale !== "en" ? `the reader's display language (locale: ${locale})` : "English";
    const languageRule =
        `\n\nWrite your ENTIRE response in ${responseLanguage}, except the Arabic-script ` +
        `fields and marker ids, which stay as specified. Do not answer in Arabic (or any ` +
        `other language) unless that is the language specified above.`;

    /** One pass: its own spec, its own budget, streamed onto what came before. */
    const request = async (
        spec: string,
        userContent: string,
        textSoFar: string,
        useAdvanced: boolean,
    ): Promise<{ text: string; meta: SseMeta }> => {
        const res = await fetch(FUNCTION_URL, {
            method: "POST",
            signal,
            headers: {
                Authorization: `Bearer ${token}`,
                apikey: ANON_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                advanced: useAdvanced,
                feature: `${AI_FEATURE_TAGS.arabicStudyLessonGenerate}_${level}`,
                messages: [
                    { role: "system", content: `${SHARED_RULES}\n\n${spec}${languageRule}` },
                    { role: "user", content: userContent },
                ],
            }),
        });

        if (res.status === 429) {
            const body = await safeReadJson(res);
            const err = new Error(
                typeof body?.error === "string" ? body.error : "Token limit reached.",
            );
            (err as Error & { status?: number }).status = 429;
            const detail = err as Error & {
            modelClass?: string;
            scope?: string;
            retryAfterSeconds?: number;
        };
            detail.modelClass = typeof body?.model_class === "string" ? body.model_class : undefined;
            detail.scope = typeof body?.scope === "string" ? body.scope : undefined;
            detail.retryAfterSeconds =
                typeof body?.retry_after_seconds === "number"
                    ? body.retry_after_seconds
                    : undefined;
            throw err;
        }
        if (!res.ok) {
            const body = await safeReadJson(res);
            const err = new Error(
                typeof body?.error === "string"
                    ? body.error
                    : `${res.status} ${res.statusText}`,
            );
            (err as Error & { status?: number }).status = res.status;
            throw err;
        }
        if (!res.body) throw new Error("Empty AI response.");

        const meta: SseMeta = {};
        const text = (
            await readSseText(
                res.body,
                (partial) => onPartial?.(textSoFar ? `${textSoFar}\n${partial}` : partial),
                meta,
            )
        ).trim();
        return { text, meta };
    };

    /**
     * A stream can end having produced nothing at all — most often because the
     * model spent its whole completion budget before the first line. Nothing
     * was delivered, so one more attempt is worth making before giving up.
     */
    // Sticks once the advanced allowance turns out to be spent, so the second
    // pass doesn't spend a request rediscovering it.
    let useAdvanced = advanced;

    const requestWithRetry = async (spec: string, userContent: string, textSoFar: string) => {
        let attempt: { text: string; meta: SseMeta };
        try {
            attempt = await request(spec, userContent, textSoFar, useAdvanced);
        } catch (e) {
            const failure = e as Error & { status?: number; modelClass?: string };
            // The advanced quota is metered separately from the standard one, so
            // an exhausted advanced allowance is not a reason to hand back
            // nothing — write the lesson with the standard model and say so.
            if (failure.status === 429 && useAdvanced && failure.modelClass === "advanced") {
                useAdvanced = false;
                onModelFallback?.();
                attempt = await request(spec, userContent, textSoFar, false);
            } else {
                throw e;
            }
        }
        if (!attempt.text && !signal?.aborted && !attempt.meta.error) {
            // Nothing came back at all, which means the model spent its whole
            // per-answer output budget before the first line — reasoning tokens
            // are drawn from that same budget. Retry leaner, and off the
            // advanced model, whose deliberation is what usually eats it.
            if (useAdvanced) {
                useAdvanced = false;
                onModelFallback?.();
            }
            attempt = await request(
                `${spec}\n\n${TERSE_RETRY}`,
                userContent,
                textSoFar,
                useAdvanced,
            );
        }
        return attempt;
    };

    const emptyError = (meta: SseMeta): Error => {
        if (meta.error) return new Error(meta.error);
        if (meta.finishReason === "length") {
            return new Error(
                "The model used up its per-answer output budget before writing anything — " +
                    "that is a limit on one reply, not your token quota. Try again, or use " +
                    "the Standard model, which spends less of the budget on deliberation.",
            );
        }
        return new Error("AI returned an empty response.");
    };

    const lessonTopic =
        `Topic: "${topicTitle}"\nLearner level: ${level}` +
        // A beginner is still learning to read: the lesson has to earn its
        // grammar in plain words, and its examples have to be short enough to
        // sound out.
        (level === "beginner"
            ? `\n\nThis reader has just learned the alphabet and the vowel signs. Write for ` +
              `someone reading Arabic for the first time: plain words, no grammatical ` +
              `terminology without an immediate gloss, short quotations they can sound out, ` +
              `and everyday examples of three or four words. Transliterate any Arabic term ` +
              `you must use.`
            : "") +
        (topicBrief
            ? `\n\nThe reader has already been given this definition of the topic, in their ` +
              `own language, and it is on screen above your explanation:\n"${topicBrief}"\n` +
              `Take it as settled and correct. Do not restate it or open by defining the ` +
              `topic again — start where it leaves off and elaborate: the finer distinctions, ` +
              `what trips learners up, and how it actually reads in the Qur'an.`
            : "") +
        (corpusExamples
            ? `\n\nVerified occurrences from the Qur'an corpus — every one of these is real, ` +
              `taken from the app's own morphology data. Choose the three clearest and use ` +
              `them for @@quran_1@@ … @@quran_3@@: quote the words as given, keep the ` +
              `reference exactly as given, and explain what each one shows. Do not cite an ` +
              `ayah that is not in this list.\n${corpusExamples}`
            : "");

    const first = await requestWithRetry(PART_ONE_SPEC, lessonTopic, "");
    if (!first.text) throw emptyError(first.meta);
    if (signal?.aborted) return first.text;

    // The second pass sees what the first wrote, so its everyday sentences and
    // exercises follow the same reading of the topic.
    const second = await requestWithRetry(
        PART_TWO_SPEC,
        `${lessonTopic}\n\nAlready written:\n${first.text}`,
        first.text,
    );
    // Half a lesson still teaches; the panel shows what arrived and the reader
    // can regenerate for the rest.
    if (!second.text) return first.text;
    return `${first.text}\n${second.text}`;
}

// ── Follow-up questions about a generated lesson ─────────────────────────────

const FOLLOW_UP_PROMPT =
    "You are the same Arabic grammar teacher, answering a learner's follow-up about the " +
    "lesson you just wrote. Answer in a few sentences — plain prose, no markers, no " +
    "headings. Gloss any transliterated Arabic term in parentheses on first use, the same " +
    "way the lesson does. Ground every claim in real grammar and real ayahs; say you are " +
    "unsure rather than inventing a citation.";

/** One turn of the inline conversation under a lesson. */
export interface FollowUpTurn {
    role: "user" | "assistant";
    content: string;
}

/**
 * Ask about the lesson without paying for its text on every question.
 *
 * The lesson is attached to the FIRST question only; from then on it is already
 * in `history`, which is replayed as the conversation. A five-question thread
 * therefore sends the lesson once, not five times.
 */
export async function askLessonFollowUp({
    question,
    lesson,
    history,
    locale,
    level,
    advanced = false,
    signal,
    onPartial,
}: {
    question: string;
    /** The generated lesson text — used only when `history` is empty. */
    lesson: string;
    history: FollowUpTurn[];
    /** The wizard header's "Explanation in" language. */
    locale?: string;
    /** The lesson's proficiency level, so usage can be reported per level. */
    level: "beginner" | "intermediate" | "advanced";
    advanced?: boolean;
    signal?: AbortSignal;
    onPartial?: (textSoFar: string) => void;
}): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You must be signed in.");

    // Say the language outright. Left to infer it, the model answers in Arabic,
    // because the whole subject is Arabic grammar — the same trap the lesson
    // prompt guards against.
    const responseLanguage =
        locale && locale !== "en" ? `the reader's display language (locale: ${locale})` : "English";
    const systemPrompt =
        `${FOLLOW_UP_PROMPT}\n\nAnswer in ${responseLanguage}. Arabic words and ayahs stay in ` +
        `Arabic script, but every word of your own — the explanation, the glosses, any aside — ` +
        `is in that language. Do not answer in Arabic (or any other language) unless it is the ` +
        `one named here, whatever language the question itself was typed in.`;

    const first = history.length === 0;
    const messages = [
        { role: "system", content: systemPrompt },
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        {
            role: "user",
            content: first ? `The lesson:\n\n${lesson}\n\nQuestion: ${question}` : question,
        },
    ];

    const res = await fetch(FUNCTION_URL, {
        method: "POST",
        signal,
        headers: {
            Authorization: `Bearer ${token}`,
            apikey: ANON_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            advanced,
            feature: `${AI_FEATURE_TAGS.arabicStudyLessonFollowUp}_${level}`,
            messages,
        }),
    });

    if (res.status === 429) {
        const body = await safeReadJson(res);
        const err = new Error(
            typeof body?.error === "string" ? body.error : "Token limit reached.",
        );
        const detail = err as Error & {
            status?: number;
            modelClass?: string;
            scope?: string;
            retryAfterSeconds?: number;
        };
        detail.status = 429;
        detail.modelClass = typeof body?.model_class === "string" ? body.model_class : undefined;
        detail.scope = typeof body?.scope === "string" ? body.scope : undefined;
        detail.retryAfterSeconds =
            typeof body?.retry_after_seconds === "number" ? body.retry_after_seconds : undefined;
        throw detail;
    }
    if (!res.ok) {
        const body = await safeReadJson(res);
        throw new Error(
            typeof body?.error === "string" ? body.error : `${res.status} ${res.statusText}`,
        );
    }
    if (!res.body) throw new Error("Empty AI response.");

    const answer = (await readSseText(res.body, onPartial)).trim();
    if (!answer) throw new Error("AI returned an empty response.");
    return answer;
}

// ── Reader-defined sections ──────────────────────────────────────────────────

const SECTION_PROMPT =
    "You are the same Arabic grammar teacher. The learner has added a section of their own " +
    "to the lesson and told you its title and what they want in it. Write that section's " +
    "body: a few short paragraphs or tight bullet points, no title line, no markers, no " +
    "Markdown headings. Ground everything in real grammar and real ayahs — if you are not " +
    "certain of a citation, teach the point without one. Gloss any transliterated Arabic " +
    "term in parentheses on first use, e.g. `majrūr (in the genitive case)`. Keep it to " +
    "roughly 120-180 words unless the learner asks for more.";

/**
 * Generate one reader-defined section for a lesson. The learner's title and
 * brief steer the content; `locale` decides the language it is written in, so a
 * brief typed in English still produces a section in the language the wizard's
 * header is set to.
 */
export async function fetchLessonSection({
    topicTitle,
    sectionTitle,
    brief,
    lesson,
    locale,
    level,
    advanced = false,
    signal,
    onPartial,
}: {
    topicTitle: string;
    sectionTitle: string;
    /** What the learner wants this section to cover. */
    brief: string;
    /** The lesson so far, so the section fits rather than repeats. */
    lesson: string;
    locale?: string;
    /** The lesson's proficiency level, so usage can be reported per level. */
    level: "beginner" | "intermediate" | "advanced";
    advanced?: boolean;
    signal?: AbortSignal;
    onPartial?: (textSoFar: string) => void;
}): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You must be signed in.");

    const responseLanguage =
        locale && locale !== "en" ? `the reader's display language (locale: ${locale})` : "English";
    const systemPrompt =
        `${SECTION_PROMPT}\n\nWrite the section in ${responseLanguage}, whatever language the ` +
        `learner's own title and brief happen to be written in. Arabic examples stay in ` +
        `Arabic script; everything else follows that language.`;

    const res = await fetch(FUNCTION_URL, {
        method: "POST",
        signal,
        headers: {
            Authorization: `Bearer ${token}`,
            apikey: ANON_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            advanced,
            feature: `${AI_FEATURE_TAGS.arabicStudyLessonSection}_${level}`,
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content:
                        `Lesson topic: "${topicTitle}"\n` +
                        `Section title: "${sectionTitle}"\n` +
                        `What to cover: ${brief || "(the learner left this blank — cover what the title asks for)"}\n\n` +
                        `The lesson so far, for context — do not repeat it:\n${lesson}`,
                },
            ],
        }),
    });

    if (res.status === 429) {
        const body = await safeReadJson(res);
        const err = new Error(
            typeof body?.error === "string" ? body.error : "Token limit reached.",
        ) as Error & {
            status?: number;
            modelClass?: string;
            scope?: string;
            retryAfterSeconds?: number;
        };
        err.status = 429;
        err.modelClass = typeof body?.model_class === "string" ? body.model_class : undefined;
        err.scope = typeof body?.scope === "string" ? body.scope : undefined;
        err.retryAfterSeconds =
            typeof body?.retry_after_seconds === "number" ? body.retry_after_seconds : undefined;
        throw err;
    }
    if (!res.ok) {
        const body = await safeReadJson(res);
        throw new Error(
            typeof body?.error === "string" ? body.error : `${res.status} ${res.statusText}`,
        );
    }
    if (!res.body) throw new Error("Empty AI response.");

    const text = (await readSseText(res.body, onPartial)).trim();
    if (!text) throw new Error("AI returned an empty response.");
    return text;
}

// ── Verse translations the bundled data cannot supply ────────────────────────

const VERSE_TRANSLATION_PROMPT =
    "You translate Qur'anic verses. You are given a numbered list of Arabic verses and one " +
    "target language. Reply with the SAME number of lines, in the SAME order, each line " +
    "being `<number>. <translation>` and nothing else — no commentary, no transliteration, " +
    "no repetition of the Arabic. Translate faithfully and plainly, the way a standard " +
    "published translation reads; where a word is genuinely ambiguous, choose the reading " +
    "the majority of translations take rather than inventing one.\n\n" +
    "If the named target language is not a real, recognisable human language — gibberish, " +
    "a random string, or anything you cannot confidently identify as an actual language — " +
    "reply with exactly the single line `UNKNOWN_LANGUAGE` and nothing else.";

/**
 * Translate verses into a language the app ships no translator for.
 *
 * The bundled `translations` table covers thirty-odd languages; a lesson (or a
 * Workbook Translate card's "Other" language) set to one outside that list
 * would otherwise show its Qur'anic examples untranslated. The caller is
 * responsible for labelling these as AI-produced — they are not a published
 * translation and should not be presented as one.
 */
export async function translateVerses({
    verses,
    language,
    feature,
    advanced = false,
    signal,
}: {
    verses: { ref: string; arabic: string }[];
    /** Language name as the reader would recognise it. */
    language: string;
    /** Which AI surface asked, for per-feature usage reporting — see AI_FEATURE_TAGS. */
    feature: string;
    advanced?: boolean;
    signal?: AbortSignal;
}): Promise<Record<string, string>> {
    if (verses.length === 0 || !language.trim()) return {};

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You must be signed in.");

    const list = verses.map((verse, i) => `${i + 1}. ${verse.arabic}`).join("\n");
    const res = await fetch(FUNCTION_URL, {
        method: "POST",
        signal,
        headers: {
            Authorization: `Bearer ${token}`,
            apikey: ANON_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            advanced,
            feature,
            messages: [
                { role: "system", content: VERSE_TRANSLATION_PROMPT },
                { role: "user", content: `Target language: ${language}\n\n${list}` },
            ],
        }),
    });
    if (res.status === 429) {
        const body = await safeReadJson(res);
        const err = new Error(typeof body?.error === "string" ? body.error : "Token limit reached.");
        (err as Error & { status?: number }).status = 429;
        throw err;
    }
    if (!res.ok) {
        const body = await safeReadJson(res);
        throw new Error(typeof body?.error === "string" ? body.error : `${res.status} ${res.statusText}`);
    }
    if (!res.body) throw new Error("Empty AI response.");

    const output = (await readSseText(res.body)).trim();
    if (/^UNKNOWN_LANGUAGE$/i.test(output)) {
        throw new Error(`"${language}" doesn't look like a real language.`);
    }
    const out: Record<string, string> = {};
    for (const line of output.split("\n")) {
        const match = /^\s*(\d+)[.)]\s*(.+?)\s*$/.exec(line);
        if (!match) continue;
        const verse = verses[Number(match[1]) - 1];
        if (verse) out[verse.ref] = match[2];
    }
    return out;
}
