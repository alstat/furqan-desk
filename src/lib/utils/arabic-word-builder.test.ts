import { describe, expect, it } from "vitest";
import { buildArabicWord, transliterateArabicWord } from "./arabic-word-builder";

describe("Arabic word builder", () => {
    it("keeps vowel marks attached while building a word", () => {
        const units = buildArabicWord("بَيْت");

        expect(units.map((unit) => unit.text)).toEqual(["بَ", "يْ", "ت"]);
        expect(units.map((unit) => unit.cumulativeText)).toEqual(["بَ", "بَيْ", "بَيْت"]);
        expect(transliterateArabicWord("بَيْت")).toBe("bayt");
    });

    it("recognizes long vowels", () => {
        expect(transliterateArabicWord("دِين")).toBe("dīn");
        expect(transliterateArabicWord("نُور")).toBe("nūr");
        expect(transliterateArabicWord("نَاس")).toBe("nās");
    });

    it("flags Alif Wasl for the next lesson", () => {
        const units = buildArabicWord("ٱلْحَمْدُ");

        expect(units[0].letterName).toBe("Alif Waṣl");
        expect(units[0].note).toContain("silent");
    });
});
