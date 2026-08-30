export interface ArabicLetterUnit {
    text: string;
    base: string;
    letterName: string;
    marks: string[];
    markLabel: string;
    transliteration: string;
    cumulativeText: string;
    cumulativeTransliteration: string;
    note: string | null;
}

const LETTERS: Record<string, { name: string; sound: string }> = {
    "ء": { name: "Hamzah", sound: "ʾ" },
    "آ": { name: "Alif Madd", sound: "ā" },
    "أ": { name: "Hamzah on Alif", sound: "ʾ" },
    "ؤ": { name: "Hamzah on Wāw", sound: "ʾ" },
    "إ": { name: "Hamzah below Alif", sound: "ʾ" },
    "ئ": { name: "Hamzah on Yā", sound: "ʾ" },
    "ا": { name: "Alif", sound: "" },
    "ٱ": { name: "Alif Waṣl", sound: "a" },
    "ب": { name: "Bā", sound: "b" },
    "ة": { name: "Tā Marbūṭah", sound: "h" },
    "ت": { name: "Tā", sound: "t" },
    "ث": { name: "Thā", sound: "th" },
    "ج": { name: "Jīm", sound: "j" },
    "ح": { name: "Ḥā", sound: "ḥ" },
    "خ": { name: "Khā", sound: "kh" },
    "د": { name: "Dāl", sound: "d" },
    "ذ": { name: "Dhāl", sound: "dh" },
    "ر": { name: "Rā", sound: "r" },
    "ز": { name: "Zāy", sound: "z" },
    "س": { name: "Sīn", sound: "s" },
    "ش": { name: "Shīn", sound: "sh" },
    "ص": { name: "Ṣād", sound: "ṣ" },
    "ض": { name: "Ḍād", sound: "ḍ" },
    "ط": { name: "Ṭā", sound: "ṭ" },
    "ظ": { name: "Ẓā", sound: "ẓ" },
    "ع": { name: "ʿAyn", sound: "ʿ" },
    "غ": { name: "Ghayn", sound: "gh" },
    "ف": { name: "Fā", sound: "f" },
    "ق": { name: "Qāf", sound: "q" },
    "ك": { name: "Kāf", sound: "k" },
    "ل": { name: "Lām", sound: "l" },
    "م": { name: "Mīm", sound: "m" },
    "ن": { name: "Nūn", sound: "n" },
    "ه": { name: "Hā", sound: "h" },
    "و": { name: "Wāw", sound: "w" },
    "ى": { name: "Alif Maqṣūrah", sound: "" },
    "ي": { name: "Yā", sound: "y" },
};

const MARKS: Record<string, { label: string; sound: string }> = {
    "َ": { label: "Fatḥah · short a", sound: "a" },
    "ُ": { label: "Ḍammah · short u", sound: "u" },
    "ِ": { label: "Kasrah · short i", sound: "i" },
    "ْ": { label: "Sukūn · no vowel", sound: "" },
    "ّ": { label: "Shaddah · doubled", sound: "" },
    "ً": { label: "Fatḥatayn · an", sound: "an" },
    "ٌ": { label: "Ḍammatayn · un", sound: "un" },
    "ٍ": { label: "Kasratayn · in", sound: "in" },
    "ٰ": { label: "Dagger Alif · long ā", sound: "ā" },
};

function isArabicMark(character: string): boolean {
    const code = character.codePointAt(0) ?? 0;
    return (
        (code >= 0x0610 && code <= 0x061a) ||
        (code >= 0x064b && code <= 0x065f) ||
        code === 0x0670 ||
        (code >= 0x06d6 && code <= 0x06ed)
    );
}

function rawUnits(word: string): Array<{ base: string; marks: string[]; text: string }> {
    const units: Array<{ base: string; marks: string[]; text: string }> = [];
    for (const character of word) {
        if (isArabicMark(character) && units.length > 0) {
            const unit = units[units.length - 1];
            unit.marks.push(character);
            unit.text += character;
        } else if (LETTERS[character]) {
            units.push({ base: character, marks: [], text: character });
        }
    }
    return units;
}

function unitSound(base: string, marks: string[], prior: string): { prior: string; sound: string } {
    const has = (mark: string) => marks.includes(mark);
    const vowel = marks.map((mark) => MARKS[mark]?.sound ?? "").join("");

    if (base === "ٱ") {
        return { prior, sound: vowel || "a" };
    }

    if ((base === "ا" || base === "ى") && marks.length === 0 && prior.endsWith("a")) {
        return { prior: `${prior.slice(0, -1)}ā`, sound: "" };
    }
    if (base === "و" && marks.length === 0 && prior.endsWith("u")) {
        return { prior: `${prior.slice(0, -1)}ū`, sound: "" };
    }
    if (base === "ي" && marks.length === 0 && prior.endsWith("i")) {
        return { prior: `${prior.slice(0, -1)}ī`, sound: "" };
    }

    const consonant = LETTERS[base]?.sound ?? "";
    const needsShaddahRepeat = has("ّ") && !prior.endsWith(consonant);
    return {
        prior,
        sound: `${needsShaddahRepeat ? consonant : ""}${consonant}${vowel}`,
    };
}

export function buildArabicWord(word: string): ArabicLetterUnit[] {
    let cumulativeText = "";
    let cumulativeTransliteration = "";

    return rawUnits(word).map((unit) => {
        cumulativeText += unit.text;
        const sound = unitSound(unit.base, unit.marks, cumulativeTransliteration);
        cumulativeTransliteration = sound.prior + sound.sound;

        const knownMarks = unit.marks.map((mark) => MARKS[mark]?.label).filter(Boolean);
        let markLabel = knownMarks.join(" + ");
        if (!markLabel && (unit.base === "ا" || unit.base === "ى")) markLabel = "Long ā";
        if (!markLabel && unit.base === "و" && sound.sound === "") markLabel = "Long ū";
        if (!markLabel && unit.base === "ي" && sound.sound === "") markLabel = "Long ī";
        if (!markLabel) markLabel = "No written vowel";

        const note = unit.base === "ٱ"
            ? "Alif Waṣl is heard when you begin here, but becomes silent when you connect from the word before it."
            : null;

        return {
            ...unit,
            letterName: LETTERS[unit.base]?.name ?? unit.base,
            markLabel,
            transliteration: sound.sound,
            cumulativeText,
            cumulativeTransliteration,
            note,
        };
    });
}

export function transliterateArabicWord(word: string): string {
    return buildArabicWord(word).at(-1)?.cumulativeTransliteration ?? "";
}
