// Paddle Billing webhook receiver.
//
// Deploy: supabase functions deploy paddle-webhook --no-verify-jwt
// Secrets: supabase secrets set PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxx
//
// Configure in Paddle: Developer Tools → Notifications → add destination at
// https://<project-ref>.functions.supabase.co/paddle-webhook
// Events: subscription.activated, subscription.updated, subscription.canceled,
//         transaction.completed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";

const PADDLE_WEBHOOK_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

function timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
    if (!header || !PADDLE_WEBHOOK_SECRET) return false;
    const parts = Object.fromEntries(
        header.split(";").map((p) => {
            const [k, v] = p.split("=");
            return [k?.trim(), v?.trim()];
        }),
    ) as Record<string, string>;
    const ts = parts["ts"];
    const h1 = parts["h1"];
    if (!ts || !h1) return false;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(PADDLE_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}:${rawBody}`));
    const computed = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return timingSafeEqualHex(computed, h1);
}

interface PaddleSubscriptionData {
    id: string;
    status: string;
    customer_id: string;
    items?: { price?: { id?: string } }[];
    current_billing_period?: { ends_at?: string };
    scheduled_change?: { action?: string } | null;
    custom_data?: { user_id?: string } | null;
}

async function handleSubscription(eventType: string, data: PaddleSubscriptionData) {
    const userId = data.custom_data?.user_id;
    if (!userId) {
        console.warn(`[paddle-webhook] ${eventType} missing custom_data.user_id`, data.id);
        return;
    }

    const status = eventType === "subscription.canceled" ? "canceled" : data.status;
    const priceId = data.items?.[0]?.price?.id ?? "";
    const periodEnd = data.current_billing_period?.ends_at ?? null;
    const cancelAtPeriodEnd = data.scheduled_change?.action === "cancel";

    const { error: upsertErr } = await admin.from("subscriptions").upsert(
        {
            user_id: userId,
            paddle_customer_id: data.customer_id,
            paddle_subscription_id: data.id,
            paddle_price_id: priceId,
            status,
            current_period_end: periodEnd,
            cancel_at_period_end: cancelAtPeriodEnd,
        },
        { onConflict: "user_id" },
    );
    if (upsertErr) {
        console.error("[paddle-webhook] upsert failed", upsertErr);
        throw upsertErr;
    }

    const isPro = status === "active" || status === "trialing";
    const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { is_pro: isPro },
    });
    if (metaErr) {
        console.error("[paddle-webhook] app_metadata update failed", metaErr);
        throw metaErr;
    }
}

Deno.serve(async (req) => {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

    const rawBody = await req.text();
    const ok = await verifySignature(rawBody, req.headers.get("Paddle-Signature"));
    if (!ok) return new Response("invalid signature", { status: 400 });

    let event: { event_type?: string; data?: PaddleSubscriptionData };
    try {
        event = JSON.parse(rawBody);
    } catch {
        return new Response("invalid json", { status: 400 });
    }

    const type = event.event_type ?? "";
    const data = event.data;
    if (!data) return new Response("missing data", { status: 400 });

    try {
        if (
            type === "subscription.activated" ||
            type === "subscription.updated" ||
            type === "subscription.canceled"
        ) {
            await handleSubscription(type, data);
        }
        // transaction.completed is acknowledged but not acted on — subscription.* covers entitlement.
    } catch (e) {
        console.error("[paddle-webhook] handler error", e);
        return new Response("handler error", { status: 500 });
    }

    return new Response("ok", { status: 200 });
});
