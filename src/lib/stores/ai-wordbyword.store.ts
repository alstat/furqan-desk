import { supabase } from "$lib/supabase";
import { readSseText, safeReadJson } from "$lib/stores/ai-text-transform.store";

// Word-by-word meanings in a language the app doesn't ship. The bundled
// `word_by_word` table covers nine languages; when a learner picks "Other" and
// names their own, the English glosses are translated on demand instead.
// Pro-gated by the caller via `isPro`, same as every other AI surface here.

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const SYSTEM_PROMPT =
    "You translate Qur'anic word-by-word glosses. You are given a numbered list of Arabic " +
    "words, each with its current gloss, and one target language. Reply with the SAME number " +
    "of lines, in the SAME order, each line being `<number>. <translation>` — the gloss " +
    "translated into the target language, and nothing else.\n\n" +
    "Never echo the Arabic word back: the line carries the translation alone, with no copy of " +
    "the source word and no dash before it.\n\n" +
    "Keep each translation as short as the English gloss: these label single words in a " +
    "learner's word picker, not sentences. Translate the meaning of the Arabic word in its " +
    "Qur'anic sense — the gloss given is a reference, not the source text. Write the target " +
    "language in its own script. No preamble, no notes, no blank lines.";

/** Bare letters only — diacritics and spacing carry no weight in a comparison. */
function bareLetters(text: string): string {
    return text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\s]/g, "");
}

/**
 * Asked for the translation alone, the model still tends to answer
 * "<arabic> — <translation>". Drop that echo, but only when the text before the
 * dash really is the word that was sent: Urdu and Persian translations are
 * Arabic-script themselves, and one containing a dash must survive intact.
 */
function stripEchoedWord(line: string, word: string): string {
    const text = line.trim();
    if (!word) return text;
    const split = /^(.*?)\s*[—–\-:]\s*(.+)$/.exec(text);
    if (split && bareLetters(split[1]) === bareLetters(word)) return split[2].trim();
    if (text.startsWith(word)) return text.slice(word.length).replace(/^[\s—–\-:]+/, "").trim();
    return text;
}

/**
 * Translate one batch of glosses into `language`. Returns a list the same
 * length as `words`; a line the model failed to produce falls back to its
 * English gloss, so the picker never ends up with blank meanings.
 */
export async function translateGlosses({
    words,
    glosses,
    language,
    advanced = false,
    signal,
}: {
    /** Arabic words, for context — same length and order as `glosses`. */
    words: string[];
    glosses: string[];
    /** Free-text language name, as the learner typed it. */
    language: string;
    /** Model tier — the caller is responsible for Pro+-gating this. */
    advanced?: boolean;
    signal?: AbortSignal;
}): Promise<string[]> {
    const target = language.trim();
    if (!target) throw new Error("Name a language first.");
    if (glosses.length === 0) return [];

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You must be signed in.");

    const list = glosses
        .map((gloss, i) => `${i + 1}. ${words[i] ?? ""} — ${gloss}`)
        .join("\n");

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
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Target language: ${target}\n\n${list}` },
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
            typeof body?.error === "string" ? body.error : `${res.status} ${res.statusText}`,
        );
        (err as Error & { status?: number }).status = res.status;
        throw err;
    }
    if (!res.body) throw new Error("Empty AI response.");

    const output = (await readSseText(res.body)).trim();
    if (!output) throw new Error("AI returned an empty response.");

    // `12. meaning` — index by the number the model echoed rather than by line
    // order, so one dropped or doubled line doesn't shift every gloss after it.
    const translated = [...glosses];
    for (const line of output.split("\n")) {
        const match = /^\s*(\d+)[.)]\s*(.+?)\s*$/.exec(line);
        if (!match) continue;
        const index = Number(match[1]) - 1;
        if (index >= 0 && index < translated.length) {
            translated[index] = stripEchoedWord(match[2], words[index] ?? "");
        }
    }
    return translated;
}
