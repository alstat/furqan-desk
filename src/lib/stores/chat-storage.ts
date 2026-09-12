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
    /** The quota paid users budget against: a rolling 7-day window. */
    weekly_tokens: number;
    /** Cost backstop only — not surfaced as a limit users manage. */
    monthly_tokens: number;
    storage_bytes: number;
    advanced_weekly_tokens: number;
    advanced_monthly_tokens: number;
    /**
     * The Free tier's allowance: a rolling 24h window. 0 on every tier that
     * has no daily ceiling — which is all the paid ones, since they budget
     * weekly instead. Where it is positive, it is the cap that actually binds.
     *
     * Note the sentinel differs from the weekly/monthly caps, where 0 means a
     * closed pool rather than an absent limit: a tier with no daily cap still
     * has a real weekly one, so the two cases have to be distinguishable here
     * and must not be there.
     */
    daily_tokens: number;
    advanced_daily_tokens: number;
}

export interface UsageWindow {
    used: number;
    /** Seconds until the oldest counted row falls out of this window;
     *  null when no rows are in the window. */
    resetInSeconds: number | null;
}

export interface UsageByClass {
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

/** One (pool, window) total as returned by the token_usage_windows RPC. */
interface UsageWindowRow {
    pool: "standard" | "advanced";
    window_seconds: number;
    used: number | string;
    oldest_at: string | null;
}

/**
 * Daily, weekly and monthly token usage for the signed-in user, per model
 * class.
 *
 * Postgres does the summing — see the token_usage_windows migration. This used
 * to pull every row from the last 30 days and add them up here, which is a read
 * that grows with usage and, since the weekly budget warning polls, now repeats
 * rather than happening once when the account dialog opens.
 *
 * The RPC scopes itself to the caller via auth.uid(), so there is no user id to
 * pass: it always describes whoever is signed in.
 */
export async function getTokenUsageStats(): Promise<TokenUsageStats> {
    const { data, error } = await supabase.rpc("token_usage_windows");
    if (error) throw error;

    const now = Date.now();
    const empty = (): UsageWindow => ({ used: 0, resetInSeconds: null });
    const emptyClass = (): UsageByClass => ({
        daily: empty(),
        weekly: empty(),
        monthly: empty(),
    });
    const stats: TokenUsageStats = {
        standard: emptyClass(),
        advanced: emptyClass(),
    };

    for (const row of (data ?? []) as UsageWindowRow[]) {
        const window =
            row.window_seconds === SEC_DAY
                ? "daily"
                : row.window_seconds === SEC_WEEK
                  ? "weekly"
                  : row.window_seconds === SEC_MONTH
                    ? "monthly"
                    : null;
        if (!window || !stats[row.pool]) continue;

        // Rolling windows free tokens gradually: this is when the oldest spend
        // still being counted ages out, not a fixed reset date.
        const oldestMs = row.oldest_at ? new Date(row.oldest_at).getTime() : null;
        stats[row.pool][window] = {
            used: Number(row.used) || 0,
            resetInSeconds:
                oldestMs === null
                    ? null
                    : Math.max(
                          0,
                          Math.floor(
                              (oldestMs + row.window_seconds * 1000 - now) / 1000,
                          ),
                      ),
        };
    }
    return stats;
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
