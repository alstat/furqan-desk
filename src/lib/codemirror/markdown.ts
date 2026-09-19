/**
 * A Markdown stream mode, extended for mdsvex.
 *
 * `@codemirror/legacy-modes` ships grammars for most of the languages a user
 * can open, but not for Markdown, and the full `@codemirror/lang-markdown`
 * parser is a dependency this app does not otherwise need. Markdown is common
 * enough — READMEs, notes, `.mdx`, `.svx` — that leaving it unhighlighted is
 * the wrong trade.
 *
 * Plain CommonMark is only half of what people actually write, though. An
 * mdsvex or MDX document mixes prose with component markup — `<Callout />`,
 * `<Chart data={points} />`, a `<script>` block at the top, YAML frontmatter
 * above that — and a grammar that knows nothing about any of it renders the
 * whole file as undifferentiated text the moment a component appears. So this
 * mode handles four things beyond Markdown proper:
 *
 *   - YAML frontmatter, when the file opens with `---`
 *   - `<script>` and `<style>` blocks, held verbatim to their closing tag
 *   - component and HTML tags, with their attributes told apart
 *   - `{expression}` braces, in markup and in prose alike
 *
 * It follows the same shape as the Typst mode in `CodeMirrorEditor.svelte`:
 * a hand-written `StreamParser` over a small state object.
 */

import type { StreamParser, StringStream } from '@codemirror/language';

interface MarkdownState {
	/** Fence marker that opened the current code block, empty when outside. */
	fence: string;
	/** Inline emphasis carried across a single line. */
	strong: boolean;
	emph: boolean;
	/** Set for the rest of a heading line so its text is styled too. */
	heading: boolean;
	/** Inside the `---` block at the very top of the file. */
	frontmatter: boolean;
	/** Nothing has been read yet, so `---` here opens frontmatter. */
	atStart: boolean;
	/** Tag name whose raw body we are inside — `script` or `style`. */
	rawBlock: string;
	/** Inside `<… >`, where attributes rather than prose are expected. */
	inTag: boolean;
	/** Depth of `{…}`, which may nest and may span lines. */
	braces: number;
}

