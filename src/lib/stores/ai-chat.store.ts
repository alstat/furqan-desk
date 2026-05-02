import { writable, get } from "svelte/store";
import { supabase } from "$lib/supabase";

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export const messages = writable<ChatMessage[]>([]);
export const streaming = writable<boolean>(false);

export function clearMessages() {
    messages.set([]);
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export async function sendMessage(prompt: string): Promise<void> {
    const text = prompt.trim();
    if (!text) return;
    if (get(streaming)) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
        appendError("You must be signed in.");
        return;
    }

    messages.update((m) => [...m, { role: "user", content: text }]);
    messages.update((m) => [...m, { role: "assistant", content: "" }]);
    streaming.set(true);

    const history = get(messages).slice(0, -1);

    try {
        const res = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                apikey: ANON_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ messages: history }),
        });

        if (!res.ok) {
            const err = await safeReadError(res);
            replaceLastAssistant(`*Error:* ${err}`);
            return;
        }
        if (!res.body) {
            replaceLastAssistant("*Error:* empty response");
            return;
        }

        await readSseStream(res.body, (chunk) => {
            messages.update((m) => {
                const next = [...m];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                    next[next.length - 1] = {
                        ...last,
                        content: last.content + chunk,
                    };
                }
                return next;
            });
        });
    } catch (e) {
        replaceLastAssistant(
            `*Error:* ${e instanceof Error ? e.message : String(e)}`,
        );
    } finally {
        streaming.set(false);
    }
}

async function safeReadError(res: Response): Promise<string> {
    try {
        const json = await res.json();
        return typeof json.error === "string"
            ? json.error
            : `${res.status} ${res.statusText}`;
    } catch {
        return `${res.status} ${res.statusText}`;
    }
}

function replaceLastAssistant(content: string) {
    messages.update((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, content };
        }
        return next;
    });
}

function appendError(content: string) {
    messages.update((m) => [
        ...m,
        { role: "assistant", content: `*Error:* ${content}` },
    ]);
}

async function readSseStream(
    body: ReadableStream<Uint8Array>,
    onDelta: (chunk: string) => void,
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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
                if (typeof delta === "string" && delta.length > 0) {
                    onDelta(delta);
                }
            } catch {
                // ignore malformed chunk
            }
        }
    }
}
