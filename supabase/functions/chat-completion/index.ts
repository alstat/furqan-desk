// Supabase Edge Function: chat-completion
// Verifies the caller's JWT, resolves the account's tier, picks a model class
// (standard vs. advanced) from the request, enforces that tier's token quota,
// then proxies to OpenAI Chat Completions and streams the response back.
// Records token usage on completion (or estimates on abort) using the service
// role.
//
// Every signed-in account may call this — Free included. Free is not gated out
// of the AI; it is held to a small DAILY allowance instead, which lives in
// tier_limits.daily_tokens. The paid tiers leave that column NULL and budget
// against the rolling weekly window, with the monthly one as a cost backstop.
//
// Tiers: "free" | "starter" | "pro" | "pro_plus". Starter is a paid tier with
// no Advanced allowance, so — like Free — an advanced=true request from it is
// served with the standard model rather than refused.
//
// Required secrets (Supabase Dashboard → Project Settings → Edge Functions → Secrets):
//   OPENAI_API_KEY              — your OpenAI key
//   OPENAI_MODEL_STANDARD       — cheap default model (e.g. "gpt-4o-mini").
//                                 Used unless the request body sets advanced=true.
//                                 Falls back to OPENAI_MODEL, then "gpt-4o-mini".
//   OPENAI_MODEL_ADVANCED       — premium model (e.g. "gpt-5.4"). Used when the
//                                 request body sets advanced=true. Falls back to
//                                 OPENAI_MODEL_STANDARD if not set.
//   OPENAI_MODEL_STANDARD_PROPLUS — standard-class model for Pro+ (tier="pro_plus").
//                                 Falls back to OPENAI_MODEL_STANDARD if not set.
//   OPENAI_MODEL_ADVANCED_PROPLUS — advanced-class model for Pro+ (tier="pro_plus").
//                                 Falls back to OPENAI_MODEL_ADVANCED if not set.
//   OPENAI_MODEL_STANDARD_STARTER — standard-class model for Starter (tier="starter").
//                                 Falls back to OPENAI_MODEL_STANDARD if not set.
//   OPENAI_MODEL_STANDARD_FREE  — standard-class model for Free accounts. Falls back
//                                 to OPENAI_MODEL_STANDARD if not set. Point this at
//                                 a cheaper model than the paid tiers get if the free
//                                 daily allowance needs to cost less per token.
//   OPENAI_MAX_COMPLETION_TOKENS — hard ceiling on output tokens per response.
//                                 Defaults to 4000. Bounds worst-case output cost
//                                 per request and prevents runaway essays. Set
//                                 lower for tighter margins, higher for longer
//                                 free-form generations. NOTE: for reasoning models
//                                 this budget is shared with hidden reasoning tokens,
//                                 so a heavy prompt can exhaust it on reasoning and
//                                 return empty content — use the reasoning-effort
//                                 secrets below to prevent that.
//   OPENAI_REASONING_EFFORT_STANDARD / OPENAI_REASONING_EFFORT_ADVANCED
//                                 — optional. When set to one of "minimal", "low",
//                                 "medium" or "high", the value is passed as
//                                 `reasoning_effort` for that model class. Set
//                                 STANDARD to "low" (or "minimal") when your standard
//                                 model is a reasoning model so it doesn't burn the
//                                 whole completion-token budget thinking and return
//                                 nothing. Leave UNSET for non-reasoning models
//                                 (e.g. gpt-4o-mini) — they reject this parameter.
//   SB_SECRET_KEY               — rotatable secret key (Dashboard → Project Settings →
//                                 API → API Keys → "Secret keys", value starts with
//                                 sb_secret_...). Used for writing token_usage past
//                                 RLS. Supabase reserves the SUPABASE_ prefix for
//                                 auto-injected vars, so we use SB_ instead.
//                                 Falls back to the auto-injected legacy
//                                 SUPABASE_SERVICE_ROLE_KEY if SB_SECRET_KEY isn't set.
//   SUPABASE_URL                — auto-injected
//   SUPABASE_ANON_KEY           — auto-injected (or use SUPABASE_PUBLISHABLE_KEY if rolled out)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// The rolling quota windows, in seconds. These must match the windows the
// token_usage_windows_for RPC aggregates over.
const SEC_DAY = 24 * 3600;
const SEC_WEEK = 7 * SEC_DAY;
const SEC_MONTH = 30 * SEC_DAY;

