// Supabase Edge Function: summarize-chat-title
// Takes the user's first prompt for a freshly-created chat and asks a cheap
// model (gpt-5-nano by default) to summarize it into a short title. Returns
// the plaintext title; the client encrypts and writes it back to the chats
// row (server cannot — titles are E2E encrypted with a user-derived key).
//
// Required secrets (Dashboard → Project Settings → Edge Functions → Secrets):
//   OPENAI_API_KEY                       — your OpenAI key
//   SB_SECRET_KEY                        — service-role secret (or fall back
//                                          to legacy SUPABASE_SERVICE_ROLE_KEY)
//   SUPABASE_URL                         — auto-injected
//   SUPABASE_ANON_KEY                    — auto-injected
//
// Optional (tunable from the Dashboard without redeploying):
//   OPENAI_MODEL_TITLE                   — model id for titling (default "gpt-5-nano")
//   OPENAI_TITLE_MAX_COMPLETION_TOKENS   — output cap (default 24)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
    chatId: string;
    firstUserPrompt: string;
}

function jsonError(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function cleanTitle(raw: string): string {
    let t = raw.replace(/\s+/g, " ").trim();
    // Strip wrapping quotes.
    t = t.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "");
    // Strip trailing punctuation.
    t = t.replace(/[.!?,;:]+$/g, "");
    if (t.length > 80) t = t.slice(0, 79) + "…";
    return t;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return jsonError(405, "Method not allowed");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError(401, "Missing Authorization header");

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
    if (!openaiKey) return jsonError(500, "OPENAI_API_KEY not configured");
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
    if (userError || !user) return jsonError(401, "Invalid or expired token");

    // No tier check: the AI chat is open to every signed-in account now, Free
    // included, and titling a chat the user is already allowed to have costs a
    // couple of dozen tokens on a nano model. The quota that matters is
    // enforced in chat-completion, which is what produced the chat in the
    // first place.

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return jsonError(400, "Invalid JSON body");
    }
    if (!body.chatId || typeof body.chatId !== "string") {
        return jsonError(400, "chatId is required");
    }
    if (
        !body.firstUserPrompt ||
        typeof body.firstUserPrompt !== "string" ||
        body.firstUserPrompt.trim().length === 0
    ) {
        return jsonError(400, "firstUserPrompt is required");
    }

    const model = Deno.env.get("OPENAI_MODEL_TITLE") ?? "gpt-5-nano";
    const maxCompletionTokens = parseInt(
        Deno.env.get("OPENAI_TITLE_MAX_COMPLETION_TOKENS") ?? "24",
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
            messages: [
                {
                    role: "system",
                    content:
                        "Summarize the user's message into a concise chat title of at most 6 words. No quotes, no trailing punctuation, no emojis. Reply with the title only.",
                },
                { role: "user", content: body.firstUserPrompt.slice(0, 4000) },
            ],
            stream: false,
            max_completion_tokens: maxCompletionTokens,
        }),
    });

    if (!upstream.ok) {
        const text = await upstream.text();
        return jsonError(upstream.status, `OpenAI error: ${text}`);
    }

    const json = await upstream.json();
    const raw = json?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || raw.trim().length === 0) {
        return jsonError(502, "Empty title from model");
    }
    const title = cleanTitle(raw);

    const promptTokens = json?.usage?.prompt_tokens ?? 0;
    const completionTokens = json?.usage?.completion_tokens ?? 0;
    try {
        await admin.from("token_usage").insert({
            user_id: user.id,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            model,
            model_class: "standard",
        });
    } catch (e) {
        console.error("token_usage insert failed", e);
    }

    return new Response(JSON.stringify({ title }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
});
