/** Three Qur'anic and three everyday example words per letter, for the
 * beginner curriculum. Each letter's own single example (from
 * `arabic-alphabet.ts`) is the first of each list; the other two are layered
 * on here. Shared by AlphabetLesson (the letter picker) and PairingLesson
 * (consonant + ḥarakah pairing), so both show the same verified words. */

import { getArabicLetter } from "./arabic-alphabet";

export interface WordExample {
    word: string;
    translit: string;
    meaning: string;
    ref?: string;
}

const EXTRA_LETTER_EXAMPLES: Partial<
    Record<string, { quran: WordExample[]; everyday: WordExample[] }>
> = {
    alif: {
        quran: [
            { word: "إِنسَان", translit: "insān", meaning: "human being", ref: "95:4" },
            { word: "آيَة", translit: "āyah", meaning: "sign, verse", ref: "2:248" },
        ],
        everyday: [
            { word: "أَب", translit: "ab", meaning: "father" },
            { word: "أُمّ", translit: "umm", meaning: "mother" },
        ],
    },
    ba: {
        quran: [
            { word: "بَيِّنَة", translit: "bayyinah", meaning: "clear proof", ref: "98:1" },
            { word: "بَرْق", translit: "barq", meaning: "lightning", ref: "2:19" },
        ],
        everyday: [
            { word: "بَحْر", translit: "baḥr", meaning: "sea" },
            { word: "بِنْت", translit: "bint", meaning: "girl, daughter" },
        ],
    },
    ta: {
        quran: [
            { word: "تَوْبَة", translit: "tawbah", meaning: "repentance", ref: "4:17" },
            { word: "تِجَارَة", translit: "tijārah", meaning: "trade", ref: "61:10" },
        ],
        everyday: [
            { word: "تِلْفَاز", translit: "tilfāz", meaning: "television" },
            { word: "تِلْمِيذ", translit: "tilmīdh", meaning: "student" },
        ],
    },
    tha: {
        quran: [
            { word: "ثَوَاب", translit: "thawāb", meaning: "reward", ref: "3:195" },
            { word: "ثُعْبَان", translit: "thuʿbān", meaning: "serpent", ref: "7:107" },
        ],
        everyday: [
            { word: "ثَوْب", translit: "thawb", meaning: "garment" },
            { word: "ثَعْلَب", translit: "thaʿlab", meaning: "fox" },
        ],
    },
    jim: {
        quran: [
            { word: "جَبَل", translit: "jabal", meaning: "mountain", ref: "7:143" },
            { word: "جَهَنَّم", translit: "jahannam", meaning: "Hell", ref: "2:206" },
        ],
        everyday: [
            { word: "جَامِعَة", translit: "jāmiʿah", meaning: "university" },
            { word: "جَرِيدَة", translit: "jarīdah", meaning: "newspaper" },
        ],
    },
    ha2: {
        quran: [
            { word: "حَيَاة", translit: "ḥayāh", meaning: "life", ref: "2:179" },
            { word: "حَقّ", translit: "ḥaqq", meaning: "truth, right", ref: "2:42" },
        ],
        everyday: [
            { word: "حَدِيقَة", translit: "ḥadīqah", meaning: "garden" },
            { word: "حِذَاء", translit: "ḥidhāʾ", meaning: "shoes" },
        ],
    },
    kha: {
        quran: [
            { word: "خَالِق", translit: "khāliq", meaning: "creator", ref: "6:102" },
            { word: "خَوْف", translit: "khawf", meaning: "fear", ref: "2:38" },
        ],
        everyday: [
            { word: "خُضَار", translit: "khuḍār", meaning: "vegetables" },
            { word: "خَاتَم", translit: "khātam", meaning: "ring" },
        ],
    },
    dal: {
        quran: [
            { word: "دَار", translit: "dār", meaning: "home, abode", ref: "6:32" },
            { word: "دَم", translit: "dam", meaning: "blood", ref: "5:3" },
        ],
        everyday: [
            { word: "دَرَّاجَة", translit: "darrājah", meaning: "bicycle" },
            { word: "دُكَّان", translit: "dukkān", meaning: "shop" },
        ],
    },
    dhal: {
        quran: [
            { word: "ذَنْب", translit: "dhanb", meaning: "sin", ref: "40:3" },
            { word: "ذُرِّيَّة", translit: "dhurriyyah", meaning: "offspring", ref: "3:38" },
        ],
        everyday: [
            { word: "ذَكِيّ", translit: "dhakiyy", meaning: "smart, intelligent" },
            { word: "ذَقَن", translit: "dhaqan", meaning: "chin" },
        ],
    },
    ra: {
        quran: [
            { word: "رَبّ", translit: "rabb", meaning: "Lord", ref: "1:2" },
            { word: "رِزْق", translit: "rizq", meaning: "provision", ref: "2:25" },
        ],
        everyday: [
            { word: "رِسَالَة", translit: "risālah", meaning: "letter, message" },
            { word: "رِيَاضَة", translit: "riyāḍah", meaning: "sport" },
        ],
    },
    zay: {
        quran: [
            { word: "زَوْج", translit: "zawj", meaning: "spouse, pair", ref: "2:35" },
            { word: "زِينَة", translit: "zīnah", meaning: "adornment", ref: "7:32" },
        ],
        everyday: [
            { word: "زَمِيل", translit: "zamīl", meaning: "colleague" },
            { word: "زُجَاج", translit: "zujāj", meaning: "glass" },
        ],
    },
    sin: {
        quran: [
            { word: "سَمَاء", translit: "samāʾ", meaning: "sky", ref: "2:22" },
            { word: "سَبِيل", translit: "sabīl", meaning: "way, path", ref: "2:154" },
        ],
        everyday: [
            { word: "سُوق", translit: "sūq", meaning: "market" },
            { word: "سَاعَة", translit: "sāʿah", meaning: "watch, hour" },
        ],
    },
    shin: {
        quran: [
            { word: "شَهْر", translit: "shahr", meaning: "month", ref: "2:185" },
            { word: "شَيْطَان", translit: "shayṭān", meaning: "devil, Satan", ref: "2:36" },
        ],
        everyday: [
            { word: "شَارِع", translit: "shāriʿ", meaning: "street" },
            { word: "شَاي", translit: "shāy", meaning: "tea" },
        ],
    },
    sad: {
        quran: [
            { word: "صَلَاة", translit: "ṣalāh", meaning: "prayer", ref: "2:3" },
            { word: "صِرَاط", translit: "ṣirāṭ", meaning: "path", ref: "1:6" },
        ],
        everyday: [
            { word: "صَدِيق", translit: "ṣadīq", meaning: "friend" },
            { word: "صَبَاح", translit: "ṣabāḥ", meaning: "morning" },
        ],
    },
    dad: {
        quran: [
            { word: "ضَلَال", translit: "ḍalāl", meaning: "misguidance", ref: "3:164" },
            { word: "ضِيَاء", translit: "ḍiyāʾ", meaning: "radiant light", ref: "10:5" },
        ],
        everyday: [
            { word: "ضَيْف", translit: "ḍayf", meaning: "guest" },
            { word: "ضِفْدَع", translit: "ḍifdaʿ", meaning: "frog" },
        ],
    },
    ta2: {
        quran: [
            { word: "طَعَام", translit: "ṭaʿām", meaning: "food", ref: "80:24" },
            { word: "طُوفَان", translit: "ṭūfān", meaning: "flood", ref: "7:133" },
        ],
        everyday: [
            { word: "طَاوِلَة", translit: "ṭāwilah", meaning: "table" },
            { word: "طَقْس", translit: "ṭaqs", meaning: "weather" },
        ],
    },
    za: {
        quran: [
            { word: "ظُلُمَات", translit: "ẓulumāt", meaning: "darknesses", ref: "2:19" },
            { word: "ظَنّ", translit: "ẓann", meaning: "assumption, suspicion", ref: "49:12" },
        ],
        everyday: [
            { word: "ظَرْف", translit: "ẓarf", meaning: "envelope" },
            { word: "ظِلّ", translit: "ẓill", meaning: "shade" },
        ],
    },
    ayn: {
        quran: [
            { word: "عَدْل", translit: "ʿadl", meaning: "justice", ref: "16:90" },
            { word: "عَذَاب", translit: "ʿadhāb", meaning: "punishment", ref: "2:7" },
        ],
        everyday: [
            { word: "عَائِلَة", translit: "ʿāʾilah", meaning: "family" },
            { word: "عَصِير", translit: "ʿaṣīr", meaning: "juice" },
        ],
    },
    ghayn: {
        quran: [
            { word: "غَيْب", translit: "ghayb", meaning: "the unseen", ref: "2:3" },
            { word: "غَضَب", translit: "ghaḍab", meaning: "anger", ref: "2:61" },
        ],
        everyday: [
            { word: "غِطَاء", translit: "ghiṭāʾ", meaning: "cover, lid" },
            { word: "غَابَة", translit: "ghābah", meaning: "forest" },
        ],
    },
    fa: {
        quran: [
            { word: "فَضْل", translit: "faḍl", meaning: "grace, favor", ref: "2:64" },
            { word: "فِرْدَوْس", translit: "firdaws", meaning: "Paradise", ref: "18:107" },
        ],
        everyday: [
            { word: "فُنْدُق", translit: "funduq", meaning: "hotel" },
            { word: "فُرْصَة", translit: "furṣah", meaning: "opportunity" },
        ],
    },
    qaf: {
        quran: [
            { word: "قُرْآن", translit: "qurʾān", meaning: "Qur'an, recitation", ref: "2:185" },
            { word: "قَوْم", translit: "qawm", meaning: "people, nation", ref: "7:59" },
        ],
        everyday: [
            { word: "قَلَم", translit: "qalam", meaning: "pen" },
            { word: "قَمِيص", translit: "qamīṣ", meaning: "shirt" },
        ],
    },
    kaf: {
        quran: [
            { word: "كَلِمَة", translit: "kalimah", meaning: "word", ref: "3:39" },
            { word: "كَبِير", translit: "kabīr", meaning: "great, big", ref: "4:34" },
        ],
        everyday: [
            { word: "كَلْب", translit: "kalb", meaning: "dog" },
            { word: "كُوب", translit: "kūb", meaning: "cup" },
        ],
    },
    lam: {
        quran: [
            { word: "لَيْلَة", translit: "laylah", meaning: "night", ref: "97:1" },
            { word: "لِبَاس", translit: "libās", meaning: "clothing, garment", ref: "7:26" },
        ],
        everyday: [
            { word: "لُغَة", translit: "lughah", meaning: "language" },
            { word: "لَوْن", translit: "lawn", meaning: "color" },
        ],
    },
    mim: {
        quran: [
            { word: "مَلَك", translit: "malak", meaning: "angel", ref: "6:8" },
            { word: "مَاء", translit: "māʾ", meaning: "water", ref: "21:30" },
        ],
        everyday: [
            { word: "مَطْبَخ", translit: "maṭbakh", meaning: "kitchen" },
            { word: "مِفْتَاح", translit: "miftāḥ", meaning: "key" },
        ],
    },
    nun: {
        quran: [
            { word: "نَبِيّ", translit: "nabiyy", meaning: "prophet", ref: "33:45" },
            { word: "نَفْس", translit: "nafs", meaning: "soul, self", ref: "2:48" },
        ],
        everyday: [
            { word: "نَافِذَة", translit: "nāfidhah", meaning: "window" },
            { word: "نَهْر", translit: "nahr", meaning: "river" },
        ],
    },
    ha: {
        quran: [
            { word: "هَوَى", translit: "hawā", meaning: "desire, whim", ref: "79:40" },
            { word: "هَدْي", translit: "hady", meaning: "sacrificial offering", ref: "2:196" },
        ],
        everyday: [
            { word: "هَوَاء", translit: "hawāʾ", meaning: "air" },
            { word: "هَدِيَّة", translit: "hadiyyah", meaning: "gift" },
        ],
    },
    waw: {
        quran: [
            { word: "وَعْد", translit: "waʿd", meaning: "promise", ref: "14:22" },
            { word: "وَلَد", translit: "walad", meaning: "child, son", ref: "19:35" },
        ],
        everyday: [
            { word: "وَقْت", translit: "waqt", meaning: "time" },
            { word: "وَجْبَة", translit: "wajbah", meaning: "meal" },
        ],
    },
    ya: {
        quran: [
            { word: "يَقِين", translit: "yaqīn", meaning: "certainty", ref: "15:99" },
            { word: "يُسْر", translit: "yusr", meaning: "ease", ref: "94:6" },
        ],
        everyday: [
            { word: "يَتِيم", translit: "yatīm", meaning: "orphan" },
            { word: "يَمِين", translit: "yamīn", meaning: "right hand" },
        ],
    },
};

/** Every letter's example set: its own curriculum word first, then the two
 * extras above — three Qur'anic and three everyday words in total. */
export function getLetterExamples(id: string): { quran: WordExample[]; everyday: WordExample[] } {
    const letter = getArabicLetter(id);
    const extra = EXTRA_LETTER_EXAMPLES[id];
    if (!letter) return { quran: extra?.quran ?? [], everyday: extra?.everyday ?? [] };
    return {
        quran: [letter.quran, ...(extra?.quran ?? [])],
        everyday: [letter.everyday, ...(extra?.everyday ?? [])],
    };
}
