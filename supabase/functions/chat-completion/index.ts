// Supabase Edge Function: chat-completion
// Verifies the caller's JWT, requires app_metadata.is_pro === true,
// then proxies to OpenAI Chat Completions and streams the response back.
//
// Required secrets (set in Supabase Dashboard → Project Settings → Edge Functions → Secrets):
//   OPENAI_API_KEY        — your OpenAI key
//   OPENAI_MODEL          — model id (e.g. "gpt-4o-mini", "gpt-4o", "gpt-4.1"). Optional; defaults to "gpt-4o-mini".
//                           Update this in the dashboard to change the model app-wide without a redeploy.
//   SUPABASE_URL          — auto-injected
//   SUPABASE_ANON_KEY     — auto-injected
//
// Deploy via Supabase Dashboard → Edge Functions → Create new function → name "chat-completion"
// → paste this file → keep "Verify JWT" enabled → Deploy.

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
}

function jsonError(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
        return jsonError(500, "Supabase env not configured");
    }
    if (!openaiKey) {
        return jsonError(500, "OPENAI_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
    });

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        return jsonError(401, "Invalid or expired token");
    }

    const isPro = user.app_metadata?.is_pro === true;
    if (!isPro) {
        return jsonError(403, "AI Chat is a Pro feature");
    }

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return jsonError(400, "Invalid JSON body");
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return jsonError(400, "messages must be a non-empty array");
    }

    const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

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
        }),
    });

    if (!upstream.ok || !upstream.body) {
        const text = await upstream.text();
        return jsonError(upstream.status, `OpenAI error: ${text}`);
    }

    return new Response(upstream.body, {
        status: 200,
        headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
});
