import { supabase } from "$lib/supabase";
import { readSseText, safeReadJson } from "$lib/stores/ai-text-transform.store";

// "Take-home message" — a personal-growth reflection generated from the ayahs
// currently displayed in the Morphology view. Pro/Pro+ only (gated by the
// caller via `isPro`). Streams a structured markdown answer with a fixed set
// of sections so the dialog can render it as it arrives.

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// UI locale code → English language name, used to instruct the model which
// language to answer in (the take-home message follows the app's language).
const LANGUAGE_NAMES: Record<string, string> = {
    en: "English",
    ar: "Arabic",
    bn: "Bengali",
    fa: "Persian",
    hi: "Hindi",
    id: "Indonesian",
    ms: "Malay",
    pt: "Portuguese",
    tl: "Filipino (Tagalog)",
    tr: "Turkish",
    ur: "Urdu",
    zh: "Simplified Chinese",
    ja: "Japanese",
    ko: "Korean",
    de: "German",
    fr: "French",
    es: "Spanish",
    ru: "Russian",
    vi: "Vietnamese",
    th: "Thai",
    my: "Burmese",
    ceb: "Cebuano",
    kk: "Kazakh",
    uz: "Uzbek",
    tk: "Turkmen",
    ky: "Kyrgyz",
    tg: "Tajik",
    sq: "Albanian",
    bs: "Bosnian",
    sr: "Serbian",
    ku: "Kurdish (Sorani)",
    ta: "Tamil",
    sw: "Swahili",
    pa: "Punjabi",
};

const SYSTEM_PROMPT =
    "You are a knowledgeable, warm Islamic study companion helping a reader draw " +
    "personal-growth lessons from the Qur'an. You are given only the references of " +
    "the ayah(s) the reader is currently studying (surah name/number and ayah " +
    "numbers, e.g. 'Surah 2 (Al-Baqarah) — ayah(s): 255-257'). You already know the " +
    "Qur'an, so recall the meaning of these exact ayahs yourself. Ground everything " +
    "strictly in the meaning of those ayahs — do not invent rulings, and keep the " +
    "tone humble, encouraging, and practical.\n\n" +
    "Reply using EXACTLY this structure. Each section starts with its own marker line " +
    "`@@id@@ Title` (nothing else on that line), followed by the section's content on " +
    "the next lines. Output the five sections in this exact order and with these ids:\n" +
    "@@key_lessons@@ Key lessons to implement\n" +
    "@@practical_steps@@ Practical behavioural steps\n" +
    "@@reflection_prompts@@ Reflection prompts\n" +
    "@@daily_applications@@ Daily-life applications\n" +
    "@@take_home@@ Take-home message\n\n" +
    "Under the first four sections use 2–3 short Markdown bullet points (`- `), one " +
    "line each. Make 'Reflection prompts' a list of open questions the reader can sit " +
    "with. Under 'take_home' write 1–2 sentences capturing the core takeaway.\n\n" +
    "CITATIONS: whenever a point draws on a specific ayah, cite it inline right after " +
    "the point using the token {{surah:ayah}} for a single ayah (for example " +
    "{{2:255}}) or {{surah:startAyah-endAyah}} for a span (for example {{18:15-18}}). " +
    "Cite ONLY ayahs within the surahs and ayah ranges listed in the user's message, " +
    "and never invent others.\n\n" +
    "Do NOT use Markdown headings (#). Do NOT write anything before the first marker " +
    "or after the last section. Keep the marker ids exactly as given (English, " +
    "lowercase); translate only the Title text.\n\n" +
    "IMPORTANT: Answer directly and concisely without lengthy deliberation. Keep the " +
    "whole response brief — roughly 180 words total.";

/**
 * Ask the chat-completion edge function for a structured take-home message
 * built from the supplied ayah context. `onPartial` receives the accumulated
 * markdown as it streams. Throws on auth / rate-limit / network errors so the
 * dialog can surface them.
 */
export async function fetchTakeHomeMessage({
    context,
    locale,
    advanced = true,
    signal,
    onPartial,
}: {
    context: string;
    locale?: string;
    advanced?: boolean;
    signal?: AbortSignal;
    onPartial?: (textSoFar: string) => void;
}): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You must be signed in.");

    // Follow the app's display language: when it isn't English, tell the model
    // to write the whole answer (headings included) in that language.
    const langName = locale && locale !== "en" ? LANGUAGE_NAMES[locale] : undefined;
    const systemPrompt = langName
        ? `${SYSTEM_PROMPT}\n\nWrite your ENTIRE response — including the five section ` +
          `titles — in ${langName}. Do not answer in English. (Keep the marker ids ` +
          `and the {{surah:ayah}} citation tokens exactly as specified.)`
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
            advanced,
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: `Here are the ayah(s) I am studying:\n\n${context}`,
                },
            ],
        }),
    });

    if (res.status === 429) {
        const body = await safeReadJson(res);
        const err = new Error(
            typeof body?.error === "string" ? body.error : "Token limit reached.",
        );
        // Flag quota/rate-limit so the UI can offer to fall back to the
        // standard model instead of just showing a raw error.
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
