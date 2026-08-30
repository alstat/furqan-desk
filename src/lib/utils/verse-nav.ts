/** Jump the main reader to a specific "surah:ayah" reference — the same
 * store pair every other "view this verse" action in the app uses
 * (QuranBlock's morphology link, the bookmark dialog, verse-of-day, ...).
 * Also closes the Arabic Study window so the reader underneath is visible. */

import { selectedSurahIdx } from "$lib/stores/quran.svelte";
import { pendingJumpAyah } from "$lib/stores/bookmarks.store";
import { onboardingOpen } from "$lib/stores/arabic-study.store";

export function goToVerse(ref: string): void {
    const [surah, ayah] = ref.split(":").map(Number);
    if (!surah || !ayah) return;
    onboardingOpen.set(false);
    selectedSurahIdx.set(surah);
    pendingJumpAyah.set(ayah);
}
