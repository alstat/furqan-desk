/** Splits an Arabic word into segments so the occurrence(s) of one target
 * letter — together with whatever vowel/tashkeel mark rides on it — can be
 * rendered in a different color from the rest of the word. Matching is by
 * base codepoint, so it's blind to position (the browser's own shaping
 * already draws the correct isolated/initial/medial/final glyph). */

export interface HighlightSegment {
    text: string;
    hi: boolean;
}

/** Hamza-on-alif variants all count as "Alif" for highlighting — the
 * beginner curriculum's own Alif examples (aḥad, āyah, ab, umm, ...)
 * deliberately use these forms. */
const ALIF_VARIANTS = new Set(["ا", "أ", "إ", "آ", "ٱ"]);

/** Combining tashkeel marks (fatḥah, kasrah, ḍammah, sukūn, shaddah, tanwīn,
 * dagger alif) that attach to the letter before them. Written as explicit
 * \u escapes, not raw combining marks, so the range is unambiguous. */
const TASHKEEL = /[\u064B-\u065F\u0670]/;

function matchSet(letterGlyph: string): Set<string> {
    return letterGlyph === "ا" ? ALIF_VARIANTS : new Set([letterGlyph]);
}

export function highlightLetter(word: string, letterGlyph: string): HighlightSegment[] {
    const targets = matchSet(letterGlyph);
    const segments: HighlightSegment[] = [];
    let i = 0;
    while (i < word.length) {
        if (targets.has(word[i])) {
            let j = i + 1;
            while (j < word.length && TASHKEEL.test(word[j])) j++;
            segments.push({ text: word.slice(i, j), hi: true });
            i = j;
        } else {
            let j = i + 1;
            while (j < word.length && !targets.has(word[j])) j++;
            segments.push({ text: word.slice(i, j), hi: false });
            i = j;
        }
    }
    return segments;
}

/** Highlights a combining mark that has no base-letter identity of its own —
 * the dagger alif (ٰ), for instance — together with the base letter it
 * rides on, so e.g. the "هَٰ" in "هَٰذَا" lights up as one unit rather than
 * just the invisible-at-a-glance mark alone. Only the mark's first
 * occurrence is highlighted (every example this is used for has exactly
 * one). */
export function highlightMark(word: string, mark: string): HighlightSegment[] {
    const idx = word.indexOf(mark);
    if (idx === -1) return [{ text: word, hi: false }];
    let start = idx;
    while (start > 0 && TASHKEEL.test(word[start - 1])) start--;
    if (start > 0) start--; // include the base letter the mark (and any tashkeel) rides on
    const end = idx + mark.length;
    return [
        { text: word.slice(0, start), hi: false },
        { text: word.slice(start, end), hi: true },
        { text: word.slice(end), hi: false },
    ].filter((s) => s.text.length > 0);
}
