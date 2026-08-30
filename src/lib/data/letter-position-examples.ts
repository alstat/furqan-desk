/** One real word per position — initial, medial, final — for each letter, so
 * a learner can see the letter sit at each spot in actual vocabulary rather
 * than only in the synthetic Forms grid.
 *
 * The 22 connecting letters draw on the Qur'an, since every (word, ref) pair
 * for them was checked against this app's own local Qur'an text
 * (`quran_static.db`): the word genuinely occurs, in the claimed position,
 * at the cited sūrah:āyah.
 *
 * The six non-connectors (ا د ذ ر ز و) never take a distinct initial or
 * medial GLYPH — their Forms card already says so ("No initial" / "No
 * medial") — the browser always draws the same isolated/final shape for
 * them regardless of where they sit in the word. Their three examples here
 * are drawn from everyday Arabic instead, and still teach something real:
 * which word-position the letter occupies, even though its shape doesn't
 * change to mark that. A couple of them happen to reuse an already-verified
 * Qur'anic word from elsewhere in the curriculum, so keep their `ref`. */

import type { WordExample } from "./letter-examples";

export interface PositionExamples {
    initial?: WordExample;
    medial?: WordExample;
    final?: WordExample;
}

export const LETTER_POSITION_EXAMPLES: Partial<Record<string, PositionExamples>> = {
    alif: {
        initial: { word: "أُخْت", translit: "ukht", meaning: "sister" },
        medial: { word: "بَاب", translit: "bāb", meaning: "door" },
        final: { word: "سَمَاء", translit: "samāʾ", meaning: "sky", ref: "2:22" },
    },
    dal: {
        initial: { word: "دَرْس", translit: "dars", meaning: "lesson" },
        medial: { word: "مَدْرَسَة", translit: "madrasah", meaning: "school" },
        final: { word: "وَلَد", translit: "walad", meaning: "child, son", ref: "19:35" },
    },
    dhal: {
        initial: { word: "ذَهَب", translit: "dhahab", meaning: "gold" },
        medial: { word: "لَذِيذ", translit: "ladhīdh", meaning: "delicious" },
        final: { word: "أُسْتَاذ", translit: "ustādh", meaning: "teacher" },
    },
    ra: {
        initial: { word: "رَجُل", translit: "rajul", meaning: "man" },
        medial: { word: "مَدْرَسَة", translit: "madrasah", meaning: "school" },
        final: { word: "قَمَر", translit: "qamar", meaning: "moon" },
    },
    zay: {
        initial: { word: "زَهْرَة", translit: "zahrah", meaning: "flower" },
        medial: { word: "مِيزَان", translit: "mīzān", meaning: "scale, balance" },
        final: { word: "خُبْز", translit: "khubz", meaning: "bread" },
    },
    waw: {
        initial: { word: "وَرْدَة", translit: "wardah", meaning: "rose" },
        medial: { word: "يَوْم", translit: "yawm", meaning: "day", ref: "1:4" },
        final: { word: "عَفْو", translit: "ʿafw", meaning: "pardon" },
    },
    ba: {
        initial: { word: "بِنَاء", translit: "bināʾ", meaning: "structure, canopy", ref: "2:22" },
        medial: { word: "نَعْبُد", translit: "naʿbud", meaning: "we worship", ref: "1:5" },
        final: { word: "كِتَاب", translit: "kitāb", meaning: "book", ref: "2:2" },
    },
    ta: {
        initial: { word: "تَرَكَ", translit: "taraka", meaning: "he left", ref: "2:17" },
        medial: { word: "كِتَاب", translit: "kitāb", meaning: "book", ref: "2:2" },
        final: { word: "مَوْت", translit: "mawt", meaning: "death", ref: "2:19" },
    },
    tha: {
        initial: { word: "ثَمَرَة", translit: "thamarah", meaning: "fruit", ref: "2:25" },
        medial: { word: "مَثَل", translit: "mathal", meaning: "example, parable", ref: "2:26" },
        final: { word: "حَيْثُ", translit: "ḥaythu", meaning: "where, wherever", ref: "2:35" },
    },
    jim: {
        initial: { word: "جَمِيع", translit: "jamīʿ", meaning: "all, together", ref: "2:29" },
        medial: { word: "حِجَارَة", translit: "ḥijārah", meaning: "stones", ref: "2:24" },
        final: { word: "أَزْوَاج", translit: "azwāj", meaning: "pairs, spouses", ref: "2:25" },
    },
    ha2: {
        initial: { word: "حَمْد", translit: "ḥamd", meaning: "praise", ref: "1:2" },
        medial: { word: "رَحْمَٰن", translit: "raḥmān", meaning: "Most Gracious", ref: "1:1" },
        final: { word: "نُسَبِّح", translit: "nusabbiḥ", meaning: "we glorify", ref: "2:30" },
    },
    kha: {
        initial: { word: "خَلَقَ", translit: "khalaqa", meaning: "he created", ref: "2:29" },
        medial: { word: "آخِرَة", translit: "ākhirah", meaning: "the Hereafter", ref: "2:4" },
        final: { word: "يُنفَخ", translit: "yunfakh", meaning: "it will be blown", ref: "6:73" },
    },
    sin: {
        initial: { word: "سَمْع", translit: "samʿ", meaning: "hearing", ref: "2:7" },
        medial: { word: "مُسْتَقِيم", translit: "mustaqīm", meaning: "straight", ref: "1:6" },
        final: { word: "نَاس", translit: "nās", meaning: "people, mankind", ref: "2:8" },
    },
    shin: {
        initial: { word: "شَيْء", translit: "shayʾ", meaning: "a thing", ref: "2:20" },
        medial: { word: "يَشْعُر", translit: "yashʿur", meaning: "he perceives", ref: "2:9" },
        final: { word: "عُرُوش", translit: "ʿurūsh", meaning: "roofs", ref: "2:259" },
    },
    sad: {
        initial: { word: "صَيِّب", translit: "ṣayyib", meaning: "rain cloud", ref: "2:19" },
        medial: { word: "أَبْصَار", translit: "abṣār", meaning: "eyesight, vision", ref: "2:7" },
        final: { word: "نَقْص", translit: "naqṣ", meaning: "loss, deficiency", ref: "2:155" },
    },
    dad: {
        initial: { word: "ضَلَالَة", translit: "ḍalālah", meaning: "misguidance", ref: "2:16" },
        medial: { word: "أَضَاءَتْ", translit: "aḍāʾat", meaning: "it lit up", ref: "2:17" },
        final: { word: "أَرْض", translit: "arḍ", meaning: "earth, land", ref: "2:11" },
    },
    ta2: {
        initial: { word: "طُغْيَان", translit: "ṭughyān", meaning: "transgression", ref: "2:15" },
        medial: { word: "شَيْطَان", translit: "shayṭān", meaning: "devil, Satan", ref: "2:36" },
        final: { word: "صِرَاط", translit: "ṣirāṭ", meaning: "path", ref: "1:6" },
    },
    za: {
        initial: { word: "ظَالِمِين", translit: "ẓālimīn", meaning: "wrongdoers", ref: "2:35" },
        medial: { word: "عَظِيم", translit: "ʿaẓīm", meaning: "great, mighty", ref: "2:7" },
        final: { word: "حَافِظ", translit: "ḥāfiẓ", meaning: "guardian, protector", ref: "2:238" },
    },
    ayn: {
        initial: { word: "عَالَمِين", translit: "ʿālamīn", meaning: "the worlds", ref: "1:2" },
        medial: { word: "نَعْبُد", translit: "naʿbud", meaning: "we worship", ref: "1:5" },
        final: { word: "سَمْع", translit: "samʿ", meaning: "hearing", ref: "2:7" },
    },
    ghayn: {
        initial: { word: "غَمَام", translit: "ghamām", meaning: "clouds", ref: "2:57" },
        medial: { word: "رَغَد", translit: "raghad", meaning: "abundance, ease", ref: "2:35" },
        final: { word: "بَلَغ", translit: "balagha", meaning: "he reached", ref: "2:231" },
    },
    fa: {
        initial: { word: "فِرْعَوْن", translit: "firʿawn", meaning: "Pharaoh", ref: "2:49" },
        medial: { word: "يُنفِق", translit: "yunfiq", meaning: "he spends", ref: "2:3" },
        final: { word: "خَوْف", translit: "khawf", meaning: "fear", ref: "2:38" },
    },
    qaf: {
        initial: { word: "قَبْل", translit: "qabl", meaning: "before", ref: "2:4" },
        medial: { word: "يُقِيم", translit: "yuqīm", meaning: "he establishes", ref: "2:3" },
        final: { word: "بَرْق", translit: "barq", meaning: "lightning", ref: "2:19" },
    },
    kaf: {
        initial: { word: "كَان", translit: "kāna", meaning: "he was, became", ref: "2:10" },
        medial: { word: "لَٰكِنْ", translit: "lākin", meaning: "but, however", ref: "2:12" },
        final: { word: "ذَٰلِك", translit: "dhālika", meaning: "that", ref: "2:2" },
    },
    lam: {
        initial: { word: "لَٰكِنْ", translit: "lākin", meaning: "but, however", ref: "2:12" },
        medial: { word: "اللَّه", translit: "allāh", meaning: "Allah", ref: "1:1" },
        final: { word: "قَبْل", translit: "qabl", meaning: "before", ref: "2:4" },
    },
    mim: {
        initial: { word: "مَالِك", translit: "mālik", meaning: "master, owner", ref: "1:4" },
        medial: { word: "رَحْمَٰن", translit: "raḥmān", meaning: "Most Gracious", ref: "1:1" },
        final: { word: "يَوْم", translit: "yawm", meaning: "day", ref: "1:4" },
    },
    nun: {
        initial: { word: "نَحْنُ", translit: "naḥnu", meaning: "we", ref: "2:11" },
        medial: { word: "يُنفِق", translit: "yunfiq", meaning: "he spends", ref: "2:3" },
        final: { word: "رَحْمَٰن", translit: "raḥmān", meaning: "Most Gracious", ref: "1:1" },
    },
    ha: {
        initial: { word: "هَٰذَا", translit: "hādhā", meaning: "this", ref: "2:25" },
        medial: { word: "اِهْدِ", translit: "ihdi", meaning: "guide [us]!", ref: "1:6" },
        final: { word: "اللَّه", translit: "allāh", meaning: "Allah", ref: "1:1" },
    },
    ya: {
        initial: { word: "يَوْم", translit: "yawm", meaning: "day", ref: "1:4" },
        medial: { word: "رَحِيم", translit: "raḥīm", meaning: "Most Merciful", ref: "1:1" },
        final: { word: "فِي", translit: "fī", meaning: "in", ref: "2:10" },
    },
};
