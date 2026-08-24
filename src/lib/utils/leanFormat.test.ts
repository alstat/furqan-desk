import { describe, it, expect } from "vitest";
import { formatLeanSource } from "./leanFormat";

describe("formatLeanSource", () => {
    it("strips trailing whitespace and expands leading tabs", () => {
        expect(formatLeanSource("theorem foo :   \n\tby  \n", { indentSize: 2 }))
            .toBe("theorem foo :\n  by\n");
    });

    it("does not re-indent", () => {
        const src = "example : True := by\n      trivial\n";
        expect(formatLeanSource(src)).toBe(src);
    });

    it("collapses runs of blank lines to one", () => {
        expect(formatLeanSource("a\n\n\n\n\nb\n")).toBe("a\n\nb\n");
    });

    it("drops leading and trailing blank lines", () => {
        expect(formatLeanSource("\n\n  a\n\n\n")).toBe("  a\n");
    });

    it("ends with exactly one newline", () => {
        expect(formatLeanSource("a")).toBe("a\n");
        expect(formatLeanSource("a\n\n\n")).toBe("a\n");
    });

    it("leaves an empty document empty", () => {
        expect(formatLeanSource("")).toBe("");
        expect(formatLeanSource("\n\n  \n")).toBe("");
    });

    it("preserves whitespace inside a multi-line string literal", () => {
        const src = 'def s := "line one   \n   line two\t\n\n\nstill string"\n';
        expect(formatLeanSource(src)).toBe(src);
    });

    it("preserves whitespace inside a raw string", () => {
        const src = 'def s := r#"keep   this\t\n\n\nexactly"#\n';
        expect(formatLeanSource(src)).toBe(src);
    });

    it("resumes tidying after a string closes", () => {
        expect(formatLeanSource('def s := "x"   \ndef t := 1   \n'))
            .toBe('def s := "x"\ndef t := 1\n');
    });

    it("is not fooled by a quote inside a line comment", () => {
        expect(formatLeanSource('-- a " quote   \ndef t := 1   \n'))
            .toBe('-- a " quote\ndef t := 1\n');
    });

    it("is not fooled by a quote inside a block comment", () => {
        expect(formatLeanSource('/- a " quote -/   \ndef t := 1   \n'))
            .toBe('/- a " quote -/\ndef t := 1\n');
    });

    it("handles an escaped quote inside a string", () => {
        expect(formatLeanSource('def s := "a\\"b"   \ndef t := 1   \n'))
            .toBe('def s := "a\\"b"\ndef t := 1\n');
    });

    it("treats a prime-suffixed identifier as code, not a char literal", () => {
        expect(formatLeanSource("def foo' := 1   \ndef bar := 2   \n"))
            .toBe("def foo' := 1\ndef bar := 2\n");
    });

    it("normalises CRLF", () => {
        expect(formatLeanSource("a\r\nb\r\n")).toBe("a\nb\n");
    });

    it("is idempotent", () => {
        const src = 'def s := "keep   \n  me"\n\n\n\tdef t := 1   \n';
        const once = formatLeanSource(src);
        expect(formatLeanSource(once)).toBe(once);
    });
});
