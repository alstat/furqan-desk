// AES-GCM 256 + PBKDF2-SHA256 (250K iterations) using WebCrypto.
// Used to encrypt chat content client-side before storing in Supabase so the
// platform owner cannot read user data.

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 32;
const IV_BYTES = 12;
const KEY_BITS = 256;
export const VERIFIER_PLAINTEXT = "AYAHLAB-CHAT-V1";

export interface CipherEnvelope {
    ciphertext: string; // base64
    iv: string; // base64
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

// Copy a Uint8Array into a fresh ArrayBuffer. WebCrypto types require
// BufferSource backed by ArrayBuffer (not SharedArrayBuffer); copying
// guarantees that and satisfies TypeScript's strict view typing.
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
    const buf = new ArrayBuffer(u8.byteLength);
    new Uint8Array(buf).set(u8);
    return buf;
}

function strToBuffer(s: string): ArrayBuffer {
    return toArrayBuffer(enc.encode(s));
}

export function generateSalt(): string {
    const salt = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(salt);
    return bytesToB64(salt);
}

export async function deriveKey(
    passphrase: string,
    saltB64: string,
): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
        "raw",
        strToBuffer(passphrase),
        { name: "PBKDF2" },
        false,
        ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: toArrayBuffer(b64ToBytes(saltB64)),
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: KEY_BITS },
        true,
        ["encrypt", "decrypt"],
    );
}

export async function encrypt(
    key: CryptoKey,
    plaintext: string,
): Promise<CipherEnvelope> {
    const iv = new Uint8Array(IV_BYTES);
    crypto.getRandomValues(iv);
    const buf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: toArrayBuffer(iv) },
        key,
        strToBuffer(plaintext),
    );
    return {
        ciphertext: bytesToB64(new Uint8Array(buf)),
        iv: bytesToB64(iv),
    };
}

export async function decrypt(
    key: CryptoKey,
    ciphertextB64: string,
    ivB64: string,
): Promise<string> {
    const buf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(b64ToBytes(ivB64)) },
        key,
        toArrayBuffer(b64ToBytes(ciphertextB64)),
    );
    return dec.decode(buf);
}

export async function exportKeyRaw(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey("raw", key);
    return bytesToB64(new Uint8Array(raw));
}

export async function importKeyRaw(rawB64: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        toArrayBuffer(b64ToBytes(rawB64)),
        { name: "AES-GCM", length: KEY_BITS },
        true,
        ["encrypt", "decrypt"],
    );
}
