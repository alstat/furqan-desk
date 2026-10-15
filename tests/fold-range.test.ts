import { describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';

/**
 * The fold service's range logic, lifted verbatim from CodeMirrorEditor so the
 * offset arithmetic of the iterator rewrite is checked rather than assumed.
 * `iterLines` hands back line text with no newline, so positions have to be
 * accumulated by hand — exactly the kind of thing that is off by one.
 */
const MAX_FOLD_SCAN = 2000;

function leadingIndent(text: string): number {
    let i = 0;
    while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
    return i;
}

function foldRange(doc: Text, lineStart: number) {
    const line = doc.lineAt(lineStart);
    if (line.text.trim() === '') return null;
    const baseIndent = leadingIndent(line.text);
    if (line.number >= doc.lines) return null;

    const last = Math.min(doc.lines, line.number + MAX_FOLD_SCAN);
    const iter = doc.iterLines(line.number + 1, last + 1);
    let pos = line.to;
    let end = line.to;
    let foundDeeper = false;

    for (const text of iter) {
        pos += 1 + text.length;
        if (text.trim() === '') continue;
        if (leadingIndent(text) > baseIndent) {
            end = pos;
            foundDeeper = true;
        } else {
            break;
        }
    }
    return foundDeeper ? { from: line.to, to: end } : null;
}

/** The original O(n) implementation, as the oracle to compare against. */
function foldRangeOriginal(doc: Text, lineStart: number) {
    const line = doc.lineAt(lineStart);
    if (line.text.trim() === '') return null;
    const baseIndent = leadingIndent(line.text);
    let end = line.to;
    let foundDeeper = false;
    for (let n = line.number + 1; n <= doc.lines; n++) {
        const nl = doc.line(n);
        if (nl.text.trim() === '') continue;
        if (leadingIndent(nl.text) > baseIndent) {
            end = nl.to;
            foundDeeper = true;
        } else {
            break;
        }
    }
    return foundDeeper ? { from: line.to, to: end } : null;
}

const docOf = (s: string) => Text.of(s.split('\n'));

describe('indent fold range', () => {
    const samples: [string, string][] = [
        ['simple block', 'def f():\n    a = 1\n    b = 2\nc = 3'],
        ['blank lines bridged', 'def f():\n    a = 1\n\n    b = 2\nc = 3'],
        ['nested blocks', 'a:\n  b:\n    c\n  d\ne'],
        ['tabs', 'if x:\n\ty = 1\n\tz = 2\nw = 3'],
        ['no children', 'a = 1\nb = 2\nc = 3'],
        ['trailing block to EOF', 'def f():\n    a = 1\n    b = 2'],
        ['blank line then dedent', 'def f():\n    a\n\nb'],
        ['empty doc', ''],
        ['single line', 'only'],
        ['deep indent then shallower', 'a\n    b\n  c\nd'],
    ];

    for (const [name, src] of samples) {
        it(`matches the original on: ${name}`, () => {
            const doc = docOf(src);
            for (let n = 1; n <= doc.lines; n++) {
                const start = doc.line(n).from;
                expect(foldRange(doc, start)).toEqual(
                    foldRangeOriginal(doc, start),
                );
            }
        });
    }

    it('folds a block to the right end position', () => {
        const doc = docOf('def f():\n    a = 1\n    b = 2\nc = 3');
        const r = foldRange(doc, 0)!;
        expect(r.from).toBe(doc.line(1).to);
        expect(r.to).toBe(doc.line(3).to);
        // The folded text is exactly the body.
        expect(doc.sliceString(r.from, r.to)).toBe('\n    a = 1\n    b = 2');
    });

    it('stops at the scan limit instead of walking the whole document', () => {
        // Every line indented, so the original would scan to the very end.
        const lines = ['top', ...Array.from({ length: 5000 }, (_, i) => `    line ${i}`)];
        const doc = Text.of(lines);
        const r = foldRange(doc, 0)!;
        // Bounded at MAX_FOLD_SCAN lines past the header, not all 5000.
        expect(r.to).toBe(doc.line(1 + MAX_FOLD_SCAN).to);
        expect(r.to).toBeLessThan(doc.length);
    });
});
