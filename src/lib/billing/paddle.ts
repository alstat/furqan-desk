import type { User } from "@supabase/supabase-js";
import { supabase } from "$lib/supabase";

interface PaddleCheckoutItem {
    priceId: string;
    quantity: number;
}

interface PaddleCheckoutOptions {
    items: PaddleCheckoutItem[];
    customer?: { email?: string };
    customData?: Record<string, string | number | boolean | null>;
}

interface PaddleEvent {
    name: string;
    data?: unknown;
}

interface PaddleSDK {
    Environment: { set: (env: "sandbox" | "production") => void };
    Initialize: (opts: { token: string; eventCallback?: (e: PaddleEvent) => void }) => void;
    Checkout: { open: (opts: PaddleCheckoutOptions) => void };
}

declare global {
    interface Window {
        Paddle?: PaddleSDK;
    }
}

const CDN_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

let readyPromise: Promise<PaddleSDK> | null = null;

function loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${CDN_URL}"]`)) {
            if (window.Paddle) resolve();
            else {
                const existing = document.querySelector(`script[src="${CDN_URL}"]`)!;
                existing.addEventListener("load", () => resolve(), { once: true });
                existing.addEventListener("error", () => reject(new Error("paddle.js failed to load")), { once: true });
            }
            return;
        }
        const s = document.createElement("script");
        s.src = CDN_URL;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("paddle.js failed to load"));
        document.head.appendChild(s);
    });
}

function paddleReady(): Promise<PaddleSDK> {
    if (readyPromise) return readyPromise;

    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
    const env = (import.meta.env.VITE_PADDLE_ENVIRONMENT as "sandbox" | "production" | undefined) ?? "sandbox";
    if (!token) {
        return Promise.reject(new Error("VITE_PADDLE_CLIENT_TOKEN is not set"));
    }

    readyPromise = loadScript().then(() => {
        const Paddle = window.Paddle;
        if (!Paddle) throw new Error("Paddle SDK missing after script load");
        Paddle.Environment.set(env);
        Paddle.Initialize({
            token,
            eventCallback: (e) => {
                if (e.name === "checkout.completed") {
                    // Webhook will have updated app_metadata.is_pro server-side.
                    // Refresh the JWT so the client picks up the new claim.
                    void supabase.auth.refreshSession();
                }
            },
        });
        return Paddle;
    });

    return readyPromise;
}

export async function openProCheckout(user: User): Promise<void> {
    const priceId = import.meta.env.VITE_PADDLE_PRO_PRICE_ID as string | undefined;
    if (!priceId) throw new Error("VITE_PADDLE_PRO_PRICE_ID is not set");
    if (!user.email) throw new Error("Cannot start checkout: user email missing");

    const Paddle = await paddleReady();
    Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: { email: user.email },
        customData: { user_id: user.id },
    });
}
