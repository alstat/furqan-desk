import { writable, get } from "svelte/store";
import { browser } from "$app/environment";
import { supabase } from "$lib/supabase";
import {
    deriveKey,
    encrypt,
    decrypt,
    generateSalt,
    exportKeyRaw,
    importKeyRaw,
    VERIFIER_PLAINTEXT,
} from "$lib/utils/chat-crypto";

export type KeyState =
    | "loading"
    | "needs_setup"
    | "locked"
    | "unlocked"
    | "error";

export const cryptoKey = writable<CryptoKey | null>(null);
export const keyState = writable<KeyState>("loading");
export const keyError = writable<string>("");

const SS_KEY = "ayahlab.chat.key";
const SS_SALT = "ayahlab.chat.salt";

let activeSalt: string | null = null;

export function getSalt(): string | null {
    return activeSalt;
}

/**
 * Where the unlocked key is cached between windows.
 *
 * Inside Tauri it lives in the Rust process (see ChatKeyState in commands.rs):
 * one copy, shared by every window, discarded when the app quits. That is what
 * the passphrase prompt implies — unlock once per launch — and it is the only
 * store with those two properties at once.
 *
 * `sessionStorage` cannot do it: it is scoped to a single webview, and the AI
 * chat opens in an OS window of its own, so the chat window started empty and
 * re-prompted every time it was opened. `localStorage` is shared but survives
 * quitting, which would leave an end-to-end encryption key sitting on disk.
 *
 * Outside Tauri (browser dev, where there is only ever one window)
 * sessionStorage is still the right answer and is used as the fallback.
 */
interface CachedKey {
    key: string;
    salt: string;
}

async function tauriInvoke<T>(
    cmd: string,
    args: Record<string, unknown>,
): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
}

async function vaultRead(userId: string): Promise<CachedKey | null> {
    if (!browser) return null;
    try {
        const cached = await tauriInvoke<CachedKey | null>("get_chat_key", {
            userId,
        });
        return cached ?? null;
    } catch {
        // Not running under Tauri — fall back to this webview's own storage.
        const key = sessionStorage.getItem(SS_KEY);
        const salt = sessionStorage.getItem(SS_SALT);
        return key && salt ? { key, salt } : null;
    }
}

async function vaultWrite(
    userId: string,
    key: string,
    salt: string,
): Promise<void> {
    if (!browser) return;
    try {
        await tauriInvoke("set_chat_key", { key, salt, userId });
    } catch {
        sessionStorage.setItem(SS_KEY, key);
        sessionStorage.setItem(SS_SALT, salt);
    }
}

async function vaultClear(): Promise<void> {
    if (!browser) return;
    try {
        await tauriInvoke("clear_chat_key", {});
    } catch {
        /* fall through to the sessionStorage clear below */
    }
    sessionStorage.removeItem(SS_KEY);
    sessionStorage.removeItem(SS_SALT);
}

export async function loadKeyState(): Promise<void> {
    keyState.set("loading");
    keyError.set("");

    if (!browser) {
        keyState.set("locked");
        return;
    }

    // The user id comes first now: the cache is shared across windows, so it
    // has to be checked against whoever is actually signed in here.
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
        keyState.set("error");
        keyError.set("Not signed in");
        return;
    }

    const cached = await vaultRead(userId);
    if (cached) {
        try {
            const key = await importKeyRaw(cached.key);
            cryptoKey.set(key);
            activeSalt = cached.salt;
            keyState.set("unlocked");
            return;
        } catch {
            await vaultClear();
        }
    }

    const { data, error } = await supabase
        .from("user_keys")
        .select("salt, verifier_ciphertext, verifier_iv")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        keyState.set("error");
        keyError.set(error.message);
        return;
    }

    if (!data) {
        keyState.set("needs_setup");
        return;
    }

    activeSalt = data.salt;
    keyState.set("locked");
}

export async function setupPassphrase(passphrase: string): Promise<void> {
    keyError.set("");
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
        keyError.set("Not signed in");
        return;
    }

    const salt = generateSalt();
    const key = await deriveKey(passphrase, salt);
    const verifier = await encrypt(key, VERIFIER_PLAINTEXT);

    const { error } = await supabase.from("user_keys").insert({
        user_id: userId,
        salt,
        verifier_ciphertext: verifier.ciphertext,
        verifier_iv: verifier.iv,
    });
    if (error) {
        keyError.set(error.message);
        return;
    }

    await cacheKey(key, salt, userId);
    activeSalt = salt;
    cryptoKey.set(key);
    keyState.set("unlocked");
}

export async function unlock(passphrase: string): Promise<boolean> {
    keyError.set("");
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
        keyError.set("Not signed in");
        return false;
    }

    const { data, error } = await supabase
        .from("user_keys")
        .select("salt, verifier_ciphertext, verifier_iv")
        .eq("user_id", userId)
        .maybeSingle();

    if (error || !data) {
        keyError.set(error?.message ?? "No key found");
        return false;
    }

    const key = await deriveKey(passphrase, data.salt);
    try {
        const ok = await decrypt(
            key,
            data.verifier_ciphertext,
            data.verifier_iv,
        );
        if (ok !== VERIFIER_PLAINTEXT) throw new Error("verifier mismatch");
    } catch {
        return false;
    }

    await cacheKey(key, data.salt, userId);
    activeSalt = data.salt;
    cryptoKey.set(key);
    keyState.set("unlocked");
    return true;
}

export async function lock(): Promise<void> {
    await vaultClear();
    cryptoKey.set(null);
    activeSalt = null;
    keyState.set("locked");
}

export async function resetKeyAndChats(): Promise<void> {
    keyError.set("");
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    // Cascade-deletes chat_messages via FK; user_keys deleted manually.
    await supabase.from("chats").delete().eq("user_id", userId);
    await supabase.from("user_keys").delete().eq("user_id", userId);

    await lock();
    keyState.set("needs_setup");
}

async function cacheKey(
    key: CryptoKey,
    salt: string,
    userId: string,
): Promise<void> {
    if (!browser) return;
    await vaultWrite(userId, await exportKeyRaw(key), salt);
}

export function ensureUnlocked(): CryptoKey {
    const k = get(cryptoKey);
    if (!k) throw new Error("Encryption key locked");
    return k;
}
