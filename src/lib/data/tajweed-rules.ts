/** An introduction to tajwīd (تجويد) — the rules governing how the Qur'an is
 * recited correctly — closing out the Beginner curriculum. This covers the
 * handful of rules a true beginner meets constantly: qalqalah, and the four
 * ways a sākin nūn (نْ) or tanwīn behaves depending on what follows it.
 * There is much more to tajwīd than this (meem-sākinah rules, the letter
 * rā's two pronunciations, the different lengths of madd...) — this is a
 * first, correct foothold, not the whole subject.
 *
 * Every (word, ref) pair was checked against this app's own local Qur'an
 * text (`quran_static.db`) the same way as the rest of this curriculum. */

import type { AlifFormExample } from "./alif-forms";

export interface TajweedRule {
    id: string;
    term: string;
    termTranslit: string;
    label: string;
    description: string;
    examples: AlifFormExample[];
}

export const TAJWEED_RULES: TajweedRule[] = [
    {
        id: "qalqalah",
        term: "القَلْقَلَة",
        termTranslit: "al-qalqalah",
        label: "Qalqalah (Echoing Letters)",
        description:
            "Five letters — ق ط ب ج د — get a slight extra “bounce” or echo whenever they carry " +
            "sukūn (no vowel): the sound doesn't just stop, it lightly bounces off the point of " +
            "articulation. A handy way to remember the five: قُطْبُ جَدٍّ (“a grandfather's axis”).",
        examples: [
            { word: "قَبْل", translit: "qabl", meaning: "before", ref: "2:4", highlightGlyph: "ب" },
            { word: "قَدْ", translit: "qad", meaning: "certainly, already", ref: "2:60", highlightGlyph: "د" },
            { word: "نَقْص", translit: "naqṣ", meaning: "loss", ref: "2:155", highlightGlyph: "ق" },
            { word: "يَجْعَلُونَ", translit: "yajʿalūna", meaning: "they place", ref: "2:19", highlightGlyph: "ج" },
            { word: "يَطْمَعُونَ", translit: "yaṭmaʿūna", meaning: "they hope, covet", ref: "7:46", highlightGlyph: "ط" },
        ],
    },
    {
        id: "izhar",
        term: "الإِظْهَار",
        termTranslit: "al-iẓhār",
        label: "Iẓhār (Clear Pronunciation)",
        description:
            "When a sākin nūn (نْ) or tanwīn is followed by one of the six throat letters — " +
            "ء ه ع ح غ خ — it's pronounced clearly and fully on its own, with no blending into " +
            "what comes next.",
        examples: [
            { word: "مَنْ آمَنَ", translit: "man āmana", meaning: "whoever believes", ref: "2:62", highlightGlyph: "ن" },
        ],
    },
    {
        id: "idgham",
        term: "الإِدْغَام",
        termTranslit: "al-idghām",
        label: "Idghām (Merging)",
        description:
            "When a sākin nūn or tanwīn is followed by one of six letters — ي ر م ل و ن — it " +
            "merges into that letter instead of being pronounced separately. Before ل or ر " +
            "(shown here) the merge is complete, marked by a shaddah on the letter that follows; " +
            "before ي ن م و it merges with a lingering nasal hum (ghunnah) instead.",
        examples: [
            {
                word: "مِنْ رَّبِّهِمْ",
                translit: "min rabbihim",
                meaning: "from their Lord",
                ref: "2:5",
                highlightGlyph: "ن",
            },
        ],
    },
    {
        id: "iqlab",
        term: "الإِقْلَاب",
        termTranslit: "al-iqlāb",
        label: "Iqlāb (Conversion)",
        description:
            "When a sākin nūn or tanwīn is followed by the single letter ب, it converts into a " +
            "light م sound before pronouncing the ب — the Muṣḥaf marks this with a tiny م drawn " +
            "above the nūn.",
        examples: [
            { word: "مِنْ بَعْدِ", translit: "min baʿdi", meaning: "after", ref: "2:27", highlightGlyph: "ن" },
        ],
    },
    {
        id: "ikhfa",
        term: "الإِخْفَاء",
        termTranslit: "al-ikhfāʾ",
        label: "Ikhfāʾ (Concealment)",
        description:
            "The remaining fifteen letters (everything not covered by the three rules above) " +
            "trigger ikhfāʾ: the nūn is concealed — pronounced neither fully clearly nor fully " +
            "merged, but as a light nasal sound that glides into the next letter.",
        examples: [
            {
                word: "مِنْ تَحْتِهَا",
                translit: "min taḥtihā",
                meaning: "beneath it",
                ref: "2:25",
                highlightGlyph: "ن",
            },
        ],
    },
];
