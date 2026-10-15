import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { terminalGitRefresh } from './terminalGitRefresh';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('terminalGitRefresh', () => {
    it('ignores startup output and echoed typing, even with pauses between words', () => {
        const refresh = vi.fn();
        const tracker = terminalGitRefresh(refresh);
        tracker.output();
        vi.advanceTimersByTime(1000);
        for (const word of ['git ', 'remote ', 'add ', 'origin ', 'https://example.com/repo']) {
            tracker.input(word);
            tracker.output();
            expect(vi.getTimerCount()).toBe(0);
            vi.advanceTimersByTime(1000);
        }
        expect(refresh).not.toHaveBeenCalled();
    });

    it('coalesces command output and still refreshes after later output', () => {
        const refresh = vi.fn();
        const tracker = terminalGitRefresh(refresh);
        tracker.input('\r');
        for (let i = 0; i < 100; i++) {
            tracker.output();
            vi.advanceTimersByTime(10);
        }
        expect(refresh).not.toHaveBeenCalled();
        vi.advanceTimersByTime(400);
        expect(refresh).toHaveBeenCalledTimes(1);
        // A pause in a build is not necessarily command completion.
        tracker.output();
        vi.advanceTimersByTime(400);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('cancels a pending refresh when typing the next command', () => {
        const refresh = vi.fn();
        const tracker = terminalGitRefresh(refresh);
        for (let i = 0; i < 10; i++) {
            tracker.input('\r');
            tracker.output();
            vi.advanceTimersByTime(200);
            tracker.input('g');
            tracker.output();
            vi.advanceTimersByTime(1000);
        }
        expect(refresh).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['\r', '\n', '\x03', "cd '/some/folder'\n"])(
        'refreshes on output after submission or interruption (%j)', (input) => {
            const refresh = vi.fn();
            const tracker = terminalGitRefresh(refresh);
            tracker.input(input);
            expect(vi.getTimerCount()).toBe(0);
            tracker.output(); // Includes the prompt from a command with no output.
            vi.advanceTimersByTime(400);
            expect(refresh).toHaveBeenCalledTimes(1);
        },
    );

    it.each(['\t', '\x1b[A', '\x7f', '\x1b[200~git status\n\x1b[201~'])(
        'does not treat completion, editing or bracketed paste as submission (%j)', (input) => {
            const refresh = vi.fn();
            const tracker = terminalGitRefresh(refresh);
            tracker.input('\r');
            tracker.output();
            tracker.input(input);
            tracker.output();
            vi.advanceTimersByTime(1000);
            expect(refresh).not.toHaveBeenCalled();
        },
    );

    it('keeps each terminal independent', () => {
        const refresh = vi.fn();
        const first = terminalGitRefresh(refresh);
        const second = terminalGitRefresh(refresh);
        first.input('\r');
        second.output();
        vi.advanceTimersByTime(400);
        expect(refresh).not.toHaveBeenCalled();
        first.output();
        second.input('git remote ');
        vi.advanceTimersByTime(400);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('cancels pending work on disposal and ignores late events', () => {
        const refresh = vi.fn();
        const tracker = terminalGitRefresh(refresh);
        tracker.input('\r');
        tracker.output();
        tracker.dispose();
        tracker.input('\r');
        tracker.output();
        vi.advanceTimersByTime(1000);
        expect(refresh).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
