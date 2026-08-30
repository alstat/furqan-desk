export const ALIF_FORM_COLORS = {
    longAa: "#1a6eb5",
    longUu: "#00897b",
    longIi: "#7b61a8",
    maqsurah: "#c0567a",
    daggerAlif: "#d97706",
    hamzatQat: "#e74c3c",
    alifWasl: "#00a550",
} as const;

export type AlifFormKind = keyof typeof ALIF_FORM_COLORS;

export interface AlifFormChunk {
    text: string;
    color: string | null;
    kind: AlifFormKind | null;
}

interface ArabicUnit {
    base: string;
    marks: string[];
    text: string;
}

const FATHA = "َ";
const DAMMA = "ُ";
const KASRA = "ِ";
const SHADDA = "ّ";
const DAGGER_ALIF = "ٰ";
const SHORT_VOWELS = new Set([FATHA, DAMMA, KASRA, "ً", "ٌ", "ٍ"]);
const HAMZAT_QAT = new Set(["ء", "أ", "إ", "ؤ", "ئ"]);

function isArabicMark(character: string): boolean {
    const code = character.codePointAt(0) ?? 0;
    return (
        (code >= 0x0610 && code <= 0x061a) ||
        (code >= 0x064b && code <= 0x065f) ||
        code === 0x0670 ||
        (code >= 0x06d6 && code <= 0x06ed)
    );
}

function splitIntoUnits(word: string): ArabicUnit[] {
    const units: ArabicUnit[] = [];
    for (const character of word.normalize("NFC")) {
        if (isArabicMark(character) && units.length > 0) {
            const current = units[units.length - 1];
            current.marks.push(character);
            current.text += character;
        } else {
            units.push({ base: character, marks: [], text: character });
        }
    }
    return units;
}

function hasOnlyLengthMarks(marks: string[]): boolean {
    return !marks.some((mark) => SHORT_VOWELS.has(mark) || mark === SHADDA);
}

function classifyUnit(unit: ArabicUnit, previous: ArabicUnit | undefined): AlifFormKind | null {
    if (unit.base === "ٱ") return "alifWasl";
    if (HAMZAT_QAT.has(unit.base)) return "hamzatQat";
    if (unit.base === "ى") return "maqsurah";
    if (unit.base === "آ") return "longAa";
    if (unit.marks.includes(DAGGER_ALIF)) return "daggerAlif";

    if (unit.base === "ا" && previous?.marks.includes(FATHA)) return "longAa";
    if (unit.base === "و" && previous?.marks.includes(DAMMA) && hasOnlyLengthMarks(unit.marks)) {
        return "longUu";
    }
    if (unit.base === "ي" && previous?.marks.includes(KASRA) && hasOnlyLengthMarks(unit.marks)) {
        return "longIi";
    }
    return null;
}

/** Splits a Qur'anic word into chunks colored by long-vowel or special-Alif form. */
export function highlightAlifForms(word: string): AlifFormChunk[] {
    const units = splitIntoUnits(word);
    return units.map((unit, index) => {
        const kind = classifyUnit(unit, units[index - 1]);
        return {
            text: unit.text,
            kind,
            color: kind ? ALIF_FORM_COLORS[kind] : null,
        };
    });
}
