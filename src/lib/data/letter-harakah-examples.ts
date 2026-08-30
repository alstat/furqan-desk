/** One real word per ḥarakah — fatḥah, kasrah, ḍammah, sukūn — for every
 * letter, so the pairing lesson's synthetic tiles (bā/bi/bu/b) are each
 * backed by something the learner will actually meet while reading.
 *
 * Most entries are drawn from words already vetted elsewhere in this
 * curriculum (`letter-examples.ts` / `letter-position-examples.ts`), so
 * their spelling and any `ref` were already checked. The handful with no
 * exact match there were freshly mined from this app's own local Qur'an
 * text (`quran_static.db`) the same way. */

import type { WordExample } from "./letter-examples";

export interface HarakahExamples {
    fatha: WordExample;
    kasra: WordExample;
    damma: WordExample;
    sukun: WordExample;
}

export const LETTER_HARAKAH_EXAMPLES: Record<string, HarakahExamples> = {
    alif: {
        fatha: { word: "أَب", translit: "ab", meaning: "father" },
        kasra: { word: "اِهْدِ", translit: "ihdi", meaning: "guide [us]!", ref: "1:6" },
        damma: { word: "أُمّ", translit: "umm", meaning: "mother" },
        sukun: { word: "يَأْمُرُ", translit: "yaʾmuru", meaning: "he commands", ref: "2:67" },
    },
    ba: {
        fatha: { word: "بَاب", translit: "bāb", meaning: "door" },
        kasra: { word: "بِنْت", translit: "bint", meaning: "girl, daughter" },
        damma: { word: "نَعْبُد", translit: "naʿbud", meaning: "we worship", ref: "1:5" },
        sukun: { word: "خُبْز", translit: "khubz", meaning: "bread" },
    },
    ta: {
        fatha: { word: "خَاتَم", translit: "khātam", meaning: "ring" },
        kasra: { word: "يَتِيم", translit: "yatīm", meaning: "orphan" },
        damma: { word: "يُمِيتُ", translit: "yumītu", meaning: "He causes death", ref: "2:28" },
        sukun: { word: "أَضَاءَتْ", translit: "aḍāʾat", meaning: "it lit up", ref: "2:17" },
    },
    tha: {
        fatha: { word: "ثَوْب", translit: "thawb", meaning: "garment" },
        kasra: { word: "كَثِيرًا", translit: "kathīran", meaning: "many, much", ref: "2:26" },
        damma: { word: "حَيْثُ", translit: "ḥaythu", meaning: "where, wherever", ref: "2:35" },
        sukun: { word: "مِثْلِ", translit: "mithli", meaning: "like, similar to", ref: "2:106" },
    },
    jim: {
        fatha: { word: "جَبَل", translit: "jabal", meaning: "mountain", ref: "7:143" },
        kasra: { word: "جِبْرِيلَ", translit: "Jibrīla", meaning: "Gabriel", ref: "2:97" },
        damma: { word: "رَجُل", translit: "rajul", meaning: "man" },
        sukun: { word: "وَجْبَة", translit: "wajbah", meaning: "meal" },
    },
    ha2: {
        fatha: { word: "حَقّ", translit: "ḥaqq", meaning: "truth, right", ref: "2:42" },
        kasra: { word: "حِذَاء", translit: "ḥidhāʾ", meaning: "shoes" },
        damma: { word: "حُسْنًا", translit: "ḥusnan", meaning: "goodness", ref: "2:83" },
        sukun: { word: "بَحْر", translit: "baḥr", meaning: "sea" },
    },
    kha: {
        fatha: { word: "خَوْف", translit: "khawf", meaning: "fear", ref: "2:38" },
        kasra: { word: "آخِرَة", translit: "ākhirah", meaning: "the Hereafter", ref: "2:4" },
        damma: { word: "خُبْز", translit: "khubz", meaning: "bread" },
        sukun: { word: "أُخْت", translit: "ukht", meaning: "sister" },
    },
    dal: {
        fatha: { word: "دَم", translit: "dam", meaning: "blood", ref: "5:3" },
        kasra: { word: "صَدِيق", translit: "ṣadīq", meaning: "friend" },
        damma: { word: "دُكَّان", translit: "dukkān", meaning: "shop" },
        sukun: { word: "عَدْل", translit: "ʿadl", meaning: "justice", ref: "16:90" },
    },
    dhal: {
        fatha: { word: "ذَنْب", translit: "dhanb", meaning: "sin", ref: "40:3" },
        kasra: { word: "لَذِيذ", translit: "ladhīdh", meaning: "delicious" },
        damma: { word: "ذُرِّيَّة", translit: "dhurriyyah", meaning: "offspring", ref: "3:38" },
        sukun: { word: "إِذْ", translit: "idh", meaning: "when", ref: "2:30" },
    },
    ra: {
        fatha: { word: "رَبّ", translit: "rabb", meaning: "Lord", ref: "1:2" },
        kasra: { word: "رِزْق", translit: "rizq", meaning: "provision", ref: "2:25" },
        damma: { word: "عُرُوش", translit: "ʿurūsh", meaning: "roofs", ref: "2:259" },
        sukun: { word: "بَرْق", translit: "barq", meaning: "lightning", ref: "2:19" },
    },
    zay: {
        fatha: { word: "زَوْج", translit: "zawj", meaning: "spouse, pair", ref: "2:35" },
        kasra: { word: "زِينَة", translit: "zīnah", meaning: "adornment", ref: "7:32" },
        damma: { word: "زُجَاج", translit: "zujāj", meaning: "glass" },
        sukun: { word: "رِزْق", translit: "rizq", meaning: "provision", ref: "2:25" },
    },
    sin: {
        fatha: { word: "سَمْع", translit: "samʿ", meaning: "hearing", ref: "2:7" },
        kasra: { word: "نَاسِ", translit: "nāsi", meaning: "people", ref: "2:8" },
        damma: { word: "سُوق", translit: "sūq", meaning: "market" },
        sukun: { word: "يُسْر", translit: "yusr", meaning: "ease", ref: "94:6" },
    },
    shin: {
        fatha: { word: "شَاي", translit: "shāy", meaning: "tea" },
        kasra: { word: "شِقَاقٍ", translit: "shiqāqin", meaning: "dissension", ref: "2:137" },
        damma: { word: "شُهَدَاء", translit: "shuhadāʾ", meaning: "witnesses", ref: "2:23" },
        sukun: { word: "يَشْعُر", translit: "yashʿur", meaning: "he perceives", ref: "2:9" },
    },
    sad: {
        fatha: { word: "صَلَاة", translit: "ṣalāh", meaning: "prayer", ref: "2:3" },
        kasra: { word: "صِرَاط", translit: "ṣirāṭ", meaning: "path", ref: "1:6" },
        damma: { word: "تَصُومُ", translit: "taṣūmu", meaning: "she fasts", ref: "2:184" },
        sukun: { word: "مِصْرًا", translit: "miṣran", meaning: "a city", ref: "2:61" },
    },
    dad: {
        fatha: { word: "ضَيْف", translit: "ḍayf", meaning: "guest" },
        kasra: { word: "ضِيَاء", translit: "ḍiyāʾ", meaning: "radiant light", ref: "10:5" },
        damma: { word: "أَرْضُ", translit: "arḍu", meaning: "earth, land", ref: "2:61" },
        sukun: { word: "فَضْل", translit: "faḍl", meaning: "grace, favor", ref: "2:64" },
    },
    ta2: {
        fatha: { word: "طَقْس", translit: "ṭaqs", meaning: "weather" },
        kasra: { word: "بَٰطِلِ", translit: "bāṭili", meaning: "falsehood", ref: "2:42" },
        damma: { word: "طُوفَان", translit: "ṭūfān", meaning: "flood", ref: "7:133" },
        sukun: { word: "مَطْبَخ", translit: "maṭbakh", meaning: "kitchen" },
    },
    za: {
        fatha: { word: "ظَنّ", translit: "ẓann", meaning: "assumption, suspicion", ref: "49:12" },
        kasra: { word: "ظِلّ", translit: "ẓill", meaning: "shade" },
        damma: { word: "ظُلُمَات", translit: "ẓulumāt", meaning: "darknesses", ref: "2:19" },
        sukun: { word: "أَظْلَمَ", translit: "aẓlama", meaning: "it went dark", ref: "2:20" },
    },
    ayn: {
        fatha: { word: "عَدْل", translit: "ʿadl", meaning: "justice", ref: "16:90" },
        kasra: { word: "عِلْمَ", translit: "ʿilma", meaning: "knowledge", ref: "2:32" },
        damma: { word: "عُرُوش", translit: "ʿurūsh", meaning: "roofs", ref: "2:259" },
        sukun: { word: "وَعْد", translit: "waʿd", meaning: "promise", ref: "14:22" },
    },
    ghayn: {
        fatha: { word: "غَيْب", translit: "ghayb", meaning: "the unseen", ref: "2:3" },
        kasra: { word: "غِطَاء", translit: "ghiṭāʾ", meaning: "cover, lid" },
        damma: { word: "غُفْرَانَ", translit: "ghufrāna", meaning: "forgiveness", ref: "2:285" },
        sukun: { word: "طُغْيَان", translit: "ṭughyān", meaning: "transgression", ref: "2:15" },
    },
    fa: {
        fatha: { word: "فَضْل", translit: "faḍl", meaning: "grace, favor", ref: "2:64" },
        kasra: { word: "فِي", translit: "fī", meaning: "in", ref: "2:10" },
        damma: { word: "فُنْدُق", translit: "funduq", meaning: "hotel" },
        sukun: { word: "نَفْس", translit: "nafs", meaning: "soul, self", ref: "2:48" },
    },
    qaf: {
        fatha: { word: "ذَقَن", translit: "dhaqan", meaning: "chin" },
        kasra: { word: "يَقِين", translit: "yaqīn", meaning: "certainty", ref: "15:99" },
        damma: { word: "قُرْآن", translit: "qurʾān", meaning: "Qur'an, recitation", ref: "2:185" },
        sukun: { word: "طَقْس", translit: "ṭaqs", meaning: "weather" },
    },
    kaf: {
        fatha: { word: "كَان", translit: "kāna", meaning: "he was, became", ref: "2:10" },
        kasra: { word: "ذَكِيّ", translit: "dhakiyy", meaning: "smart, intelligent" },
        damma: { word: "كُوب", translit: "kūb", meaning: "cup" },
        sukun: { word: "بُكْمٌ", translit: "bukmun", meaning: "mute, dumb", ref: "2:18" },
    },
    lam: {
        fatha: { word: "قَلَم", translit: "qalam", meaning: "pen" },
        kasra: { word: "خَالِق", translit: "khāliq", meaning: "creator", ref: "6:102" },
        damma: { word: "لُغَة", translit: "lughah", meaning: "language" },
        sukun: { word: "كَلْب", translit: "kalb", meaning: "dog" },
    },
    mim: {
        fatha: { word: "مَاء", translit: "māʾ", meaning: "water", ref: "21:30" },
        kasra: { word: "زَمِيل", translit: "zamīl", meaning: "colleague" },
        damma: { word: "مُسْتَقِيم", translit: "mustaqīm", meaning: "straight", ref: "1:6" },
        sukun: { word: "حَمْد", translit: "ḥamd", meaning: "praise", ref: "1:2" },
    },
    nun: {
        fatha: { word: "نَاس", translit: "nās", meaning: "people, mankind", ref: "2:8" },
        kasra: { word: "دُونِ", translit: "dūni", meaning: "besides, other than", ref: "2:23" },
        damma: { word: "نَحْنُ", translit: "naḥnu", meaning: "we", ref: "2:11" },
        sukun: { word: "بِنْت", translit: "bint", meaning: "girl, daughter" },
    },
    ha: {
        fatha: { word: "هَوَى", translit: "hawā", meaning: "desire, whim", ref: "79:40" },
        kasra: { word: "اللَّهِ", translit: "allāhi", meaning: "Allah", ref: "1:1" },
        damma: { word: "هُدًى", translit: "hudan", meaning: "guidance", ref: "2:2" },
        sukun: { word: "شَهْر", translit: "shahr", meaning: "month", ref: "2:185" },
    },
    waw: {
        fatha: { word: "هَوَى", translit: "hawā", meaning: "desire, whim", ref: "79:40" },
        kasra: { word: "طَاوِلَة", translit: "ṭāwilah", meaning: "table" },
        damma: { word: "وُجُوه", translit: "wujūh", meaning: "faces", ref: "2:144" },
        sukun: { word: "ثَوْب", translit: "thawb", meaning: "garment" },
    },
    ya: {
        fatha: { word: "آيَة", translit: "āyah", meaning: "sign, verse", ref: "2:248" },
        kasra: { word: "صَيِّب", translit: "ṣayyib", meaning: "rain cloud", ref: "2:19" },
        damma: { word: "يُسْر", translit: "yusr", meaning: "ease", ref: "94:6" },
        sukun: { word: "ضَيْف", translit: "ḍayf", meaning: "guest" },
    },
};
