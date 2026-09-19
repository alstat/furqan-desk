/**
 * Working out what "the current statement" is, for Ctrl+Enter.
 *
 * The Julia editor runs the whole top-level construct the cursor sits in, so
 * pressing Ctrl+Enter anywhere inside a function re-runs that entire function
 * rather than one line of its body, and then moves to the next runnable line.
 * R and Python get the same behaviour — but neither has Julia's
 * `isIncompleteJulia` to lean on, and the two disagree about what marks the end
 * of a construct, so each needs its own rule:
 *
 *   - **Python** is delimited by indentation. A top-level statement starts at
 *     column 0 and continues through every following line that is indented or
 *     blank.
 *   - **R** is delimited by brackets. A statement continues while `(`, `[` or
 *     `{` are still open, or while a line ends on an operator that cannot end
 *     one — `x <-`, `a +`, `df %>%`.
 *
 * Both rules need to ignore brackets and `#` that appear inside strings, so the
 * document is scanned once into per-line facts and the rules read those.
 */

import type { ScriptLanguageId } from './scriptLanguages';

/** What a single line leaves behind for the next one. */
interface LineFact {
	/** Bracket depth after this line, counting only real code. */
	depthAfter: number;
	/** Depth before it — the previous line's `depthAfter`. */
	depthBefore: number;
	/**
	 * The line with comments dropped and string contents replaced by `0`.
	 *
	 * A placeholder rather than a space, because the R rule reads the last
	 * character of the line: blanking `msg <- "text"` to spaces leaves it
	 * ending in `<-`, so the statement would appear to continue onto the next
	 * line. Standing in a literal keeps that test honest.
	 */
	code: string;
	/** True when the line is entirely inside a multi-line string. */
	inString: boolean;
	/** Nothing but whitespace. */
	blank: boolean;
	/** Nothing but a comment. */
	comment: boolean;
	/** Leading whitespace width, tabs counted as one. */
	indent: number;
}

/** Operators that cannot end a statement, so the next line continues it. */
const R_CONTINUES =
	/(?:[-+*/^,|&~=<>!]|%[^%]*%|\|>|<-|->|\bin\b|\bif\b|\belse\b)\s*$/;

/**
 * Scan a document once, recording what each line leaves open.
 *
 * Quotes are tracked across lines because Python's triple-quoted strings and
 * R's ordinary ones can both span them, and a `#` or a `)` inside one must not
 * be read as code.
 */
function scan(lines: string[], language: ScriptLanguageId): LineFact[] {
	const facts: LineFact[] = [];
	let depth = 0;
	/** The quote run we are inside, empty when not in a string. */
	let openQuote = '';

	for (const raw of lines) {
		const depthBefore = depth;
		const startedInString = openQuote !== '';
		let code = '';
		let i = 0;

		while (i < raw.length) {
			const rest = raw.slice(i);

			if (openQuote) {
				if (rest.startsWith(openQuote)) {
					i += openQuote.length;
					openQuote = '';
				} else {
					// A backslash escape inside a string hides the next
					// character, including a closing quote.
					i += rest[0] === '\\' && rest.length > 1 ? 2 : 1;
				}
				code += '0';
				continue;
			}

			const ch = rest[0];

			// Comments run to end of line in both languages.
			if (ch === '#') break;

			// Python's triple quotes have to be tested before single ones.
			if (language === 'python' && (rest.startsWith('"""') || rest.startsWith("'''"))) {
				openQuote = rest.slice(0, 3);
				i += 3;
				code += '0';
				continue;
			}
			if (ch === '"' || ch === "'" || (language === 'r' && ch === '`')) {
				openQuote = ch;
				i += 1;
				code += '0';
				continue;
			}

			if (ch === '(' || ch === '[' || ch === '{') depth++;
			else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);

			code += ch;
			i += 1;
		}

		// A single-quoted string never survives a line break; only Python's
		// triple quotes and R's backticks do.
		if (openQuote && openQuote.length === 1 && language === 'python') {
			openQuote = '';
		}

		const trimmed = raw.trim();
		facts.push({
			depthAfter: depth,
			depthBefore,
			code,
			inString: startedInString,
			blank: trimmed === '',
			comment: trimmed.startsWith('#'),
			indent: raw.length - raw.trimStart().length,
		});
	}

	return facts;
}

/** Whether a line could begin a top-level statement. */
function startsStatement(f: LineFact, language: ScriptLanguageId): boolean {
	if (f.blank || f.comment || f.inString) return false;
	if (f.depthBefore > 0) return false;
	// Python nests by indentation, so an indented line is inside something.
	if (language === 'python' && f.indent > 0) return false;
	return true;
}

/**
 * The line range of the top-level statement containing `cursor` (all 1-based
 * and inclusive). A cursor on a blank line between statements resolves to the
 * statement above it, which is what re-running "where I am" should mean.
 */
export function enclosingStatementRange(
	language: ScriptLanguageId,
	lines: string[],
	cursor: number,
): { start: number; end: number } {
	if (lines.length === 0) return { start: 1, end: 1 };
	const facts = scan(lines, language);
	const clamped = Math.min(Math.max(cursor, 1), lines.length);

	// Walk back to the nearest line that can open a statement.
	let start = clamped;
	while (start > 1 && !startsStatement(facts[start - 1], language)) start--;

	// Then forward, for as long as the statement is unfinished.
	let end = start;
	while (end < lines.length) {
		const here = facts[end - 1];
		const next = facts[end];

		// Still inside brackets or a multi-line string.
		if (here.depthAfter > 0 || next.inString) {
			end++;
			continue;
		}

		if (language === 'python') {
			// The body of a block is everything indented under its header, and
			// blank lines inside it do not end it.
			if (next.blank) {
				// Only continue past a blank if indented code follows it.
				const resumes = facts
					.slice(end)
					.find(f => !f.blank);
				if (resumes && resumes.indent > 0) {
					end++;
					continue;
				}
				break;
			}
			if (next.indent > 0) {
				end++;
				continue;
			}
			break;
		}

		// R: a trailing operator, or a line opening with `else` / a closing
		// brace, means the statement carries on.
		if (R_CONTINUES.test(here.code.trimEnd())) {
			end++;
			continue;
		}
		if (/^\s*(\}|else\b)/.test(next.code)) {
			end++;
			continue;
		}
		break;
	}

	// Never hand back trailing blank or comment-only lines.
	while (end > start && (facts[end - 1].blank || facts[end - 1].comment)) end--;

	return { start, end };
}

/**
 * The first line at or after `from` that holds runnable code.
 *
 * Blank lines and whole-line comments are skipped, so repeated Ctrl+Enter
 * walks a file statement by statement rather than stopping on every gap.
 */
export function nextCodeLine(lines: string[], from: number): number | null {
	for (let line = Math.max(from, 1); line <= lines.length; line++) {
		const text = lines[line - 1].trim();
		if (text !== '' && !text.startsWith('#')) return line;
	}
	return null;
}
