import { describe, expect, it } from 'vitest';
import { isIncompleteJulia } from './julia-terminal.store';

describe('isIncompleteJulia', () => {
    it('treats array comprehensions as complete expressions', () => {
        expect(
            isIncompleteJulia('colors = [parse(Color, i) for i in current_theme[:swatch]]'),
        ).toBe(false);
    });

    it('treats parenthesized generators as complete expressions', () => {
        expect(isIncompleteJulia('total = sum(x for x in values)')).toBe(false);
    });

    it('still detects an unterminated for block', () => {
        expect(isIncompleteJulia('for value in values\n    println(value)')).toBe(true);
    });
});
