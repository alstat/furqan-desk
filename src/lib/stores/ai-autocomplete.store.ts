import { writable, get } from "svelte/store";
import { supabase } from "$lib/supabase";
import {
    readSseText,
    type AiModelClass,
} from "$lib/stores/ai-text-transform.store";
import { isPro } from "$lib/stores/auth.store";

// ── Settings (persisted like aiTextDefaultModel) ─────────────────────────────
// AI inline autocompletion is a Pro/Pro+ feature: the editors additionally
// check `isPro` before fetching, and the Settings UI hides these controls for
// free accounts.

const ENABLED_KEY = "ai-autocomplete-enabled";
const MODEL_KEY = "ai-autocomplete-model";
const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function loadEnabled(): boolean {
    try {
        return localStorage.getItem(ENABLED_KEY) === "true";
    } catch {
        return false;
    }
}

function loadModel(): AiModelClass {
    try {
        const stored = localStorage.getItem(MODEL_KEY);
        if (stored === "advanced" || stored === "standard") return stored;
    } catch {
        /* ignore */
    }
    return "standard";
}

const _enabled = writable<boolean>(loadEnabled());
const _model = writable<AiModelClass>(loadModel());

export const aiAutocompleteEnabled = {
    subscribe: _enabled.subscribe,
    set(value: boolean) {
        try {
            localStorage.setItem(ENABLED_KEY, String(value));
        } catch {
            /* ignore */
        }
        _enabled.set(value);
    },
};

export const aiAutocompleteModel = {
    subscribe: _model.subscribe,
    set(value: AiModelClass) {
        try {
            localStorage.setItem(MODEL_KEY, value);
        } catch {
            /* ignore */
        }
        _model.set(value);
    },
};

/** True when the feature should run: enabled in Settings AND Pro/Pro+. */
export function aiAutocompleteActive(): boolean {
    return get(_enabled) && get(isPro);
}

// ── Completion fetch ─────────────────────────────────────────────────────────

const LANGUAGE_HINTS: Record<string, string> = {
    typst:
        "You are completing Typst markup/code inside the Typst editor. " +
        "Continue with syntactically valid Typst — respect the surrounding " +
        "markup, functions, set/show rules, and math mode implied by the context.",
    julia:
        "You are completing Julia source code inside the Julia editor. " +
        "Continue with syntactically valid Julia — respect the surrounding " +
        "scope, indentation, and any open blocks, functions, or types.",
    prose:
        "You are completing plain-text prose inside the text editor. " +
        "Continue the writing naturally, matching the surrounding tone and style.",
};

// Models occasionally echo the sentinel or wrap the answer in fences anyway.
function cleanCompletion(raw: string): string {
    return raw
        .replace(/<CURSOR>/g, "")
        .replace(/^```[a-zA-Z]*\n?|```$/g, "")
        .replace(/\s+$/g, "");
}

/**
 * Ask the chat-completion edge function for a short inline continuation of the
 * text around the caret. `onPartial` receives the (cleaned) text accumulated
 * so far as the response streams in, so ghost text can appear without waiting
 * for the full completion. Returns "" when there is nothing useful to
 * suggest — autocompletion must never surface errors at the caret, so all
 * failures (including aborts) collapse to "".
 */
export async function fetchAiCompletion({
    prefix,
    suffix,
    language,
    signal,
    onPartial,
}: {
    prefix: string;
    suffix: string;
    language?: string;
    signal?: AbortSignal;
    onPartial?: (textSoFar: string) => void;
}): Promise<string> {
    try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return "";

        const hint = LANGUAGE_HINTS[language ?? "prose"] ?? LANGUAGE_HINTS.prose;
        const res = await fetch(FUNCTION_URL, {
            method: "POST",
            signal,
            headers: {
                Authorization: `Bearer ${token}`,
                apikey: ANON_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                advanced: get(_model) === "advanced",
                messages: [
                    {
                        role: "system",
                        content:
                            "You are an inline autocompletion engine inside an editor. " +
                            "The user's document is given with the caret marked as <CURSOR>. " +
                            "Reply with ONLY the text to insert at the caret: no explanations, " +
                            "no quotes, no markdown fences, and never repeat text that is " +
                            "already before the caret. Keep it short — finish the current " +
                            "sentence or line, or add at most one more; two lines maximum. " +
                            "Match the document's language, style, and formatting. " +
                            hint +
                            " If no useful continuation exists, reply with an empty string.",
                    },
                    {
                        role: "user",
                        content: `${prefix}<CURSOR>${suffix}`,
                    },
                ],
            }),
        });

        if (!res.ok || !res.body) return "";

        const output = await readSseText(
            res.body,
            onPartial
                ? (acc) => {
                      const partial = cleanCompletion(acc);
                      if (partial.trim()) onPartial(partial);
                  }
                : undefined,
        );
        const cleaned = cleanCompletion(output);
        if (!cleaned.trim()) return "";
        return cleaned;
    } catch {
        return "";
    }
}