const FENCE = /^(```+|~~~+)/;
const SETEXT = /^(=+|-+)\s*$/;
/** Tags whose contents are code, not markup. */
const RAW_TAGS = ['script', 'style'];

/**
 * A component, as distinct from an HTML element.
 *
 * mdsvex and MDX both use the same rule React does: a capitalised name is a
 * component, a lower-case one is a plain element. Highlighting them apart is
 * the single most useful thing this mode can do for such a file, because it is
 * what tells the reader which tags carry behaviour.
 */
function isComponentName(name: string): boolean {
	return /^[A-Z]/.test(name) || name.includes('.');
}

/** Consume one `{…}` run, tracking depth so nested braces do not end it early. */
function readBraces(stream: StringStream, state: MarkdownState): string {
	while (!stream.eol()) {
		const ch = stream.next();
		if (ch === '{') state.braces++;
		else if (ch === '}') {
			state.braces--;
			if (state.braces <= 0) {
				state.braces = 0;
				break;
			}
		}
	}
	return 'variableName';
}

export const markdown: StreamParser<MarkdownState> = {
	name: 'markdown',

	startState: () => ({
		fence: '',
		strong: false,
		emph: false,
		heading: false,
		frontmatter: false,
		atStart: true,
		rawBlock: '',
		inTag: false,
		braces: 0,
	}),
	copyState: s => ({ ...s }),

	token(stream, state) {
		// ── Frontmatter ───────────────────────────────────────────────────────
		if (state.atStart && stream.sol()) {
			state.atStart = false;
			if (stream.match(/^---\s*$/)) {
				state.frontmatter = true;
				return 'meta';
			}
		}
		if (state.frontmatter) {
			if (stream.sol() && stream.match(/^(---|\.\.\.)\s*$/)) {
				state.frontmatter = false;
				return 'meta';
			}
			// Key/value, the only structure YAML frontmatter usually has here.
			if (stream.sol() && stream.match(/^\s*[\w.-]+(?=\s*:)/)) {
				return 'propertyName';
			}
			if (stream.match(/^\s*:\s*/)) return 'punctuation';
			stream.skipToEnd();
			return 'string';
		}

		// ── <script> / <style> bodies ─────────────────────────────────────────
		if (state.rawBlock) {
			const closing = new RegExp(`</${state.rawBlock}\\s*>`, 'i');
			if (stream.match(closing)) {
				state.rawBlock = '';
				return 'tagName';
			}
			stream.next();
			return 'monospace';
		}

		// ── Fenced code ───────────────────────────────────────────────────────
		if (state.fence) {
			if (stream.sol() && stream.match(state.fence)) {
				state.fence = '';
				stream.skipToEnd();
				return 'monospace';
			}
			stream.skipToEnd();
			return 'monospace';
		}

		// ── An unclosed `{…}` continuing from the line before ─────────────────
		if (state.braces > 0) return readBraces(stream, state);

		// ── Inside a tag: attributes until `>` ────────────────────────────────
		if (state.inTag) {
			if (stream.eatSpace()) return null;
			if (stream.match(/^\/?>/)) {
				state.inTag = false;
				return 'tagName';
			}
			if (stream.peek() === '{') {
				state.braces = 1;
				stream.next();
				return readBraces(stream, state);
			}
			// A quoted value, or a bare one.
			if (stream.match(/^"[^"]*"|^'[^']*'/)) return 'attributeValue';
			if (stream.match(/^=/)) return 'definitionOperator';
			if (stream.match(/^[^\s=/>]+/)) return 'attributeName';
			stream.next();
			return null;
		}

		if (stream.sol()) {
			state.strong = false;
			state.emph = false;
			state.heading = false;

			const fence = stream.match(FENCE, false) as RegExpMatchArray | null;
			if (fence) {
				state.fence = fence[1];
				stream.skipToEnd();
				return 'meta';
			}
			// ATX heading — the marker and the rest of the line share the style.
			if (stream.match(/^\s{0,3}#{1,6}\s/)) {
				state.heading = true;
				return 'heading';
			}
			// Setext underline under a paragraph, and thematic breaks.
			if (stream.match(SETEXT)) return 'heading';
			if (stream.match(/^\s{0,3}([-*_])\s*(\1\s*){2,}$/)) return 'contentSeparator';
			if (stream.match(/^\s*>+\s?/)) return 'quote';
			if (stream.match(/^\s*([-*+]|\d+[.)])\s+/)) return 'list';
			// An indented code block: four spaces or a tab, outside a list and
			// never where markup follows, which is how a component nested in a
			// list item is usually written.
			if (stream.match(/^(\t| {4})(?=[^\s<])/)) {
				stream.skipToEnd();
				return 'monospace';
			}
		}

		if (state.heading) {
			// A heading may still carry a component or an expression.
			if (stream.peek() !== '<' && stream.peek() !== '{') {
				stream.skipToEnd();
				return 'heading';
			}
		}

		const ch = stream.peek();

		// ── Tags: components, elements, closings, comments ───────────────────
		if (ch === '<') {
			if (stream.match(/^<!--/)) {
				while (!stream.eol()) {
					if (stream.match(/-->/)) break;
					stream.next();
				}
				return 'comment';
			}
			// `</Name>` — a closing tag is complete in one match.
			const closing = stream.match(/^<\/([A-Za-z][\w.:-]*)\s*>/) as
				| RegExpMatchArray
				| null;
			if (closing) {
				return isComponentName(closing[1]) ? 'typeName' : 'tagName';
			}
			// `<Name` — attributes are read by the `inTag` branch above.
			const opening = stream.match(/^<([A-Za-z][\w.:-]*)/) as
				| RegExpMatchArray
				| null;
			if (opening) {
				const name = opening[1];
				if (RAW_TAGS.includes(name.toLowerCase())) {
					// Skip to the end of the open tag, then hold the body raw.
					while (!stream.eol() && stream.peek() !== '>') stream.next();
					stream.eat('>');
					state.rawBlock = name.toLowerCase();
					return 'tagName';
				}
				state.inTag = true;
				return isComponentName(name) ? 'typeName' : 'tagName';
			}
			// A bare autolink, which is also `<…>`.
			if (stream.match(/^<[a-z][a-z0-9+.-]*:[^>\s]*>/i)) return 'url';
		}

		// ── Svelte / MDX expressions in prose ────────────────────────────────
		if (ch === '{') {
			state.braces = 1;
			stream.next();
			return readBraces(stream, state);
		}

		// ── Inline Markdown ──────────────────────────────────────────────────

		// Code span — verbatim to the matching backtick run, or end of line.
		if (ch === '`') {
			const open = stream.match(/^`+/) as RegExpMatchArray | null;
			if (open) {
				const close = open[0];
				while (!stream.eol()) {
					if (stream.match(close)) break;
					stream.next();
				}
				return 'monospace';
			}
		}

		// Escapes bind tighter than any marker below.
		if (ch === '\\' && stream.match(/^\\./)) return 'escape';

		// Link / image: `[text](url)` and `![alt](url)`. The label keeps the
		// link style, the target gets the url style, so both read as one unit.
		if (ch === '!' || ch === '[') {
			if (stream.match(/^!?\[[^\]]*\]/)) return 'link';
		}
		if (ch === '(' && stream.match(/^\([^)\s]*\)/)) return 'url';

		if (stream.match(/^~~/)) return 'strikethrough';

		if (stream.match(/^(\*\*|__)/)) {
			state.strong = !state.strong;
			return 'strong';
		}
		if (stream.match(/^[*_]/)) {
			state.emph = !state.emph;
			return 'emphasis';
		}

		// Table pipes and the delimiter row.
		if (ch === '|') {
			stream.next();
			return 'punctuation';
		}

		stream.next();
		if (state.heading) return 'heading';
		if (state.strong) return 'strong';
		if (state.emph) return 'emphasis';
		return null;
	},

	blankLine(state) {
		if (!state.fence && !state.rawBlock && !state.frontmatter) {
			state.strong = false;
			state.emph = false;
			state.heading = false;
		}
		state.atStart = false;
	},

	languageData: {
		commentTokens: { block: { open: '<!--', close: '-->' } },
	},
};
