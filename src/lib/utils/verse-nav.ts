/** Jump the main reader to a specific "surah:ayah" reference — the same
 * store pair every other "view this verse" action in the app uses
 * (QuranBlock's morphology link, the bookmark dialog, verse-of-day, ...).
 * Also closes the Arabic Study window so the reader underneath is visible. */

import { selectedSurahIdx } from "$lib/stores/quran.svelte";
import { pendingJumpAyah } from "$lib/stores/bookmarks.store";
import { onboardingOpen } from "$lib/stores/arabic-study.store";

/** Asks whichever window holds the parchment to jump. Payload is the ref. */
const VERSE_JUMP_EVENT = "go-to-verse";
const READER_WINDOW = "main";

function applyJump(surah: number, ayah: number): void {
    selectedSurahIdx.set(surah);
    pendingJumpAyah.set(ayah);
}

/**
 * Arabic Study (and the manuscript viewer, and every other satellite) runs in
 * a window of its own with a fresh JS context, so the reader's stores live in
 * a different heap entirely — setting them here moves nothing. Ask the reader
 * window to do the jump instead, and raise it so the result is visible.
 */
async function requestJumpInReader(surah: number, ayah: number): Promise<void> {
    try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (getCurrentWindow().label === READER_WINDOW) return;

        const { emit } = await import("@tauri-apps/api/event");
        await emit(VERSE_JUMP_EVENT, { surah, ayah });

        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const reader = await WebviewWindow.getByLabel(READER_WINDOW);
        await reader?.unminimize();
        await reader?.setFocus();
    } catch {
        // Outside Tauri (browser dev) there is only this one context, which the
        // store writes above have already handled.
    }
}

export function goToVerse(ref: string): void {
    const [surah, ayah] = ref.split(":").map(Number);
    if (!surah || !ayah) return;
    onboardingOpen.set(false);
    applyJump(surah, ayah);
    void requestJumpInReader(surah, ayah);
}

/**
 * Listen for jump requests coming from satellite windows. Call once from the
 * window that owns the parchment, alongside the other `install*Host` calls.
 */
export async function installVerseJumpHost(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
        const { listen } = await import("@tauri-apps/api/event");
        await listen<{ surah: number; ayah: number }>(VERSE_JUMP_EVENT, (event) => {
            applyJump(event.payload.surah, event.payload.ayah);
        });
    } catch {
        // Not running inside Tauri — nothing to listen to.
    }
}
