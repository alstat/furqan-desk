import { writable, get } from "svelte/store";
import { openAppWindow } from "$lib/utils/appWindow";
import { supabase } from "$lib/supabase";
import { isPro } from "$lib/stores/auth.store";
import {
    listChats,
    loadChat as loadChatMessages,
    createChat,
    appendMessage,
    updateMessageContent,
    updateChatTitle,
    deleteChat as deleteChatRow,
    getStorageUsage,
    getTierLimits,
    type ChatSummary,
    type TierLimits,
} from "$lib/stores/chat-storage";
import { refreshTokenWarning } from "$lib/stores/token-warning.store";

export interface ChatMessage {
    id?: string;
    role: "system" | "user" | "assistant";
    content: string;
}

export interface QuotaBlock {
    scope: "weekly" | "monthly" | "storage";
    modelClass?: "standard" | "advanced";
    retryAfterSeconds?: number;
    message: string;
}

export const messages = writable<ChatMessage[]>([]);
export const streaming = writable<boolean>(false);
export const currentChatId = writable<string | null>(null);
export const chats = writable<ChatSummary[]>([]);
export const storageBytes = writable<number>(0);
export const limits = writable<TierLimits | null>(null);
export const quotaBlock = writable<QuotaBlock | null>(null);
export const aiChatDialogOpen = writable<boolean>(false);
export const pendingSelectionQuestion = writable<{
    prompt: string;
    selectedText: string;
    contextPrompt?: string;
    feature: string;
} | null>(null);
// When true, the next message uses the advanced (premium) model instead of the
// cheap default. Persisted across the session via localStorage so the user's
// preference survives dialog close/open.
export const useAdvanced = writable<boolean>(false);

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`;
const TITLE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-chat-title`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let abortController: AbortController | null = null;

export function clearMessages() {
    messages.set([]);
}

export function newChat() {
    if (get(streaming)) return;
    messages.set([]);
    currentChatId.set(null);
    quotaBlock.set(null);
}

/** Label of the chat's own OS window. */
export const AI_CHAT_WINDOW = "ai-chat";

/**
 * Where a pending "ask about this selection" payload waits for the chat window
 * to pick it up. localStorage rather than an event: the window may still be
 * booting when the payload is handed over, and a selection can be long enough
 * that a query string is the wrong place for it. Every window on the origin
 * shares this, and the chat window clears the key once it has read it.
 */
const PENDING_KEY = "aiChatPendingQuestion";

export interface PendingSelectionQuestion {
    prompt: string;
    selectedText: string;
    contextPrompt?: string;
    /**
     * Which AI surface this question originated from — tagged all the way
     * through to token_usage.feature so the admin dashboard can report usage
     * per surface (AiSelectionToolbar, TafsirDialog, etc.) even though they
     * all end up as a chat-completion request. See AI_FEATURE_TAGS below for
     * the accepted values.
     */
    feature: string;
}

// AI surfaces that route through the chat window ("Ask AI"). Kept as a
// single source of truth so every askAiAboutSelection() caller uses an
// agreed tag — see supabase's token_usage.feature (added in
// ayahlab-website's 20260830000003_token_usage_feature_tracking.sql) and the
// admin dashboard's featureLabel() in ayahlab-website.
export const AI_FEATURE_TAGS = {
    selectionToolbar: "selection_toolbar",
    tafsirDialog: "tafsir_dialog",
    morphologyViewer: "morphology_viewer",
    wordMorphologyPopup: "word_morphology_popup",
    manuscriptAiPrompt: "manuscript_ai_prompt",
    editorQuranBlockPrompt: "editor_quran_block_prompt",
} as const;

/**
 * The chat runs in a window of its own so it behaves like a native companion
 * window — its own entry in the dock/taskbar, and it stays open beside the
 * reader instead of floating over it.
 */
function openAiChatWindow(): Promise<boolean> {
    // Any pending question is already in localStorage, so a window that is
    // merely refocused picks it up from the storage event — nothing to hand it.
    return openAppWindow({
        label: AI_CHAT_WINDOW,
        url: "/ai-chat/",
        title: "AI Chat",
        width: 960,
        height: 680,
        minWidth: 720,
        minHeight: 520,
    });
}

/** Open the chat, or focus it if it is already open. */
export async function openAiChat(): Promise<void> {
    if (await openAiChatWindow()) return;
    // Fallback: the floating panel inside the main window.
    aiChatDialogOpen.set(true);
}

export function askAiAboutSelection({
    prompt,
    selectedText,
    contextPrompt,
    feature,
}: PendingSelectionQuestion): void {
    // Written before the window opens so it is already waiting, however long
    // the window takes to boot.
    try {
        localStorage.setItem(
            PENDING_KEY,
            JSON.stringify({ prompt, selectedText, contextPrompt, feature }),
        );
    } catch {
        // Storage full or disabled — the in-app fallback still works below.
    }
    pendingSelectionQuestion.set({ prompt, selectedText, contextPrompt, feature });
    void openAiChat();
}

/**
 * Take whatever question is waiting, clearing it so it is delivered once. Used
 * by the chat window on boot and whenever the main window leaves a new one.
 */
export function takePendingSelectionQuestion(): PendingSelectionQuestion | null {
    try {
        const raw = localStorage.getItem(PENDING_KEY);
        if (!raw) return null;
        localStorage.removeItem(PENDING_KEY);
        return JSON.parse(raw) as PendingSelectionQuestion;
    } catch {
        return null;
    }
}

export async function refreshChats(userId: string): Promise<void> {
    try {
        const list = await listChats(userId);
        chats.set(list);
        const used = await getStorageUsage(userId);
        storageBytes.set(used);
    } catch (e) {
        console.error("refreshChats failed", e);
    }
}

