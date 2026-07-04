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
        const stored = localStorage.getItem(ENABLED_KEY);
        // Respect an explicit choice; otherwise default ON. Only Pro/Pro+
        // accounts actually run it — `aiAutocompleteActive()` still gates on
        // `isPro` — so this simply turns the feature on by default for them.
        if (stored === "true") return true;
        if (stored === "false") return false;
        return true;
    } catch {
        return true;
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

// ── Rate-limit backoff ───────────────────────────────────────────────────────
// The edge function replies 429 when the account is asking for completions too
// quickly. Autocompletion fires on every typing pause, so without a cooldown we
// keep hammering the endpoint (and spamming the console with 429s). When we see
// a 429 we pause all requests until `cooldownUntil`, honouring the server's
// Retry-After when present.
const DEFAULT_BACKOFF_MS = 30_000;
// Cap how long we stay paused after a quota 429. Token quotas can report a
// retry_after of many hours; we still want to re-check within the hour in case
// the quota frees sooner (rolling window) or the account's tier changes.
const MAX_BACKOFF_MS = 60 * 60 * 1000;
let cooldownUntil = 0;

/** True when the feature should run: enabled in Settings AND Pro/Pro+. */
export function aiAutocompleteActive(): boolean {
    return get(_enabled) && get(isPro) && Date.now() >= cooldownUntil;
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
    // Still cooling down from a recent 429 — skip the request entirely.
    if (Date.now() < cooldownUntil) return "";
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

        if (res.status === 429) {
            // Quota reached. The function reports the wait in its JSON body
            // (`retry_after_seconds`) — there is no Retry-After header — so read
            // the body and pause until the quota frees instead of re-hitting the
            // limit every few seconds. Capped so we still re-check periodically.
            let secs = 0;
            const header = Number(res.headers.get("retry-after"));
            if (Number.isFinite(header) && header > 0) {
                secs = header;
            } else {
                try {
                    const body = await res.json();
                    const n = Number(body?.retry_after_seconds);
                    if (Number.isFinite(n) && n > 0) secs = n;
                } catch {
                    /* body wasn't JSON — fall back to the default backoff */
                }
            }
            const ms =
                secs > 0
                    ? Math.min(secs * 1000, MAX_BACKOFF_MS)
                    : DEFAULT_BACKOFF_MS;
            cooldownUntil = Date.now() + ms;
            return "";
        }

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
