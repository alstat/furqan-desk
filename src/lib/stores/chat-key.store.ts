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

export async function loadKeyState(): Promise<void> {
    keyState.set("loading");
    keyError.set("");

    if (!browser) {
        keyState.set("locked");
        return;
    }

    const cached = sessionStorage.getItem(SS_KEY);
    const cachedSalt = sessionStorage.getItem(SS_SALT);
    if (cached && cachedSalt) {
        try {
            const key = await importKeyRaw(cached);
            cryptoKey.set(key);
            activeSalt = cachedSalt;
            keyState.set("unlocked");
            return;
        } catch {
            sessionStorage.removeItem(SS_KEY);
            sessionStorage.removeItem(SS_SALT);
        }
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
        keyState.set("error");
        keyError.set("Not signed in");
        return;
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

    await cacheKey(key, salt);
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

    await cacheKey(key, data.salt);
    activeSalt = data.salt;
    cryptoKey.set(key);
    keyState.set("unlocked");
    return true;
}

export async function lock(): Promise<void> {
    if (browser) {
        sessionStorage.removeItem(SS_KEY);
        sessionStorage.removeItem(SS_SALT);
    }
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

async function cacheKey(key: CryptoKey, salt: string): Promise<void> {
    if (!browser) return;
    const raw = await exportKeyRaw(key);
    sessionStorage.setItem(SS_KEY, raw);
    sessionStorage.setItem(SS_SALT, salt);
}

export function ensureUnlocked(): CryptoKey {
    const k = get(cryptoKey);
    if (!k) throw new Error("Encryption key locked");
    return k;
}
