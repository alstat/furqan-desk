/** Long vowels and the special Alif forms that give Arabic script some of
 * its trickiest — and most distinctive — recitation rules: the Alif that's
 * written like a Yāʾ, the vowel mark with no letter of its own, and the two
 * hamzahs that look almost identical but behave completely differently.
 *
 * Every (word, ref) pair was checked against this app's own local Qur'an
 * text (`quran_static.db`) the same way as the rest of this curriculum. */

export interface AlifFormExample {
    word: string;
    translit: string;
    meaning: string;
    ref?: string;
    /** Passed to `highlightLetter` — the base letter to light up. */
    highlightGlyph?: string;
    /** Passed to `highlightMark` — a combining mark with no letter of its
     * own (the dagger alif). Takes priority over `highlightGlyph`. */
    highlightMark?: string;
}

export interface AlifForm {
    id: string;
    /** The term in Arabic script. */
    term: string;
    termTranslit: string;
    /** Short English name shown in the picker. */
    label: string;
    description: string;
    examples: AlifFormExample[];
}

const DAGGER_ALIF = "ٰ";

export const ALIF_FORMS: AlifForm[] = [
    {
        id: "madd_tabii",
        term: "المَدّ الطَّبِيعِي",
        termTranslit: "al-madd aṭ-ṭabīʿī",
        label: "Natural Long Vowels",
        description:
            "The three long-vowel letters — ا و ي — each pair with the matching short vowel to " +
            "stretch it into a long one: fatḥah + ا makes “ā”, ḍammah + و makes “ū”, " +
            "and kasrah + ي makes “ī”. Held for about two counts, this is the most basic kind " +
            "of madd (elongation) — every other madd rule builds on it.",
        examples: [
            { word: "كِتَاب", translit: "kitāb", meaning: "book", ref: "2:2", highlightGlyph: "ا" },
            { word: "نُور", translit: "nūr", meaning: "light", ref: "24:35", highlightGlyph: "و" },
            { word: "دِين", translit: "dīn", meaning: "religion", ref: "1:4", highlightGlyph: "ي" },
            { word: "كَانَ", translit: "kāna", meaning: "he was", ref: "2:97", highlightGlyph: "ا" },
            { word: "دُونِ", translit: "dūni", meaning: "other than", ref: "2:23", highlightGlyph: "و" },
            { word: "قِيلَ", translit: "qīla", meaning: "it was said", ref: "2:11", highlightGlyph: "ي" },
        ],
    },
    {
        id: "alif_maqsurah",
        term: "الأَلِف المَقْصُورَة",
        termTranslit: "al-alif al-maqṣūrah",
        label: "Alif Maqṣūrah",
        description:
            "Written in the shape of a Yāʾ but with no dots (ى), this is still an Alif — it makes " +
            "the same long “ā” sound as a regular ا. It shows up almost only at the very end " +
            "of a word, so seeing a dotless “yāʾ-shaped” letter there is the giveaway.",
        examples: [
            { word: "عَلَى", translit: "ʿalā", meaning: "on, upon", ref: "2:5", highlightGlyph: "ى" },
            { word: "إِلَى", translit: "ilā", meaning: "to, towards", ref: "2:29", highlightGlyph: "ى" },
            { word: "مُوسَى", translit: "Mūsā", meaning: "Moses", ref: "2:53", highlightGlyph: "ى" },
            { word: "هُدًى", translit: "hudan", meaning: "guidance", ref: "2:2", highlightGlyph: "ى" },
            { word: "عِيسَى", translit: "ʿĪsā", meaning: "Jesus", ref: "2:87", highlightGlyph: "ى" },
            { word: "نَرَى", translit: "narā", meaning: "we see", ref: "2:55", highlightGlyph: "ى" },
        ],
    },
    {
        id: "dagger_alif",
        term: "الأَلِف الخَنْجَرِيَّة",
        termTranslit: "al-alif al-khanjariyyah",
        label: "Dagger Alif (Short Alif)",
        description:
            "A tiny “ā” sound written as a small raised stroke above a letter instead of a " +
            "full-size ا — a handful of very common words (this, that, Allah, ar-Raḥmān...) have " +
            "kept this old spelling. It's still read as a full long “ā”, just written in " +
            "miniature.",
        examples: [
            { word: "هَٰذَا", translit: "hādhā", meaning: "this", ref: "2:25", highlightMark: DAGGER_ALIF },
            { word: "ذَٰلِكَ", translit: "dhālika", meaning: "that", ref: "2:2", highlightMark: DAGGER_ALIF },
            { word: "رَحْمَٰن", translit: "raḥmān", meaning: "Most Gracious", ref: "1:1", highlightMark: DAGGER_ALIF },
            { word: "مَٰلِكِ", translit: "māliki", meaning: "master, owner", ref: "1:4", highlightMark: DAGGER_ALIF },
            { word: "سَلَٰمٌ", translit: "salāmun", meaning: "peace", ref: "6:54", highlightMark: DAGGER_ALIF },
            { word: "ضَلَٰلٍ", translit: "ḍalālin", meaning: "error, straying", ref: "6:74", highlightMark: DAGGER_ALIF },
        ],
    },
    {
        id: "hamzat_qat",
        term: "هَمْزَة القَطْع",
        termTranslit: "hamzat al-qaṭʿ",
        label: "Hamzat al-Qaṭʿ (Cutting Hamza)",
        description:
            "A true consonant — a glottal stop, seated on an Alif (أ / إ) — that is always " +
            "pronounced, whether it opens a sentence or falls in the middle of one after another " +
            "word. Most word-initial hamzahs you'll meet are this kind.",
        examples: [
            { word: "أَحَد", translit: "aḥad", meaning: "one", ref: "112:1", highlightGlyph: "ا" },
            { word: "إِنَّ", translit: "inna", meaning: "indeed", ref: "2:6", highlightGlyph: "ا" },
            { word: "أُمّ", translit: "umm", meaning: "mother", highlightGlyph: "ا" },
            { word: "أَنتَ", translit: "anta", meaning: "you", ref: "2:32", highlightGlyph: "ا" },
            { word: "وَإِن", translit: "wa-in", meaning: "and if", ref: "2:23", highlightGlyph: "ا" },
            { word: "إِذًا", translit: "idhan", meaning: "then, in that case", ref: "4:140", highlightGlyph: "ا" },
        ],
    },
    {
        id: "hamzat_wasl",
        term: "هَمْزَة الوَصْل",
        termTranslit: "hamzat al-waṣl",
        label: "Hamzat al-Waṣl (Connecting Hamza)",
        description:
            "Written as a plain Alif with no hamza mark, this one is only pronounced when you " +
            "START speaking on it. Land on it after another word — reading on, connecting the " +
            "speech — and it simply disappears: “bi-ismi” becomes “bismi”. It opens " +
            "the definite article ال, many imperative verbs, and a short list of nouns.",
        examples: [
            { word: "اِسْم", translit: "ism", meaning: "name", highlightGlyph: "ا" },
            { word: "الَّذِينَ", translit: "alladhīna", meaning: "those who", ref: "2:6", highlightGlyph: "ا" },
            { word: "ادْخُلُوا", translit: "udkhulū", meaning: "enter!", ref: "2:58", highlightGlyph: "ا" },
            { word: "ٱهْدِنَا", translit: "ihdinā", meaning: "guide us", ref: "1:6", highlightGlyph: "ا" },
            { word: "ٱدْعُ", translit: "udʿu", meaning: "call, pray", ref: "2:68", highlightGlyph: "ا" },
            { word: "ٱتْلُ", translit: "utlu", meaning: "recite!", ref: "29:45", highlightGlyph: "ا" },
        ],
    },
];
