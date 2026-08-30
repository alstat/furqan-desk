/** Curated three-letter combinations for the "build a word" lesson. */

export interface WordStep {
    /** Cumulative Arabic text up to and including this letter. */
    text: string;
    /** What was just added, e.g. "+ yā + sukūn". */
    caption: string;
}

export interface ThreeLetterWord {
    id: string;
    word: string;
    translit: string;
    meaning: string;
    ref: string;
    steps: [WordStep, WordStep, WordStep];
}

export const THREE_LETTER_WORDS: ThreeLetterWord[] = [
    {
        id: "bayt",
        word: "بَيْت",
        translit: "bayt",
        meaning: "house",
        ref: "2:125",
        steps: [
            { text: "بَ", caption: "bā + fatḥah" },
            { text: "بَيْ", caption: "+ yā + sukūn" },
            { text: "بَيْت", caption: "+ tā" },
        ],
    },
    {
        id: "qalb",
        word: "قَلْب",
        translit: "qalb",
        meaning: "heart",
        ref: "50:37",
        steps: [
            { text: "قَ", caption: "qāf + fatḥah" },
            { text: "قَلْ", caption: "+ lām + sukūn" },
            { text: "قَلْب", caption: "+ bā" },
        ],
    },
    {
        id: "ilm",
        word: "عِلْم",
        translit: "ʿilm",
        meaning: "knowledge",
        ref: "20:114",
        steps: [
            { text: "عِ", caption: "ʿayn + kasrah" },
            { text: "عِلْ", caption: "+ lām + sukūn" },
            { text: "عِلْم", caption: "+ mīm" },
        ],
    },
    {
        id: "din",
        word: "دِين",
        translit: "dīn",
        meaning: "judgment",
        ref: "1:4",
        steps: [
            { text: "دِ", caption: "dāl + kasrah" },
            { text: "دِي", caption: "+ yā (long vowel)" },
            { text: "دِين", caption: "+ nūn" },
        ],
    },
    {
        id: "nur",
        word: "نُور",
        translit: "nūr",
        meaning: "light",
        ref: "24:35",
        steps: [
            { text: "نُ", caption: "nūn + ḍammah" },
            { text: "نُو", caption: "+ wāw (long vowel)" },
            { text: "نُور", caption: "+ rā" },
        ],
    },
    {
        id: "yawm",
        word: "يَوْم",
        translit: "yawm",
        meaning: "day",
        ref: "1:4",
        steps: [
            { text: "يَ", caption: "yā + fatḥah" },
            { text: "يَوْ", caption: "+ wāw + sukūn" },
            { text: "يَوْم", caption: "+ mīm" },
        ],
    },
    {
        id: "ahad",
        word: "أَحَد",
        translit: "aḥad",
        meaning: "one",
        ref: "112:1",
        steps: [
            { text: "أَ", caption: "hamzah + fatḥah" },
            { text: "أَحَ", caption: "+ ḥā + fatḥah" },
            { text: "أَحَد", caption: "+ dāl" },
        ],
    },
    {
        id: "khalaqa",
        word: "خَلَقَ",
        translit: "khalaqa",
        meaning: "He created",
        ref: "96:1",
        steps: [
            { text: "خَ", caption: "khā + fatḥah" },
            { text: "خَلَ", caption: "+ lām + fatḥah" },
            { text: "خَلَقَ", caption: "+ qāf + fatḥah" },
        ],
    },
    {
        id: "malik",
        word: "مَلِك",
        translit: "malik",
        meaning: "Master, King",
        ref: "1:4",
        steps: [
            { text: "مَ", caption: "mīm + fatḥah" },
            { text: "مَلِ", caption: "+ lām + kasrah" },
            { text: "مَلِك", caption: "+ kāf" },
        ],
    },
    {
        id: "samad",
        word: "صَمَد",
        translit: "ṣamad",
        meaning: "the Eternal Refuge",
        ref: "112:2",
        steps: [
            { text: "صَ", caption: "ṣād + fatḥah" },
            { text: "صَمَ", caption: "+ mīm + fatḥah" },
            { text: "صَمَد", caption: "+ dāl" },
        ],
    },
    {
        id: "falaq",
        word: "فَلَق",
        translit: "falaq",
        meaning: "daybreak",
        ref: "113:1",
        steps: [
            { text: "فَ", caption: "fā + fatḥah" },
            { text: "فَلَ", caption: "+ lām + fatḥah" },
            { text: "فَلَق", caption: "+ qāf" },
        ],
    },
    {
        id: "nas",
        word: "نَاس",
        translit: "nās",
        meaning: "humankind",
        ref: "114:1",
        steps: [
            { text: "نَ", caption: "nūn + fatḥah" },
            { text: "نَا", caption: "+ alif (long ā)" },
            { text: "نَاس", caption: "+ sīn" },
        ],
    },
];
