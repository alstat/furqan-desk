/** Short-vowel (ḥarakah) combinations for the vowel-pairing lesson.
 *
 * Nothing here is hand-authored per letter — every combined glyph is just
 * the consonant plus the correct Unicode combining mark, so this stays
 * correct for any consonant without needing 4×N hand-typed strings. */

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

/** The 9 "normal" consonants used for pairing practice — the six
 * non-connecting/weak letters (ا د ذ ر ز و) are introduced separately since
 * they behave differently with vowels (Alif and Wāw double as long-vowel
 * letters rather than plain consonant+ḥarakah pairs). */
export const PAIRING_CONSONANTS: { id: string; glyph: string; name: string; rom: string }[] = [
    { id: "ba", glyph: "ب", name: "Bāʾ", rom: "b" },
    { id: "ta", glyph: "ت", name: "Tāʾ", rom: "t" },
    { id: "tha", glyph: "ث", name: "Thāʾ", rom: "th" },
    { id: "jim", glyph: "ج", name: "Jīm", rom: "j" },
    { id: "sin", glyph: "س", name: "Sīn", rom: "s" },
    { id: "lam", glyph: "ل", name: "Lām", rom: "l" },
    { id: "mim", glyph: "م", name: "Mīm", rom: "m" },
    { id: "nun", glyph: "ن", name: "Nūn", rom: "n" },
    { id: "ha", glyph: "ه", name: "Hāʾ", rom: "h" },
];
