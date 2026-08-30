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
            { word: "ٱقْرَأْ", translit: "iqraʾ", meaning: "read!", ref: "96:1", highlightGlyph: "ق" },
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
            { word: "مِنْهُ", translit: "minhu", meaning: "from it", ref: "2:60", highlightGlyph: "ن" },
            { word: "يَنْعِقُ", translit: "yanʿiqu", meaning: "he shouts", ref: "2:171", highlightGlyph: "ن" },
            { word: "مِنْ حَقٍّ", translit: "min ḥaqqin", meaning: "any right", ref: "11:79", highlightGlyph: "ن" },
            { word: "مِنْ غَمٍّ", translit: "min ghammin", meaning: "from anguish", ref: "22:22", highlightGlyph: "ن" },
            { word: "مِنْ خَيْرٍ", translit: "min khayrin", meaning: "of good", ref: "3:30", highlightGlyph: "ن" },
            { word: "مَنْ ءَامَنَ", translit: "man āmana", meaning: "whoever believed", ref: "2:62", highlightGlyph: "ن" },
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
            "the merge is complete, marked by a shaddah on the letter that follows; before " +
            "ي ن م و it merges with a lingering nasal hum (ghunnah) instead.",
        examples: [
            { word: "مِن رَّبِّهِمْ", translit: "min rabbihim", meaning: "from their Lord", ref: "2:26", highlightGlyph: "ن" },
            { word: "أَن لَّا", translit: "an lā", meaning: "that not", ref: "7:169", highlightGlyph: "ن" },
            { word: "عَن مَّا", translit: "ʿan mā", meaning: "about what", ref: "7:166", highlightGlyph: "ن" },
            { word: "مِن نَّارِ", translit: "min nāri", meaning: "from fire", ref: "15:27", highlightGlyph: "ن" },
            { word: "إِن يَشَأْ", translit: "in yashaʾ", meaning: "if He wills", ref: "4:133", highlightGlyph: "ن" },
            { word: "مِن وَلِىٍّ", translit: "min waliyyin", meaning: "any protector", ref: "2:107", highlightGlyph: "ن" },
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
            { word: "مِنۢ بَعْدِ", translit: "min baʿdi", meaning: "after", ref: "2:27", highlightGlyph: "ن" },
            { word: "ذَنۢبٌ", translit: "dhanbun", meaning: "a sin", ref: "26:14", highlightGlyph: "ن" },
            { word: "تُنۢبِتُ", translit: "tunbitu", meaning: "it grows", ref: "2:61", highlightGlyph: "ن" },
            { word: "أَنۢبَآءِ", translit: "anbāʾi", meaning: "the news", ref: "11:49", highlightGlyph: "ن" },
            { word: "ذَنۢبِكَ", translit: "dhanbika", meaning: "your sin", ref: "48:2", highlightGlyph: "ن" },
            { word: "يَنۢبَغِى", translit: "yanbaghī", meaning: "it is fitting", ref: "19:92", highlightGlyph: "ن" },
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
            { word: "أَنتَ", translit: "anta", meaning: "you", ref: "2:32", highlightGlyph: "ن" },
            { word: "عِندَ", translit: "ʿinda", meaning: "with, near", ref: "2:54", highlightGlyph: "ن" },
            { word: "كَنزٌ", translit: "kanzun", meaning: "a treasure", ref: "11:12", highlightGlyph: "ن" },
            { word: "ٱنظُرْ", translit: "unẓur", meaning: "look!", ref: "4:50", highlightGlyph: "ن" },
            { word: "ٱنقُصْ", translit: "unquṣ", meaning: "reduce", ref: "73:3", highlightGlyph: "ن" },
            { word: "مِن كُلِّ", translit: "min kulli", meaning: "from every", ref: "4:41", highlightGlyph: "ن" },
        ],
    },
];
