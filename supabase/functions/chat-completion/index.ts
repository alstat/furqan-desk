// Supabase Edge Function: chat-completion
// Verifies the caller's JWT, requires app_metadata.is_pro === true, picks a
// model class (standard vs. advanced) from the request, enforces the
// corresponding daily/weekly/monthly token quota, then proxies to OpenAI Chat
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
//   OPENAI_MAX_COMPLETION_TOKENS — hard ceiling on output tokens per response.
//                                 Defaults to 4000. Bounds worst-case output cost
//                                 per request and prevents runaway essays. Set
//                                 lower for tighter margins, higher for longer
//                                 free-form generations.
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

async function getUsageSince(
    admin: ReturnType<typeof createClient>,
    userId: string,
    seconds: number,
    modelClass: ModelClass,
): Promise<number> {
    const since = new Date(Date.now() - seconds * 1000).toISOString();
    const { data, error } = await admin
        .from("token_usage")
        .select("total_tokens")
        .eq("user_id", userId)
        .eq("model_class", modelClass)
        .gte("created_at", since);
    if (error) throw new Error(`usage query failed: ${error.message}`);
    return (data ?? []).reduce(
        (s: number, r: { total_tokens: number }) => s + (r.total_tokens ?? 0),
        0,
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

    // Resolve the model id. Backwards compatible with legacy OPENAI_MODEL.
    const standardModel =
        Deno.env.get("OPENAI_MODEL_STANDARD") ??
        Deno.env.get("OPENAI_MODEL") ??
        "gpt-4o-mini";
    const advancedModel =
        Deno.env.get("OPENAI_MODEL_ADVANCED") ?? standardModel;
    const model = modelClass === "advanced" ? advancedModel : standardModel;

    // Quota check — separate columns per model class.
    const { data: limitsRow, error: limitsErr } = await admin
        .from("tier_limits")
        .select(
            "daily_tokens, weekly_tokens, monthly_tokens, advanced_daily_tokens, advanced_weekly_tokens, advanced_monthly_tokens",
        )
        .eq("tier", tier)
        .maybeSingle();
    if (limitsErr) {
        return jsonError(500, `tier_limits query failed: ${limitsErr.message}`);
    }
    if (!limitsRow) {
        return jsonError(500, `No tier_limits row for tier="${tier}"`);
    }

    const dailyCap =
        modelClass === "advanced"
            ? limitsRow.advanced_daily_tokens
            : limitsRow.daily_tokens;
    const weeklyCap =
        modelClass === "advanced"
            ? limitsRow.advanced_weekly_tokens
            : limitsRow.weekly_tokens;
    const monthlyCap =
        modelClass === "advanced"
            ? limitsRow.advanced_monthly_tokens
            : limitsRow.monthly_tokens;

    try {
        const [daily, weekly, monthly] = await Promise.all([
            getUsageSince(admin, user.id, 24 * 3600, modelClass),
            getUsageSince(admin, user.id, 7 * 24 * 3600, modelClass),
            getUsageSince(admin, user.id, 30 * 24 * 3600, modelClass),
        ]);
        if (daily >= dailyCap) {
            return jsonError(429, "Daily token limit reached", {
                scope: "daily",
                model_class: modelClass,
                retry_after_seconds: 24 * 3600,
            });
        }
        if (weekly >= weeklyCap) {
            return jsonError(429, "Weekly token limit reached", {
                scope: "weekly",
                model_class: modelClass,
                retry_after_seconds: 7 * 24 * 3600,
            });
        }
        if (monthly >= monthlyCap) {
            return jsonError(429, "Monthly token limit reached", {
                scope: "monthly",
                model_class: modelClass,
                retry_after_seconds: 30 * 24 * 3600,
            });
        }
    } catch (e) {
        return jsonError(500, e instanceof Error ? e.message : String(e));
    }

    const maxCompletionTokens = parseInt(
        Deno.env.get("OPENAI_MAX_COMPLETION_TOKENS") ?? "4000",
        10,
    );

    const upstream = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages: body.messages,
            stream: true,
            stream_options: { include_usage: true },
            max_completion_tokens: maxCompletionTokens,
        }),
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
