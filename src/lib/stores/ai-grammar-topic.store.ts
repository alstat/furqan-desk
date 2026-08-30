import { writable } from "svelte/store";
import { supabase } from "$lib/supabase";
import { readSseText, safeReadJson, type AiModelClass } from "$lib/stores/ai-text-transform.store";

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

const SYSTEM_PROMPT =
    "You are an Arabic grammar (naḥw/ṣarf) and rhetoric (balāgha) teacher, writing one " +
    "short lesson for a named topic in Qur'anic Arabic. You already know Arabic grammar " +
    "and the Qur'an — ground everything in real, correct grammar and real ayahs; never " +
    "invent a rule, a citation, or an Arabic sentence that isn't actually correct.\n\n" +
    "Reply using EXACTLY this structure — each line starts with its own marker " +
    "`@@id@@ ` followed by that field's content on the SAME line (except @@explanation@@, " +
    "whose content continues on the following lines until the next marker):\n" +
    "@@title@@ <the topic's name in Arabic script>\n" +
    "@@subtitle@@ <transliteration and/or a short English gloss of the title>\n" +
    "@@explanation@@ <2-4 short paragraphs or tight bullet points explaining the topic, " +
    "grounded and concrete, wrapping key Arabic terms in **double asterisks**>\n" +
    "@@quran_word@@ <one short Arabic phrase from a real ayah that demonstrates this topic>\n" +
    "@@quran_gloss@@ <a one-line English translation/explanation of that phrase, naming which " +
    "word demonstrates the topic>\n" +
    "@@quran_ref@@ <that ayah's reference as surah:ayah, e.g. 2:255>\n" +
    "@@everyday_word@@ <one short everyday-Arabic sentence or phrase using the same grammatical " +
    "pattern, NOT from the Qur'an>\n" +
    "@@everyday_gloss@@ <a one-line English translation of that phrase>\n" +
    "@@quiz_sentence@@ <a short Arabic sentence testing this topic, with the tested word " +
    "replaced by ___>\n" +
    "@@quiz_choices@@ <exactly three short Arabic answer choices, separated by ' | ', " +
    "with only ONE being grammatically correct>\n" +
    "@@quiz_answer@@ <the correct choice, copied EXACTLY as it appears in quiz_choices>\n" +
    "@@quiz_why@@ <one short line explaining why that choice is correct>\n\n" +
    "Do NOT use Markdown headings (#). Do NOT write anything before the first marker or " +
    "after the last section. Keep the marker ids exactly as given (English, lowercase) — " +
    "translate only the content that follows each one, except quiz_answer, which MUST be " +
    "copied verbatim from quiz_choices so the app can match it programmatically.\n\n" +
    "IMPORTANT: Answer directly and concisely. Keep the whole response brief — roughly " +
    "180-220 words total, not counting the quiz.";

/**
 * Ask the chat-completion edge function for a structured grammar lesson on
 * one named topic. `onPartial` receives the accumulated markdown as it
 * streams. Throws on auth / rate-limit / network errors so the UI can
 * surface them.
 */
export async function fetchGrammarTopic({
    topicTitle,
    level,
    locale,
    advanced = false,
    signal,
    onPartial,
}: {
    /** English sidebar label, e.g. "إنّ and her sisters". */
    topicTitle: string;
    level: "intermediate" | "advanced";
    locale?: string;
    /** Model tier — the caller is responsible for Pro+-gating this. */
    advanced?: boolean;
    signal?: AbortSignal;
    onPartial?: (textSoFar: string) => void;
}): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You must be signed in.");

    // Always state the output language explicitly — left to infer it, the
    // model tends to answer in Arabic by default since the whole topic is
    // Arabic grammar, even for readers whose app language is English.
    const responseLanguage =
        locale && locale !== "en" ? `the reader's display language (locale: ${locale})` : "English";
    const systemPrompt =
        `${SYSTEM_PROMPT}\n\nWrite your ENTIRE response — including the title and subtitle — ` +
        `in ${responseLanguage}, except the Arabic-script fields and marker ids, which stay as ` +
        `specified. Do not answer in Arabic (or any other language) unless that is the language ` +
        `specified above.`;

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
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: `Topic: "${topicTitle}"\nLearner level: ${level}`,
                },
            ],
        }),
    });

    if (res.status === 429) {
        const body = await safeReadJson(res);
        const err = new Error(
            typeof body?.error === "string" ? body.error : "Token limit reached.",
        );
        (err as Error & { status?: number }).status = 429;
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

    const output = await readSseText(res.body, onPartial);
    const result = output.trim();
    if (!result) throw new Error("AI returned an empty response.");
    return result;
}
