/** Short-vowel (ḥarakah) combinations for the vowel-pairing lesson.
 *
 * Nothing here is hand-authored per letter — every combined glyph is just
 * the consonant plus the correct Unicode combining mark, so this stays
 * correct for any consonant without needing 4×N hand-typed strings. */

import { ARABIC_ALPHABET } from "./arabic-alphabet";

const TATWEEL = "ـ";
const FATHA = "َ"; // ـَ
const KASRA = "ِ"; // ـِ
const DAMMA = "ُ"; // ـُ
const SUKUN = "ْ"; // ـْ

export interface HarakahSet {
    fatha: string;
    kasra: string;
    damma: string;
    sukun: string;
    /** Romanized syllables, e.g. { fatha: "ba", kasra: "bi", damma: "bu", sukun: "b" } */
    faSyl: string;
    kaSyl: string;
    daSyl: string;
    suSyl: string;
}

export function harakahFor(glyph: string, rom: string): HarakahSet {
    return {
        fatha: glyph + FATHA,
        kasra: glyph + KASRA,
        damma: glyph + DAMMA,
        sukun: glyph + SUKUN,
        faSyl: rom + "a",
        kaSyl: rom + "i",
        daSyl: rom + "u",
        suSyl: rom,
    };
}

/** Bare-consonant romanization for every letter, used only to spell out
 * ḥarakah syllables (rom + "a"/"i"/"u"). Alif has none of its own — a
 * fatḥah on Alif already spells the "a" sound by itself. */
const ROM_BY_ID: Record<string, string> = {
    alif: "", ba: "b", ta: "t", tha: "th", jim: "j", ha2: "ḥ", kha: "kh",
    dal: "d", dhal: "dh", ra: "r", zay: "z", sin: "s", shin: "sh", sad: "ṣ",
    dad: "ḍ", ta2: "ṭ", za: "ẓ", ayn: "ʿ", ghayn: "gh", fa: "f", qaf: "q",
    kaf: "k", lam: "l", mim: "m", nun: "n", ha: "h", waw: "w", ya: "y",
};

/** Every letter of the alphabet, for the vowel-pairing lesson — so the
 * learner can pair any consonant with a ḥarakah, not just a curated subset. */
export const PAIRING_CONSONANTS: { id: string; glyph: string; name: string; rom: string }[] =
    ARABIC_ALPHABET.map((l) => ({ id: l.id, glyph: l.glyph, name: l.name, rom: ROM_BY_ID[l.id] ?? "" }));

/** Alif and Wāw double as long-vowel letters far more often than they act as
 * plain consonants — the pairing lesson still shows them for completeness,
 * but flags that with a note. */
export const LONG_VOWEL_LETTER_IDS = ["alif", "waw"];

export interface HarakahLegendEntry {
    id: "fatha" | "kasra" | "damma" | "sukun";
    /** The mark alone, shown on a tatweel placeholder rather than a real letter. */
    mark: string;
    nameKey: string;
    descKey: string;
}

/** The four ḥarakāt on their own, detached from any specific consonant —
 * shown once as a reference before the per-letter pairing below. */
export const HARAKAT_LEGEND: HarakahLegendEntry[] = [
    { id: "fatha", mark: TATWEEL + FATHA, nameKey: "arabicStudy.pairing.fatha", descKey: "arabicStudy.pairing.fatha_desc" },
    { id: "kasra", mark: TATWEEL + KASRA, nameKey: "arabicStudy.pairing.kasra", descKey: "arabicStudy.pairing.kasra_desc" },
    { id: "damma", mark: TATWEEL + DAMMA, nameKey: "arabicStudy.pairing.damma", descKey: "arabicStudy.pairing.damma_desc" },
    { id: "sukun", mark: TATWEEL + SUKUN, nameKey: "arabicStudy.pairing.sukun", descKey: "arabicStudy.pairing.sukun_desc" },
];
