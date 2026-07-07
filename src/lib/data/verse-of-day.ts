// "Verse of the Day" selection.
//
// A verse is picked at random from across the whole Qur'an, but the pick is
// *seeded by the calendar day* so it stays stable for the entire day (and is
// the same for every user on a given date) rather than changing on every app
// open. Verses that are only the disjoined letters (muqattaʿāt) — e.g. Alif
// Lām Mīm at 2:1 — are excluded, since on their own they carry no translatable
// message to surface as a daily verse.

export interface VerseRef {
    surah: number;
    ayah: number;
}

// Canonical ayah counts per surah (Hafs), indexed by surah number (1-based;
// index 0 is a placeholder). Total = 6236.
export const SURAH_AYAH_COUNTS: number[] = [
    0, 7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99,
    128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30,
    73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
    60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
    44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26,
    30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
    5, 4, 5, 6,
];

// Verses consisting solely of disjoined letters (muqattaʿāt). These are the
// opening ayah of 29 surahs; surah 42 (Ash-Shūrā) has them across ayah 1 and 2.
export const MUQATTAAT_VERSES: readonly string[] = [
    "2:1", "3:1", "7:1", "10:1", "11:1", "12:1", "13:1", "14:1", "15:1",
    "19:1", "20:1", "26:1", "27:1", "28:1", "29:1", "30:1", "31:1", "32:1",
    "36:1", "38:1", "40:1", "41:1", "42:1", "42:2", "43:1", "44:1", "45:1",
    "46:1", "50:1", "68:1",
];

const MUQATTAAT_SET = new Set(MUQATTAAT_VERSES);

// Flat list of every eligible verse, built once. Muqattaʿāt are filtered out.
const ELIGIBLE_VERSES: VerseRef[] = (() => {
    const list: VerseRef[] = [];
    for (let surah = 1; surah < SURAH_AYAH_COUNTS.length; surah++) {
        const count = SURAH_AYAH_COUNTS[surah];
        for (let ayah = 1; ayah <= count; ayah++) {
            if (MUQATTAAT_SET.has(`${surah}:${ayah}`)) continue;
            list.push({ surah, ayah });
        }
    }
    return list;
})();

/** Deterministic PRNG (mulberry32) so a day's seed always yields the same pick. */
function mulberry32(seed: number): number {
    let s = seed | 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Randomly pick a verse, seeded by the local calendar day so the same verse is
 * shown all day and everyone sees the same one on a given date. Muqattaʿāt are
 * never selected.
 */
export function verseOfDayFor(date: Date = new Date()): VerseRef {
    // Days since the Unix epoch in the user's local timezone.
    const dayNumber = Math.floor(
        (date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000,
    );
    const idx = Math.floor(mulberry32(dayNumber) * ELIGIBLE_VERSES.length);
    return ELIGIBLE_VERSES[idx];
}

/** localStorage key holding the YYYY-MM-DD on which the dialog last auto-opened. */
export const VERSE_OF_DAY_SEEN_KEY = "verseOfDayLastShown";

/** Local calendar date as YYYY-MM-DD, used to show the dialog once per day. */
export function localDateKey(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
