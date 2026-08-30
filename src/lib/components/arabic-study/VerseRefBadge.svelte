<!-- A "﴾surah:ayah﴿" badge that jumps the main reader straight to that verse
     in MorphologyView (and closes the Arabic Study window so it's visible).
     The ornate brackets follow TakeHomeMessageDialog's `.ayah-ref` chip: drawn
     as pseudo-elements so the reference itself keeps the UI font. -->
<script lang="ts">
    import { t } from "$lib/i18n";
    import { goToVerse } from "$lib/utils/verse-nav";

    interface Props {
        verseRef: string;
        size?: "sm" | "md";
        /**
         * Lessons that carry their own surah/ayah picker point the chip at that
         * picker instead of at the reader: the verse loads in place, and the
         * "open in the parchment" button beside the player covers the jump.
         */
        onSelect?: (surah: number, ayah: number) => void;
    }
    let { verseRef, size = "md", onSelect }: Props = $props();

    function activate() {
        const [surah, ayah] = verseRef.split(":").map(Number);
        if (onSelect && surah && ayah) onSelect(surah, ayah);
        else goToVerse(verseRef);
    }
</script>

<button
    type="button"
    onclick={activate}
    title={onSelect
        ? $t("arabicStudy.explorer.show_verse", { ref: verseRef })
        : $t("arabicStudy.alphabet.go_to_verse", { ref: verseRef })}
    class="ayah-ref inline-flex cursor-pointer items-center gap-[2px] rounded-full leading-[1.55] border border-[#ecd9a6] bg-[#f7ebcf] font-semibold text-[#b07d28] transition-colors hover:border-[#dcc37e] hover:bg-[#f0dfb0] dark:border-[#5a5030] dark:bg-[#34302a] dark:text-[#e5c890] dark:hover:border-[#e5c890]/50 dark:hover:bg-[#3d3826] {size ===
    'sm'
        ? 'px-1.5 text-[0.625rem]'
        : 'px-2 text-[0.75rem]'}"
>
    {verseRef}
</button>

<style>
    /* The ornate brackets are Quranic punctuation (U+FD3E/U+FD3F), and only an
       Arabic font draws them as the mushaf-style flourish — so they have to
       name one rather than inherit the chip's Latin UI font (macOS falls back
       to Geeza Pro and looks right, Windows lands on Segoe UI Symbol and draws
       plain parentheses). "Scheherazade New" ships with the app (see app.css).
       Weight is pinned to 400 because the chip itself is 600 — the brackets
       want to stay delicate rather than pick up the bold face.

       The nudge: as flex items the brackets are centred by box, but
       Scheherazade's ascent (1.34em) far exceeds its descent (0.70em), so the
       baseline lands low in the line box and the flourish renders ~0.13em
       below its own centre. `top` lifts it back onto the digits' midline. */
    .ayah-ref::before,
    .ayah-ref::after {
        position: relative;
        top: -0.13em;
        font-family:
            "Scheherazade New", "Amiri", "Traditional Arabic",
            "Arabic Typesetting", "Geeza Pro", "Noto Naskh Arabic", serif;
        font-weight: 400;
        font-size: 1.05em;
        line-height: 1;
        opacity: 0.7;
    }
    .ayah-ref::before {
        content: "\FD3E";
    }
    .ayah-ref::after {
        content: "\FD3F";
    }
</style>
