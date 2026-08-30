/** The Arabic alphabet, in abjad reading order, for the beginner curriculum.
 *
 * Each letter pairs one real Qur'anic example word with one everyday-Arabic
 * word — the whole point of this curriculum is that a beginner gets both
 * reading-the-Qur'an and speaking-Arabic value from the same lesson.
 *
 * Positional forms are NOT hand-typed presentation-form codepoints — they're
 * generated in `letterForms()` from the base letter plus tatweel (ـ,
 * U+0640), so the browser's own Arabic text-shaping engine draws the correct
 * contextual glyph. Six letters never connect to the letter that follows
 * them (ا د ذ ر ز و) and so only ever have two shapes; see `connects` below.
 */

export interface ArabicLetter {
    id: string;
    glyph: string;
    /** Transliterated name, e.g. "Bāʾ". */
    name: string;
    sound: string;
    /** False for the six non-connecting letters: ا د ذ ر ز و. */
    connects: boolean;
    quran: { word: string; translit: string; meaning: string; ref: string };
    everyday: { word: string; translit: string; meaning: string };
    tip?: string;
}

export const ARABIC_ALPHABET: ArabicLetter[] = [
    {
        id: "alif", glyph: "ا", name: "Alif", connects: false,
        sound: "like the A in “father”",
        quran: { word: "أَحَد", translit: "aḥad", meaning: "“one”", ref: "112:1" },
        everyday: { word: "اِسْم", translit: "ism", meaning: "name" },
        tip: "Alif never joins the letter that follows it — that's why it only ever takes two shapes.",
    },
    {
        id: "ba", glyph: "ب", name: "Bāʾ", connects: true,
        sound: "like the B in “book”",
        quran: { word: "بَيْت", translit: "bayt", meaning: "house", ref: "2:125" },
        everyday: { word: "بَاب", translit: "bāb", meaning: "door" },
    },
    {
        id: "ta", glyph: "ت", name: "Tāʾ", connects: true,
        sound: "like the T in “top”",
        quran: { word: "تَقْوَى", translit: "taqwā", meaning: "God-consciousness", ref: "2:197" },
        everyday: { word: "تُفَّاح", translit: "tuffāḥ", meaning: "apple" },
    },
    {
        id: "tha", glyph: "ث", name: "Thāʾ", connects: true,
        sound: "like the TH in “think”",
        quran: { word: "ثَمَرَات", translit: "thamarāt", meaning: "fruits", ref: "2:155" },
        everyday: { word: "ثَلْج", translit: "thalj", meaning: "snow / ice" },
    },
    {
        id: "jim", glyph: "ج", name: "Jīm", connects: true,
        sound: "like the J in “jar”",
        quran: { word: "جَنَّة", translit: "jannah", meaning: "paradise / garden", ref: "2:25" },
        everyday: { word: "جَمِيل", translit: "jamīl", meaning: "beautiful" },
    },
    {
        id: "ha2", glyph: "ح", name: "Ḥāʾ", connects: true,
        sound: "a breathy H from the throat, like softly clearing it",
        quran: { word: "حَمْد", translit: "ḥamd", meaning: "praise", ref: "1:2" },
        everyday: { word: "حَلِيب", translit: "ḥalīb", meaning: "milk" },
    },
    {
        id: "kha", glyph: "خ", name: "Khāʾ", connects: true,
        sound: "a raspy KH, like the CH in Scottish “loch”",
        quran: { word: "خَيْر", translit: "khayr", meaning: "good, goodness", ref: "2:216" },
        everyday: { word: "خُبْز", translit: "khubz", meaning: "bread" },
    },
    {
        id: "dal", glyph: "د", name: "Dāl", connects: false,
        sound: "like the D in “door”",
        quran: { word: "دِين", translit: "dīn", meaning: "religion, way of life", ref: "1:4" },
        everyday: { word: "دَرْس", translit: "dars", meaning: "lesson" },
        tip: "Dāl never joins the letter after it — two shapes only, like Alif.",
    },
    {
        id: "dhal", glyph: "ذ", name: "Dhāl", connects: false,
        sound: "like the TH in “this”",
        quran: { word: "ذِكْر", translit: "dhikr", meaning: "remembrance", ref: "15:9" },
        everyday: { word: "ذَهَب", translit: "dhahab", meaning: "gold" },
        tip: "Dhāl doesn't connect forward either — same two-shape pattern as Dāl.",
    },
    {
        id: "ra", glyph: "ر", name: "Rāʾ", connects: false,
        sound: "a rolled R, like Spanish “perro”",
        quran: { word: "رَحْمَة", translit: "raḥmah", meaning: "mercy", ref: "21:107" },
        everyday: { word: "رَجُل", translit: "rajul", meaning: "man" },
        tip: "Rāʾ only ever connects to the letter before it, never the one after — two shapes only.",
    },
    {
        id: "zay", glyph: "ز", name: "Zāy", connects: false,
        sound: "like the Z in “zoo”",
        quran: { word: "زَيْتُون", translit: "zaytūn", meaning: "olive", ref: "95:1" },
        everyday: { word: "زَهْرَة", translit: "zahrah", meaning: "flower" },
        tip: "Zāy is another non-connector — two shapes only.",
    },
    {
        id: "sin", glyph: "س", name: "Sīn", connects: true,
        sound: "like the S in “sun”",
        quran: { word: "سَلَام", translit: "salām", meaning: "peace", ref: "6:127" },
        everyday: { word: "سَيَّارَة", translit: "sayyārah", meaning: "car" },
    },
    {
        id: "shin", glyph: "ش", name: "Shīn", connects: true,
        sound: "like the SH in “shine”",
        quran: { word: "شَجَرَة", translit: "shajarah", meaning: "tree", ref: "14:24" },
        everyday: { word: "شَمْس", translit: "shams", meaning: "sun" },
    },
    {
        id: "sad", glyph: "ص", name: "Ṣād", connects: true,
        sound: "an emphatic, deep S",
        quran: { word: "صَبْر", translit: "ṣabr", meaning: "patience", ref: "2:45" },
        everyday: { word: "صُورَة", translit: "ṣūrah", meaning: "picture" },
    },
    {
        id: "dad", glyph: "ض", name: "Ḍād", connects: true,
        sound: "a heavy, emphatic D",
        quran: { word: "ضَعِيف", translit: "ḍaʿīf", meaning: "weak", ref: "4:28" },
        everyday: { word: "ضَوْء", translit: "ḍawʾ", meaning: "light" },
        tip: "Classical Arabic is nicknamed “lughat al-ḍād” — “the language of the Ḍād” — because almost no other language has this exact sound.",
    },
    {
        id: "ta2", glyph: "ط", name: "Ṭāʾ", connects: true,
        sound: "an emphatic, heavy T",
        quran: { word: "طَيِّب", translit: "ṭayyib", meaning: "good, pure", ref: "2:168" },
        everyday: { word: "طَبِيب", translit: "ṭabīb", meaning: "doctor" },
    },
    {
        id: "za", glyph: "ظ", name: "Ẓāʾ", connects: true,
        sound: "a heavy, emphatic TH/Z — one of Arabic's rarest sounds",
        quran: { word: "ظُلْم", translit: "ẓulm", meaning: "injustice", ref: "31:13" },
        everyday: { word: "ظُهْر", translit: "ẓuhr", meaning: "noon" },
    },
    {
        id: "ayn", glyph: "ع", name: "ʿAyn", connects: true,
        sound: "a deep, throaty sound with no English equivalent",
        quran: { word: "عِلْم", translit: "ʿilm", meaning: "knowledge", ref: "20:114" },
        everyday: { word: "عَيْن", translit: "ʿayn", meaning: "eye" },
        tip: "ع is also the ordinary Arabic word for “eye” and “spring [of water]” — the letter's name doubles as vocabulary.",
    },
    {
        id: "ghayn", glyph: "غ", name: "Ghayn", connects: true,
        sound: "like a soft French R — a voiced version of Khāʾ",
        quran: { word: "غَفُور", translit: "ghafūr", meaning: "forgiving", ref: "39:53" },
        everyday: { word: "غُرْفَة", translit: "ghurfah", meaning: "room" },
    },
    {
        id: "fa", glyph: "ف", name: "Fāʾ", connects: true,
        sound: "like the F in “far”",
        quran: { word: "فَجْر", translit: "fajr", meaning: "dawn", ref: "89:1" },
        everyday: { word: "فَاكِهَة", translit: "fākihah", meaning: "fruit" },
    },
    {
        id: "qaf", glyph: "ق", name: "Qāf", connects: true,
        sound: "like K, but made deeper in the throat",
        quran: { word: "قَلْب", translit: "qalb", meaning: "heart", ref: "50:37" },
        everyday: { word: "قَمَر", translit: "qamar", meaning: "moon" },
        tip: "ق opens Sūrah Qāf (50) — one of several sūrahs that begin with a single mysterious letter.",
    },
    {
        id: "kaf", glyph: "ك", name: "Kāf", connects: true,
        sound: "like the K in “key”",
        quran: { word: "كِتَاب", translit: "kitāb", meaning: "book", ref: "2:2" },
        everyday: { word: "كُرْسِيّ", translit: "kursiyy", meaning: "chair" },
    },
    {
        id: "lam", glyph: "ل", name: "Lām", connects: true,
        sound: "like the L in “light”",
        quran: { word: "لَيْل", translit: "layl", meaning: "night", ref: "92:1" },
        everyday: { word: "لِسَان", translit: "lisān", meaning: "tongue / language" },
    },
    {
        id: "mim", glyph: "م", name: "Mīm", connects: true,
        sound: "like the M in “moon”",
        quran: { word: "مُؤْمِن", translit: "mu’min", meaning: "believer", ref: "23:1" },
        everyday: { word: "مَدْرَسَة", translit: "madrasah", meaning: "school" },
    },
    {
        id: "nun", glyph: "ن", name: "Nūn", connects: true,
        sound: "like the N in “noon”",
        quran: { word: "نُور", translit: "nūr", meaning: "light", ref: "24:35" },
        everyday: { word: "نَجْمَة", translit: "najmah", meaning: "star" },
    },
    {
        id: "ha", glyph: "ه", name: "Hāʾ", connects: true,
        sound: "like the H in “house”",
        quran: { word: "هُدًى", translit: "hudā", meaning: "guidance", ref: "2:2" },
        everyday: { word: "هَاتِف", translit: "hātif", meaning: "telephone" },
        tip: "Hāʾ reshapes more than any other letter — learn to recognise all four forms by sight.",
    },
    {
        id: "waw", glyph: "و", name: "Wāw", connects: false,
        sound: "like the W in “wow”, or a long OO vowel",
        quran: { word: "وَاحِد", translit: "wāḥid", meaning: "one", ref: "2:163" },
        everyday: { word: "وَرْدَة", translit: "wardah", meaning: "rose" },
        tip: "Wāw never connects to the letter after it — like Alif, Dāl, Dhāl, Rāʾ and Zāy, only two shapes.",
    },
    {
        id: "ya", glyph: "ي", name: "Yāʾ", connects: true,
        sound: "like the Y in “yes”, or a long EE vowel",
        quran: { word: "يَوْم", translit: "yawm", meaning: "day", ref: "1:4" },
        everyday: { word: "يَد", translit: "yad", meaning: "hand" },
    },
];

const TATWEEL = "ـ";

export interface LetterForms {
    iso: string;
    ini: string;
    med: string;
    fin: string;
}

/** The four positional glyphs for a letter, generated from the base letter
 * plus tatweel so the browser's own Arabic shaping draws the right form. */
export function letterForms(letter: ArabicLetter): LetterForms {
    if (!letter.connects) {
        return { iso: letter.glyph, ini: "", med: "", fin: TATWEEL + letter.glyph };
    }
    return {
        iso: letter.glyph,
        ini: letter.glyph + TATWEEL,
        med: TATWEEL + letter.glyph + TATWEEL,
        fin: TATWEEL + letter.glyph,
    };
}

export function getArabicLetter(id: string): ArabicLetter | undefined {
    return ARABIC_ALPHABET.find((l) => l.id === id);
}
