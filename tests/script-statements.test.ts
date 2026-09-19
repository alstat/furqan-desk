import { describe, expect, it } from 'vitest';
import {
    enclosingStatementRange,
    nextCodeLine,
} from '../src/lib/languages/scriptStatements';

/** Range for the statement containing a 1-based cursor line. */
const range = (lang: 'r' | 'python', src: string, cursor: number) =>
    enclosingStatementRange(lang, src.split('\n'), cursor);

describe('python statements', () => {
    const src = [
        'import os',            // 1
        '',                     // 2
        'def greet(name):',     // 3
        '    msg = f"hi {name}"', // 4
        '',                     // 5
        '    return msg',       // 6
        '',                     // 7
        'print(greet("a"))',    // 8
    ].join('\n');

    it('runs a whole function from anywhere inside it', () => {
        for (const cursor of [3, 4, 6]) {
            expect(range('python', src, cursor)).toEqual({ start: 3, end: 6 });
        }
    });

    it('keeps a one-line statement to itself', () => {
        expect(range('python', src, 1)).toEqual({ start: 1, end: 1 });
        expect(range('python', src, 8)).toEqual({ start: 8, end: 8 });
    });

    it('does not swallow the blank lines after a block', () => {
        expect(range('python', src, 3).end).toBe(6);
    });

    it('follows an open bracket across lines', () => {
        const s = 'xs = [\n  1,\n  2,\n]\ny = 1';
        expect(range('python', s, 1)).toEqual({ start: 1, end: 4 });
    });

    it('ignores brackets and hashes inside strings', () => {
        const s = 'a = "( # not code"\nb = 2';
        expect(range('python', s, 1)).toEqual({ start: 1, end: 1 });
    });

    it('treats a triple-quoted string as one statement', () => {
        const s = 'doc = """\nline (\n"""\nz = 1';
        expect(range('python', s, 1)).toEqual({ start: 1, end: 3 });
    });
});

describe('r statements', () => {
    it('runs a whole braced function', () => {
        const s = 'f <- function(x) {\n  x + 1\n}\ny <- 2';
        for (const cursor of [1, 2, 3]) {
            expect(range('r', s, cursor)).toEqual({ start: 1, end: 3 });
        }
        expect(range('r', s, 4)).toEqual({ start: 4, end: 4 });
    });

    it('continues past a trailing operator', () => {
        const s = 'total <- 1 +\n  2\nz <- 3';
        expect(range('r', s, 1)).toEqual({ start: 1, end: 2 });
    });

    it('continues through a pipe chain', () => {
        const s = 'df %>%\n  filter(x > 1) %>%\n  head()\nq <- 1';
        expect(range('r', s, 1)).toEqual({ start: 1, end: 3 });
    });

    it('keeps an if/else together', () => {
        const s = 'if (a) {\n  1\n} else {\n  2\n}\nb <- 1';
        expect(range('r', s, 1)).toEqual({ start: 1, end: 5 });
    });

    it('ignores a brace inside a string', () => {
        const s = 'msg <- "{ not code"\nb <- 2';
        expect(range('r', s, 1)).toEqual({ start: 1, end: 1 });
    });
});

describe('nextCodeLine', () => {
    it('skips blanks and comments', () => {
        const lines = ['a <- 1', '', '# note', '   ', 'b <- 2'];
        expect(nextCodeLine(lines, 2)).toBe(5);
    });

    it('returns null at the end of the file', () => {
        expect(nextCodeLine(['a', '', '# x'], 2)).toBeNull();
    });
});
