/** Reading a 429 from the chat-completion function.
 *
 * The function meters the standard and advanced model classes against separate
 * columns, and answers a refusal with the window it belongs to (`scope`), the
 * class it applies to (`model_class`) and how long until that window frees up.
 * The stores copy those onto the thrown error; this turns them back into
 * something a panel can print without inventing facts it doesn't have. */

export interface QuotaFailure {
    /** The server's own wording, e.g. "Daily token limit reached". */
    message: string;
    /** "standard" | "advanced", when the server named one. */
    modelClass?: string;
    /** "daily" | "weekly" | "monthly", when the server named one. */
    scope?: string;
    retryAfterSeconds?: number;
}

/** Returns the quota detail of a 429, or null for anything else. */
export function quotaFailure(error: unknown): QuotaFailure | null {
    const e = error as
        | (Error & {
              status?: number;
              modelClass?: string;
              scope?: string;
              retryAfterSeconds?: number;
          })
        | null;
    if (!e || e.status !== 429) return null;
    return {
        message: e.message || "Token limit reached.",
        modelClass: e.modelClass,
        scope: e.scope,
        retryAfterSeconds: e.retryAfterSeconds,
    };
}

/** i18n key for the sentence that fits what the server told us. */
export function quotaMessageKey(failure: QuotaFailure): string {
    if (failure.modelClass === "advanced") return "ai_quota.blocked_advanced";
    if (failure.modelClass === "standard") return "ai_quota.blocked_standard";
    return "ai_quota.blocked_generic";
}

/** "3h 20m", "12m", "45s" — or "a while" when the server didn't say. */
export function formatRetryWindow(seconds: number | undefined): string {
    if (!seconds || seconds < 0) return "a while";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}