export async function refreshLimits(tier: string): Promise<void> {
    try {
        const t = await getTierLimits(tier);
        limits.set(t);
    } catch (e) {
        console.error("refreshLimits failed", e);
    }
}

export async function loadChat(chatId: string): Promise<void> {
    if (get(streaming)) return;
    try {
        const persisted = await loadChatMessages(chatId);
        messages.set(
            persisted.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
            })),
        );
        currentChatId.set(chatId);
        quotaBlock.set(null);
    } catch (e) {
        console.error("loadChat failed", e);
    }
}

export async function deleteChat(chatId: string, userId: string): Promise<void> {
    await deleteChatRow(chatId);
    if (get(currentChatId) === chatId) {
        messages.set([]);
        currentChatId.set(null);
    }
    await refreshChats(userId);
}

export function stopStreaming(): void {
    abortController?.abort();
}

export async function sendMessage(
    prompt: string,
    feature: string = "ai_chat",
): Promise<void> {
    const text = prompt.trim();
    if (!text) return;
    if (get(streaming)) return;
    quotaBlock.set(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const token = session?.access_token;
    const userId = session?.user.id;
    if (!token || !userId) {
        appendError("You must be signed in.");
        return;
    }

    // Storage cap pre-check.
    const lim = get(limits);
    if (lim) {
        const used = get(storageBytes);
        if (used >= lim.storage_bytes) {
            quotaBlock.set({
                scope: "storage",
                message: "Storage full. Delete a chat to make room.",
            });
            return;
        }
    }

    let chatId = get(currentChatId);
    let isNewChat = false;
    if (!chatId) {
        chatId = await createChat(userId, text);
        currentChatId.set(chatId);
        isNewChat = true;
        // Fire-and-forget title summarization. Falls back to derived title on
        // any failure. The chat list refreshes in finally{} below — that
        // refresh will pick up the new title if this resolves first; otherwise
        // a small extra refresh is triggered here.
        void summarizeAndApplyTitle(chatId, text, token, userId);
    }

    // Persist user message first so it's never lost.
    const userMsgId = await appendMessage(chatId, userId, "user", text);
    messages.update((m) => [
        ...m,
        { id: userMsgId, role: "user", content: text },
    ]);
    messages.update((m) => [...m, { role: "assistant", content: "" }]);

    streaming.set(true);
    abortController = new AbortController();

    const history = get(messages)
        .slice(0, -1)
        .map(({ role, content }) => ({ role, content }));

    let aborted = false;
    try {
        const res = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                apikey: ANON_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messages: history,
                // Advanced model is available to every Pro account.
                advanced: get(useAdvanced) && get(isPro),
                feature,
            }),
            signal: abortController.signal,
        });

        if (res.status === 429) {
            const body = await safeReadJson(res);
            replaceLastAssistant("");
            // Drop the empty assistant placeholder.
            messages.update((m) => m.slice(0, -1));
            const scope =
                typeof body?.scope === "string"
                    ? (body.scope as QuotaBlock["scope"])
                    : "weekly";
            const modelClass =
                body?.model_class === "advanced" ||
                body?.model_class === "standard"
                    ? body.model_class
                    : undefined;
            const retry =
                typeof body?.retry_after_seconds === "number"
                    ? body.retry_after_seconds
                    : undefined;
            const message =
                typeof body?.error === "string"
                    ? body.error
                    : "Token limit reached.";
            quotaBlock.set({
                scope,
                modelClass,
                retryAfterSeconds: retry,
                message,
            });
            return;
        }

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
        if (e instanceof DOMException && e.name === "AbortError") {
            aborted = true;
        } else {
            replaceLastAssistant(
                `*Error:* ${e instanceof Error ? e.message : String(e)}`,
            );
        }
    } finally {
        streaming.set(false);
        abortController = null;

        // Persist assistant message (full or partial).
        const finalContent =
            get(messages)[get(messages).length - 1]?.content ?? "";
        if (finalContent.trim().length > 0) {
            try {
                const aMsgId = await appendMessage(
                    chatId!,
                    userId,
                    "assistant",
                    finalContent + (aborted ? "\n\n_(stopped)_" : ""),
                );
                messages.update((m) => {
                    const next = [...m];
                    const last = next[next.length - 1];
                    if (last && last.role === "assistant") {
                        next[next.length - 1] = { ...last, id: aMsgId };
                    }
                    return next;
                });
            } catch (e) {
                console.error("persist assistant failed", e);
            }
        } else {
            // Empty assistant message — drop the placeholder.
            messages.update((m) => {
                const next = [...m];
                if (next[next.length - 1]?.role === "assistant" && !next[next.length - 1].content) {
                    next.pop();
                }
                return next;
            });
        }

        await refreshChats(userId);
        // The reply just moved the weekly budget; re-check now rather than
        // waiting out the toast's poll, so the warning lands while the user is
        // still looking at what spent it.
        void refreshTokenWarning();
        if (isNewChat) {
            // Already in chats list now via refresh.
        }
    }
}

async function summarizeAndApplyTitle(
    chatId: string,
    firstUserPrompt: string,
    token: string,
    userId: string,
): Promise<void> {
    try {
        const res = await fetch(TITLE_FUNCTION_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                apikey: ANON_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ chatId, firstUserPrompt }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { title?: string };
        const title = json.title?.trim();
        if (!title) return;
        await updateChatTitle(chatId, title);
        await refreshChats(userId);
    } catch {
        // swallow — derived title remains
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

async function safeReadJson(res: Response): Promise<Record<string, unknown> | null> {
    try {
        return (await res.json()) as Record<string, unknown>;
    } catch {
        return null;
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
                // ignore malformed chunk (including the final usage chunk
                // which the server consumes before forwarding)
            }
        }
    }
}
