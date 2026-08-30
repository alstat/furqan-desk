// Supabase Edge Function: chat-completion
// Verifies the caller's JWT, requires app_metadata.is_pro === true, picks a
// model class (standard vs. advanced) from the request, enforces the
// corresponding weekly token quota (with a monthly backstop), then proxies to
// OpenAI Chat
// Completions and streams the response back. Records token usage on completion
// (or estimates on abort) using the service role.
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

// The two rolling quota windows, in seconds. These must match the windows the
// token_usage_windows_for RPC aggregates over.
const SEC_WEEK = 7 * 24 * 3600;
const SEC_MONTH = 30 * 24 * 3600;

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
    // Which AI surface fired this request (e.g. "ai_chat",
    // "selection_toolbar", "take_home_message", "tafsir_dialog",
    // "morphology_viewer", "word_morphology_popup", "manuscript_ai_prompt",
    // "editor_quran_block_prompt"). Free-form — not validated against a
    // fixed list here, since the client is the source of truth for what
    // surfaces exist (see AI_FEATURE_TAGS in ai-chat.store.ts). Recorded to
    // token_usage.feature purely for admin-side reporting; never affects
    // quota, pricing, or the OpenAI call itself.
    feature?: string;
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
 * Both rolling windows for one user and model class, summed in Postgres.
 *
 * This used to be two queries that each pulled every matching token_usage row
 * and added them up here — a read that grew with the account's history, on the
 * path of every message. The RPC returns four small rows instead; we keep the
 * pair for the class being charged.
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
): Promise<{ weekly: WindowUsage; monthly: WindowUsage }> {
    const { data, error } = await admin.rpc("token_usage_windows_for", {
        p_user_id: userId,
    });
    if (error) throw new Error(`usage query failed: ${error.message}`);

    const empty = (): WindowUsage => ({ used: 0, oldestMs: null });
    const windows = { weekly: empty(), monthly: empty() };
    for (const row of (data ?? []) as UsageWindowRow[]) {
        if (row.pool !== modelClass) continue;
        const key =
            row.window_seconds === SEC_WEEK
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

    const isPro = user.app_metadata?.is_pro === true;
    if (!isPro) {
        return jsonError(403, "AI Chat is a Pro feature");
    }

    const tier = (user.app_metadata?.tier as string | undefined) ?? "pro";

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return jsonError(400, "Invalid JSON body");
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return jsonError(400, "messages must be a non-empty array");
    }

    const modelClass: ModelClass = body.advanced === true ? "advanced" : "standard";
    const feature =
        typeof body.feature === "string" && body.feature.trim()
            ? body.feature.trim().slice(0, 64)
            : "unknown";

    // Resolve the model id. Backwards compatible with legacy OPENAI_MODEL.
    const standardModel =
        Deno.env.get("OPENAI_MODEL_STANDARD") ??
        Deno.env.get("OPENAI_MODEL") ??
        "gpt-4o-mini";
    const advancedModel =
        Deno.env.get("OPENAI_MODEL_ADVANCED") ?? standardModel;

    // Pro+ uses its own models (a different model, not more usage). Each falls
    // back to the corresponding Pro model when its secret isn't set, so Pro+
    // never breaks if only one of the two is configured.
    const isProPlus = tier === "pro_plus";
    const standardModelProPlus =
        Deno.env.get("OPENAI_MODEL_STANDARD_PROPLUS") ?? standardModel;
    const advancedModelProPlus =
        Deno.env.get("OPENAI_MODEL_ADVANCED_PROPLUS") ?? advancedModel;

    const model =
        modelClass === "advanced"
            ? isProPlus
                ? advancedModelProPlus
                : advancedModel
            : isProPlus
              ? standardModelProPlus
              : standardModel;

    // Quota check — separate columns per model class.
    const { data: limitsRow, error: limitsErr } = await admin
        .from("tier_limits")
        .select(
            "weekly_tokens, monthly_tokens, advanced_weekly_tokens, advanced_monthly_tokens",
        )
        .eq("tier", tier)
        .maybeSingle();
    if (limitsErr) {
        return jsonError(500, `tier_limits query failed: ${limitsErr.message}`);
    }
    if (!limitsRow) {
        return jsonError(500, `No tier_limits row for tier="${tier}"`);
    }

    // The weekly window is the quota users actually budget against: a rolling
    // 7 days, so a heavy session borrows from the days around it instead of
    // locking the feature out until midnight. Monthly stays purely as a cost
    // backstop and is not surfaced as a limit users are asked to manage.
    const weeklyCap =
        modelClass === "advanced"
            ? limitsRow.advanced_weekly_tokens
            : limitsRow.weekly_tokens;
    const monthlyCap =
        modelClass === "advanced"
            ? limitsRow.advanced_monthly_tokens
            : limitsRow.monthly_tokens;

    try {
        const { weekly, monthly } = await getUsageWindows(
            admin,
            user.id,
            modelClass,
        );
        if (weekly.used >= weeklyCap) {
            return jsonError(429, "Weekly token limit reached", {
                scope: "weekly",
                model_class: modelClass,
                retry_after_seconds: secondsUntilFree(weekly, SEC_WEEK),
            });
        }
        if (monthly.used >= monthlyCap) {
            return jsonError(429, "Monthly token limit reached", {
                scope: "monthly",
                model_class: modelClass,
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
                feature,
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
