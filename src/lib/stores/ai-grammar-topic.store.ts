import { writable } from "svelte/store";
import { supabase } from "$lib/supabase";
import {
    readSseText,
    safeReadJson,
    type AiModelClass,
    type SseMeta,
} from "$lib/stores/ai-text-transform.store";

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
// OPENAI_MAX_COMPLETION_TOKENS (4000 by default) and reasoning tokens come out
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
    "IMPORTANT: start writing immediately and keep every line tight. Deliberation before " +
    "the first line is output the reader never gets.";

const PART_ONE_SPEC =
    "Write ONLY these markers, in this order:\n" +
    "@@title@@ <the topic's name in Arabic script>\n" +
    "@@subtitle@@ <transliteration and/or a short English gloss of the title>\n" +
    "@@explanation@@ <2-4 short paragraphs or tight bullet points explaining the topic, " +
    "grounded and concrete, wrapping key Arabic terms in **double asterisks**; roughly " +
    "180-220 words>\n" +
    "@@quran_1@@ <short Arabic phrase from a real ayah demonstrating this topic> :: " +
    "<one-line translation naming which word demonstrates it> :: <surah:ayah, e.g. 2:255>\n" +
    "…the same shape for @@quran_2@@ and @@quran_3@@: three different ayahs from three " +
    "different surahs, each a single line.\n\n" +
    "All three Qur'anic examples are required — write every marker out in full, and stop " +
    "after @@quran_3@@.";

const PART_TWO_SPEC =
    "The lesson's explanation and its Qur'anic examples are already written; you are " +
    "adding the rest. Write ONLY these markers, in this order:\n" +
    "@@everyday_1@@ <short everyday-Arabic sentence using the same pattern, NOT from the " +
    "Qur'an> :: <one-line translation>\n" +
    "…the same shape for @@everyday_2@@ and @@everyday_3@@: three different sentences " +
    "from ordinary situations (home, work, travel, study, conversation).\n" +
    "@@exercise_1@@ <short Arabic sentence testing this topic, with the tested word " +
    "replaced by ___> :: <exactly three short Arabic choices separated by ' | ', only ONE " +
    "correct> :: <the correct choice, copied EXACTLY as written in the choices> :: <one " +
    "short line explaining why it is correct>\n" +
    "…the same shape for @@exercise_2@@ and @@exercise_3@@: three exercises, rising " +
    "gently in difficulty.\n\n" +
    "All three everyday examples and all three exercises are required — write every marker " +
    "out in full. Each exercise's answer MUST be copied verbatim from its own choices so " +
    "the app can match it programmatically. Do not repeat the title, explanation or the " +
    "Qur'anic examples.";

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
    level,
    locale,
    advanced = false,
    signal,
    onPartial,
    onModelFallback,
}: {
    /** English sidebar label, e.g. "إنّ and her sisters". */
    topicTitle: string;
    level: "intermediate" | "advanced";
    locale?: string;
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
            attempt = await request(spec, userContent, textSoFar, useAdvanced);
        }
        return attempt;
    };

    const emptyError = (meta: SseMeta): Error => {
        if (meta.error) return new Error(meta.error);
        if (meta.finishReason === "length") {
            return new Error(
                "The AI hit its output limit before writing any of the lesson. Try again, or " +
                    "switch the model to Standard.",
            );
        }
        return new Error("AI returned an empty response.");
    };

    const lessonTopic = `Topic: "${topicTitle}"\nLearner level: ${level}`;

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