/** Every tier that has a tier_limits row. Anything else is not a tier. */
const KNOWN_TIERS = new Set(["free", "starter", "pro", "pro_plus"]);

/** Tiers whose accounts may spend the Advanced model's quota. */
const ADVANCED_TIERS = new Set(["pro", "pro_plus"]);

const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface RequestBody {
    messages: ChatMessage[];
    advanced?: boolean;
}

type ModelClass = "standard" | "advanced";

function jsonError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
    return new Response(JSON.stringify({ error: message, ...extra }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function estimateTokensFromMessages(messages: ChatMessage[]): number {
    const chars = messages.reduce((s, m) => s + (m.content?.length ?? 0), 0);
    return Math.ceil(chars / 4);
}

interface WindowUsage {
    used: number;
    /** created_at of the oldest counted row, in ms; null when none. */
    oldestMs: number | null;
}

interface UsageWindowRow {
    pool: string;
    window_seconds: number;
    used: number | string;
    oldest_at: string | null;
}

/**
 * Every rolling window for one user and model class, summed in Postgres.
 *
 * This used to be two queries that each pulled every matching token_usage row
 * and added them up here — a read that grew with the account's history, on the
 * path of every message. The RPC returns a handful of small rows instead; we
 * keep the ones for the class being charged.
 *
 * It is SECURITY DEFINER and granted to service_role alone, so it works with
 * the admin client (where auth.uid() is null) and is unreachable from the app.
 *
 * Note it counts rows with a NULL model_class as standard, which the previous
 * `.eq("model_class", ...)` filter excluded. Those are pre-split rows and the
 * tokens were really spent, so this now agrees with what the account dialog
 * has always shown.
 */
async function getUsageWindows(
    admin: ReturnType<typeof createClient>,
    userId: string,
    modelClass: ModelClass,
): Promise<{ daily: WindowUsage; weekly: WindowUsage; monthly: WindowUsage }> {
    const { data, error } = await admin.rpc("token_usage_windows_for", {
        p_user_id: userId,
    });
    if (error) throw new Error(`usage query failed: ${error.message}`);

    const empty = (): WindowUsage => ({ used: 0, oldestMs: null });
    const windows = { daily: empty(), weekly: empty(), monthly: empty() };
    for (const row of (data ?? []) as UsageWindowRow[]) {
        if (row.pool !== modelClass) continue;
        const key =
            row.window_seconds === SEC_DAY
                ? "daily"
                : row.window_seconds === SEC_WEEK
                  ? "weekly"
                  : row.window_seconds === SEC_MONTH
                    ? "monthly"
                    : null;
        if (!key) continue;
        windows[key] = {
            used: Number(row.used) || 0,
            oldestMs: row.oldest_at ? new Date(row.oldest_at).getTime() : null,
        };
    }
    return windows;
}

/** Seconds until the oldest counted tokens age out of a rolling window. */
function secondsUntilFree(usage: WindowUsage, windowSec: number): number {
    if (usage.oldestMs === null) return windowSec;
    return Math.max(
        0,
        Math.ceil((usage.oldestMs + windowSec * 1000 - Date.now()) / 1000),
    );
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonError(405, "Method not allowed");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return jsonError(401, "Missing Authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey =
        Deno.env.get("SUPABASE_ANON_KEY") ??
        Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const adminKey =
        Deno.env.get("SB_SECRET_KEY") ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
        return jsonError(500, "Supabase env not configured");
    }
    if (!openaiKey) {
        return jsonError(500, "OPENAI_API_KEY not configured");
    }
    if (!adminKey) {
        return jsonError(
            500,
            "SB_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) not configured",
        );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, adminKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
        data: { user },
        error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
        return jsonError(401, "Invalid or expired token");
    }

    // No Pro gate: Free accounts reach the model too, held to the daily
    // allowance on their tier_limits row. The tier string is the only thing
    // that decides what they get.
    //
    // Normalised the same way the app's auth store does it, and for the same
    // two reasons: a token issued before Starter existed carries is_pro with
    // no tier field, and that used to mean Pro — so it still does; and a tier
    // string nobody here recognises must not become a lookup for a
    // tier_limits row that cannot exist, which would fail the request outright
    // rather than degrading to the free allowance.
    const rawTier = user.app_metadata?.tier;
    const tier =
        typeof rawTier === "string" && KNOWN_TIERS.has(rawTier)
            ? rawTier
            : user.app_metadata?.is_pro === true
              ? "pro"
              : "free";

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return jsonError(400, "Invalid JSON body");
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return jsonError(400, "messages must be a non-empty array");
    }

    // Free and Starter have no Advanced allowance. The app hides the toggle
    // for them, so a request asking for it is a stale client rather than a
    // user decision — serve the standard model instead of failing the call.
    // Erroring here would also be misleading: their advanced caps are 0, so
    // the quota check below would report a "limit reached" they can never
    // clear by waiting.
    const modelClass: ModelClass =
        body.advanced === true && ADVANCED_TIERS.has(tier)
            ? "advanced"
            : "standard";

    // Resolve the model id. Backwards compatible with legacy OPENAI_MODEL.
    const standardModel =
        Deno.env.get("OPENAI_MODEL_STANDARD") ??
        Deno.env.get("OPENAI_MODEL") ??
        "gpt-4o-mini";
    const advancedModel =
        Deno.env.get("OPENAI_MODEL_ADVANCED") ?? standardModel;

    // Per-tier standard models. Each falls back to the shared standard model
    // when its own secret isn't set, so no tier breaks just because only some
    // of the overrides are configured. Only Pro+ overrides the advanced model
    // — Pro uses the shared one, and Free/Starter never reach that branch.
    const standardModelFor: Record<string, string> = {
        free: Deno.env.get("OPENAI_MODEL_STANDARD_FREE") ?? standardModel,
        starter: Deno.env.get("OPENAI_MODEL_STANDARD_STARTER") ?? standardModel,
        pro: standardModel,
        pro_plus: Deno.env.get("OPENAI_MODEL_STANDARD_PROPLUS") ?? standardModel,
    };
    const advancedModelProPlus =
        Deno.env.get("OPENAI_MODEL_ADVANCED_PROPLUS") ?? advancedModel;

    const model =
        modelClass === "advanced"
            ? tier === "pro_plus"
                ? advancedModelProPlus
                : advancedModel
            : (standardModelFor[tier] ?? standardModel);

    // Quota check — separate columns per model class.
    const { data: limitsRow, error: limitsErr } = await admin
        .from("tier_limits")
        .select(
            "weekly_tokens, monthly_tokens, advanced_weekly_tokens, " +
                "advanced_monthly_tokens, daily_tokens, advanced_daily_tokens",
        )
        .eq("tier", tier)
        .maybeSingle();
    if (limitsErr) {
        return jsonError(500, `tier_limits query failed: ${limitsErr.message}`);
    }
    if (!limitsRow) {
        return jsonError(500, `No tier_limits row for tier="${tier}"`);
    }

    // The weekly window is the quota paid users actually budget against: a
    // rolling 7 days, so a heavy session borrows from the days around it
    // instead of locking the feature out until midnight. Monthly stays purely
    // as a cost backstop and is not surfaced as a limit users are asked to
    // manage.
    //
    // The daily window is the Free tier's allowance and applies only where the
    // tier row sets a positive one — 0 means the tier has no daily ceiling,
    // which is every paid tier. (That sentinel differs from the weekly and
    // monthly caps, where 0 closes the pool; see the tier_limits migration.)
    // It is checked first so a Free account that has spent today's tokens is
    // told it gets more tomorrow, rather than being handed the weekly figure
    // it will never actually reach.
    const cap = (advanced: unknown, standard: unknown): number =>
        Number(modelClass === "advanced" ? advanced : standard) || 0;

    const weeklyCap = cap(
        limitsRow.advanced_weekly_tokens,
        limitsRow.weekly_tokens,
    );
    const monthlyCap = cap(
        limitsRow.advanced_monthly_tokens,
        limitsRow.monthly_tokens,
    );
    const dailyCap = cap(
        limitsRow.advanced_daily_tokens,
        limitsRow.daily_tokens,
    );

    try {
        const { daily, weekly, monthly } = await getUsageWindows(
            admin,
            user.id,
            modelClass,
        );
        if (dailyCap > 0 && daily.used >= dailyCap) {
            return jsonError(429, "Daily token limit reached", {
                scope: "daily",
                model_class: modelClass,
                tier,
                retry_after_seconds: secondsUntilFree(daily, SEC_DAY),
            });
        }
        if (weekly.used >= weeklyCap) {
            return jsonError(429, "Weekly token limit reached", {
                scope: "weekly",
                model_class: modelClass,
                tier,
                retry_after_seconds: secondsUntilFree(weekly, SEC_WEEK),
            });
        }
        if (monthly.used >= monthlyCap) {
            return jsonError(429, "Monthly token limit reached", {
                scope: "monthly",
                model_class: modelClass,
                tier,
                retry_after_seconds: secondsUntilFree(monthly, SEC_MONTH),
            });
        }
    } catch (e) {
        return jsonError(500, e instanceof Error ? e.message : String(e));
    }

    const maxCompletionTokens = parseInt(
        Deno.env.get("OPENAI_MAX_COMPLETION_TOKENS") ?? "4000",
        10,
    );

    // Optional per-class reasoning effort. Only forwarded when explicitly
    // configured (and valid), so non-reasoning models — which reject the
    // parameter — are unaffected unless the operator opts in.
    const validEfforts = new Set(["minimal", "low", "medium", "high"]);
    const reasoningEffortRaw = (
        modelClass === "advanced"
            ? Deno.env.get("OPENAI_REASONING_EFFORT_ADVANCED")
            : Deno.env.get("OPENAI_REASONING_EFFORT_STANDARD")
    )?.trim().toLowerCase();
    const reasoningEffort =
        reasoningEffortRaw && validEfforts.has(reasoningEffortRaw)
            ? reasoningEffortRaw
            : undefined;

    const openaiPayload: Record<string, unknown> = {
        model,
        messages: body.messages,
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: maxCompletionTokens,
    };
    if (reasoningEffort) openaiPayload.reasoning_effort = reasoningEffort;

    const upstream = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(openaiPayload),
    });

    if (!upstream.ok || !upstream.body) {
        const text = await upstream.text();
        return jsonError(upstream.status, `OpenAI error: ${text}`);
    }

    const [clientStream, serverStream] = upstream.body.tee();

    (async () => {
        const decoder = new TextDecoder();
        const reader = serverStream.getReader();
        let buffer = "";
        let promptTokens = 0;
        let completionTokens = 0;
        let sawUsage = false;

        try {
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
                        if (json.usage) {
                            promptTokens = json.usage.prompt_tokens ?? 0;
                            completionTokens = json.usage.completion_tokens ?? 0;
                            sawUsage = true;
                        }
                    } catch {
                        /* skip */
                    }
                }
            }
        } catch {
            /* aborted or upstream error — fall through to estimate */
        }

        if (!sawUsage) {
            promptTokens = estimateTokensFromMessages(body.messages);
            completionTokens = 0;
        }

        try {
            await admin.from("token_usage").insert({
                user_id: user.id,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                model,
                model_class: modelClass,
            });
        } catch (e) {
            console.error("token_usage insert failed", e);
        }
    })();

    return new Response(clientStream, {
        status: 200,
        headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
});
