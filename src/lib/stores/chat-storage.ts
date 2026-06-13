import { supabase } from "$lib/supabase";
import { encrypt, decrypt } from "$lib/utils/chat-crypto";
import { ensureUnlocked } from "$lib/stores/chat-key.store";

export interface ChatSummary {
    id: string;
    title: string;
    updatedAt: string;
}

export interface PersistedMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
}

export interface TierLimits {
    tier: string;
    daily_tokens: number;
    weekly_tokens: number;
    monthly_tokens: number;
    storage_bytes: number;
    advanced_daily_tokens: number;
    advanced_weekly_tokens: number;
    advanced_monthly_tokens: number;
}

export interface UsageWindow {
    used: number;
    /** Seconds until the oldest counted row falls out of this window;
     *  null when no rows are in the window. */
    resetInSeconds: number | null;
}

export interface UsageByClass {
    session: UsageWindow;
    daily: UsageWindow;
    weekly: UsageWindow;
    monthly: UsageWindow;
}

export interface TokenUsageStats {
    standard: UsageByClass;
    advanced: UsageByClass;
}

const SEC_DAY = 24 * 3600;
const SEC_WEEK = 7 * SEC_DAY;
const SEC_MONTH = 30 * SEC_DAY;
/** Rolling 4-hour session window — paces usage so the daily quota can't be
 *  exhausted in one sitting. */
export const SEC_SESSION = 4 * 3600;

/** Session cap derived from the daily cap. Keep in sync with
 *  SESSION_CAP_FRACTION_OF_DAILY in supabase/functions/chat-completion. */
export function sessionCapFromDaily(dailyTokens: number): number {
    return dailyTokens > 0 ? Math.ceil(dailyTokens / 3) : 0;
}

export async function getTokenUsageStats(
    userId: string,
): Promise<TokenUsageStats> {
    const since = new Date(Date.now() - SEC_MONTH * 1000).toISOString();
    const { data, error } = await supabase
        .from("token_usage")
        .select("total_tokens, created_at, model_class")
        .eq("user_id", userId)
        .gte("created_at", since)
        .order("created_at", { ascending: true });
    if (error) throw error;

    const now = Date.now();
    const rows = (data ?? []) as {
        total_tokens: number;
        created_at: string;
        model_class: "standard" | "advanced" | null;
    }[];

    const aggregate = (
        modelClass: "standard" | "advanced",
        windowSec: number,
    ): UsageWindow => {
        const cutoff = now - windowSec * 1000;
        let used = 0;
        let oldestTs: number | null = null;
        for (const r of rows) {
            // Treat legacy rows (null model_class) as standard.
            const cls = r.model_class ?? "standard";
            if (cls !== modelClass) continue;
            const ts = new Date(r.created_at).getTime();
            if (ts < cutoff) continue;
            used += r.total_tokens ?? 0;
            if (oldestTs === null || ts < oldestTs) oldestTs = ts;
        }
        const resetInSeconds =
            oldestTs === null
                ? null
                : Math.max(0, Math.floor((oldestTs + windowSec * 1000 - now) / 1000));
        return { used, resetInSeconds };
    };

    return {
        standard: {
            session: aggregate("standard", SEC_SESSION),
            daily: aggregate("standard", SEC_DAY),
            weekly: aggregate("standard", SEC_WEEK),
            monthly: aggregate("standard", SEC_MONTH),
        },
        advanced: {
            session: aggregate("advanced", SEC_SESSION),
            daily: aggregate("advanced", SEC_DAY),
            weekly: aggregate("advanced", SEC_WEEK),
            monthly: aggregate("advanced", SEC_MONTH),
        },
    };
}

const TITLE_MAX_LEN = 60;

export function deriveTitle(firstUserPrompt: string): string {
    const single = firstUserPrompt.replace(/\s+/g, " ").trim();
    return single.length > TITLE_MAX_LEN
        ? single.slice(0, TITLE_MAX_LEN - 1) + "…"
        : single;
}

