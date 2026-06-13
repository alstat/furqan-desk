import { writable, get } from "svelte/store";
import { supabase } from "$lib/supabase";

export type AiTextAction = "paraphrase" | "elaborate" | "shorten" | "prompt";
export type AiTextTone =
    | "academic"
    | "casual"
    | "persuasive"
    | "bold"
    | "friendly";
export type AiModelClass = "standard" | "advanced";

const MODEL_KEY = "ai-text-default-model";
const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function loadDefaultModel(): AiModelClass {
    try {
        const stored = localStorage.getItem(MODEL_KEY);
        if (stored === "advanced" || stored === "standard") return stored;
    } catch {
        /* ignore */
    }
    return "standard";
}

const _aiTextDefaultModel = writable<AiModelClass>(loadDefaultModel());

export const aiTextDefaultModel = {
    subscribe: _aiTextDefaultModel.subscribe,
    set(value: AiModelClass) {
        try {
            localStorage.setItem(MODEL_KEY, value);
        } catch {
            /* ignore */
        }
        _aiTextDefaultModel.set(value);
    },
};

const toneInstructions: Record<AiTextTone, string> = {
    academic:
        "Write the result in an academic tone: formal, precise, and scholarly.",
    casual: "Write the result in a casual, conversational tone.",
    persuasive: "Write the result in a persuasive, compelling tone.",
    bold: "Write the result in a bold, confident, assertive tone.",
    friendly: "Write the result in a friendly, warm, approachable tone.",
};

function instructionFor(
    action: AiTextAction,
    customPrompt?: string,
    tone?: AiTextTone,
): string {
    let instruction: string;
    if (action === "paraphrase") {
        instruction = tone
            ? "Paraphrase the selected text while preserving its meaning and important terminology."
            : "Paraphrase the selected text while preserving its meaning, tone, and important terminology.";
    } else if (action === "elaborate") {
        instruction =
            "Elaborate the selected text with useful detail and clarity while keeping it focused.";
    } else if (action === "shorten") {
        instruction =
            "Shorten the selected text while preserving the core meaning and key details.";
    } else {
        instruction = customPrompt?.trim() || "Improve the selected text.";
    }
    return tone ? `${instruction} ${toneInstructions[tone]}` : instruction;
}

export async function runAiTextTransform({
    action,
    selectedText,
    customPrompt,
    contextPrompt,
    tone,
}: {
    action: AiTextAction;
    selectedText: string;
    customPrompt?: string;
    contextPrompt?: string;
    tone?: AiTextTone;
}): Promise<string> {
    const text = selectedText.trim();
    if (!text) throw new Error("Select text first.");

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You must be signed in.");

    const instruction = instructionFor(action, customPrompt, tone);
    const context = contextPrompt?.trim();
    const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            apikey: ANON_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            advanced: get(_aiTextDefaultModel) === "advanced",
            messages: [
                {
                    role: "system",
                    content:
                        "You are an expert writing assistant embedded in an editor. Return only the transformed replacement text. Do not add explanations, labels, markdown fences, or surrounding quotes unless the user explicitly asks for them.",
                },
                {
                    role: "user",
                    content: `${context ? `Context:\n${context}\n\n` : ""}${instruction}\n\nSelected text:\n${text}`,
                },
            ],
        }),
    });

    if (res.status === 429) {
        const body = await safeReadJson(res);
        throw new Error(
            typeof body?.error === "string"
                ? body.error
                : "Token limit reached.",
        );
    }

    if (!res.ok) {
        const body = await safeReadJson(res);
        throw new Error(
            typeof body?.error === "string"
                ? body.error
                : `${res.status} ${res.statusText}`,
        );
    }

    if (!res.body) throw new Error("Empty AI response.");

    const output = await readSseText(res.body);
    const replacement = output.trim();
    if (!replacement) throw new Error("AI returned an empty response.");
    return replacement;
}

async function safeReadJson(res: Response): Promise<Record<string, unknown> | null> {
    try {
        return (await res.json()) as Record<string, unknown>;
    } catch {
        return null;
    }
}

async function readSseText(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let output = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
                const json = JSON.parse(payload);
                const delta = json.choices?.[0]?.delta?.content;
                if (typeof delta === "string") output += delta;
            } catch {
                /* ignore non-delta chunks */
            }
        }
    }

    return output;
}
