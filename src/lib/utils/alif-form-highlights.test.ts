import { describe, expect, it } from "vitest";
import { highlightAlifForms } from "./alif-form-highlights";

function highlighted(word: string) {
    return highlightAlifForms(word)
        .filter((chunk) => chunk.kind)
        .map(({ text, kind }) => ({ text, kind }));
}

describe("highlightAlifForms", () => {
    it("distinguishes the three contextual long vowels", () => {
        expect(highlighted("قَالَ")).toEqual([{ text: "ا", kind: "longAa" }]);
        expect(highlighted("يَقُولُ")).toEqual([{ text: "و", kind: "longUu" }]);
        expect(highlighted("قِيلَ")).toEqual([{ text: "ي", kind: "longIi" }]);
    });

    it("recognizes special Alif and Hamzah forms", () => {
        expect(highlighted("عَلَىٰ")).toEqual([{ text: "ىٰ", kind: "maqsurah" }]);
        expect(highlighted("هَٰذَا")).toContainEqual({ text: "هَٰ", kind: "daggerAlif" });
        expect(highlighted("ٱلْحَمْدُ")).toContainEqual({ text: "ٱ", kind: "alifWasl" });
        expect(highlighted("أَنزَلَ")).toContainEqual({ text: "أَ", kind: "hamzatQat" });
    });

    it("does not treat consonantal waw, ya, or initial bare Alif as long vowels", () => {
        expect(highlighted("وَعَدَ")).toEqual([]);
        expect(highlighted("بَيْتٌ")).toEqual([]);
        expect(highlighted("اَلْبَيْتُ")).toEqual([]);
    });
});