export async function listChats(userId: string): Promise<ChatSummary[]> {
    const key = ensureUnlocked();
    const { data, error } = await supabase
        .from("chats")
        .select("id, title_ciphertext, title_iv, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
    if (error) throw error;

    const out: ChatSummary[] = [];
    for (const row of data ?? []) {
        let title = "Untitled";
        if (row.title_ciphertext && row.title_iv) {
            try {
                title = await decrypt(key, row.title_ciphertext, row.title_iv);
            } catch {
                title = "(unreadable)";
            }
        }
        out.push({ id: row.id, title, updatedAt: row.updated_at });
    }
    return out;
}

export async function loadChat(chatId: string): Promise<PersistedMessage[]> {
    const key = ensureUnlocked();
    const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content_ciphertext, content_iv, created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });
    if (error) throw error;

    const out: PersistedMessage[] = [];
    for (const row of data ?? []) {
        let content = "";
        try {
            content = await decrypt(
                key,
                row.content_ciphertext,
                row.content_iv,
            );
        } catch {
            content = "(unreadable)";
        }
        out.push({
            id: row.id,
            role: row.role,
            content,
            createdAt: row.created_at,
        });
    }
    return out;
}

export async function createChat(
    userId: string,
    firstUserPrompt: string,
): Promise<string> {
    const key = ensureUnlocked();
    const title = deriveTitle(firstUserPrompt);
    const env = await encrypt(key, title);

    const { data, error } = await supabase
        .from("chats")
        .insert({
            user_id: userId,
            title_ciphertext: env.ciphertext,
            title_iv: env.iv,
        })
        .select("id")
        .single();
    if (error) throw error;
    return data.id as string;
}

export async function updateChatTitle(
    chatId: string,
    newTitle: string,
): Promise<void> {
    const key = ensureUnlocked();
    const env = await encrypt(key, newTitle);
    const { error } = await supabase
        .from("chats")
        .update({ title_ciphertext: env.ciphertext, title_iv: env.iv })
        .eq("id", chatId);
    if (error) throw error;
}

export async function appendMessage(
    chatId: string,
    userId: string,
    role: "user" | "assistant" | "system",
    content: string,
): Promise<string> {
    const key = ensureUnlocked();
    const env = await encrypt(key, content);
    const sizeBytes = env.ciphertext.length;

    const { data, error } = await supabase
        .from("chat_messages")
        .insert({
            chat_id: chatId,
            user_id: userId,
            role,
            content_ciphertext: env.ciphertext,
            content_iv: env.iv,
            size_bytes: sizeBytes,
        })
        .select("id")
        .single();
    if (error) throw error;

    await supabase
        .from("chats")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", chatId);

    return data.id as string;
}

export async function updateMessageContent(
    messageId: string,
    content: string,
): Promise<void> {
    const key = ensureUnlocked();
    const env = await encrypt(key, content);
    const sizeBytes = env.ciphertext.length;

    const { error } = await supabase
        .from("chat_messages")
        .update({
            content_ciphertext: env.ciphertext,
            content_iv: env.iv,
            size_bytes: sizeBytes,
        })
        .eq("id", messageId);
    if (error) throw error;
}

export async function deleteChat(chatId: string): Promise<void> {
    const { error } = await supabase.from("chats").delete().eq("id", chatId);
    if (error) throw error;
}

export async function getStorageUsage(userId: string): Promise<number> {
    const { data, error } = await supabase
        .from("chat_messages")
        .select("size_bytes")
        .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).reduce(
        (sum, r: { size_bytes: number }) => sum + (r.size_bytes ?? 0),
        0,
    );
}

export async function getTierLimits(tier: string): Promise<TierLimits | null> {
    const { data, error } = await supabase
        .from("tier_limits")
        .select("*")
        .eq("tier", tier)
        .maybeSingle();
    if (error) throw error;
    return (data as TierLimits | null) ?? null;
}
