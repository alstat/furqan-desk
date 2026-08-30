import { supabase } from "$lib/supabase";
import { readSseText, safeReadJson } from "$lib/stores/ai-text-transform.store";

// "Grammar, for this ayah" — a short AI explanation of one ayah's grammatical
// structure, shown in the Verse Study canvas's Grammar node. Pro-gated by the
// caller via `isPro`, same as the Take-Home Message and the per-ayah AI-ask
// button elsewhere in Morphology View.

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const SYSTEM_PROMPT =
    "You are a knowledgeable Arabic-grammar (nahw/sarf) teacher helping a reader " +
    "understand one Qur'anic ayah's grammatical structure. You are given only the " +
    "ayah's reference (surah name/number and ayah number) and its Arabic text — " +
    "you already know the Qur'an, so recall the ayah's meaning and grammar yourself. " +
    "Ground everything strictly in the actual grammar of this ayah — do not invent " +
    "constructions that are not there.\n\n" +
    "Write 2-4 short paragraphs (or tight bullet points) covering: the ayah's " +
    "sentence type (nominal/verbal) and its main parts (subject, predicate, " +
    "object, etc. — using the Arabic grammatical term followed by a brief English " +
    "gloss, e.g. 'مبتدأ (subject)'), and one or two grammatical features worth " +
    "noticing (a case ending, a verb form, a construction like idafa or inna-and-" +
    "her-sisters) with a one-line explanation of why it matters for understanding " +
    "the ayah. Keep it concise and concrete — roughly 120-160 words total. Do NOT " +
    "use Markdown headings (#); short bold labels and bullet points are fine.";

/**
 * Ask the chat-completion edge function for a short grammar explanation of
 * one ayah. `onPartial` receives the accumulated markdown as it streams.
 * Throws on auth / rate-limit / network errors so the node can surface them.
 */
export async function fetchVerseGrammar({
    context,
    locale,
    signal,
    onPartial,
}: {
    /** e.g. "Surah 112 (Al-Ikhlas), ayah 1: قُلْ هُوَ اللَّهُ أَحَدٌ" */
    context: string;
    locale?: string;
    signal?: AbortSignal;
    onPartial?: (textSoFar: string) => void;
}): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You must be signed in.");

    const systemPrompt =
        locale && locale !== "en"
            ? `${SYSTEM_PROMPT}\n\nWrite your ENTIRE response in the reader's display language (locale: ${locale}).`
            : SYSTEM_PROMPT;

    const res = await fetch(FUNCTION_URL, {
        method: "POST",
        signal,
        headers: {
            Authorization: `Bearer ${token}`,
            apikey: ANON_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            advanced: false,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Here is the ayah I am studying:\n\n${context}` },
            ],
        }),
    });

    if (res.status === 429) {
        const body = await safeReadJson(res);
        const err = new Error(
            typeof body?.error === "string" ? body.error : "Token limit reached.",
        );
        (err as Error & { status?: number }).status = 429;
        // The standard and advanced classes are metered separately; the caller
        // needs to know which one was refused or its message will name the
        // wrong quota.
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

    const output = await readSseText(res.body, onPartial);
    const result = output.trim();
    if (!result) throw new Error("AI returned an empty response.");
    return result;
}
