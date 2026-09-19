import { describe, expect, it } from 'vitest';
import { StringStream } from '@codemirror/language';
import { markdown } from '../src/lib/codemirror/markdown';

/** Run the mode over a document, returning [token, text] pairs. */
function tokenize(doc: string): [string | null, string][] {
    const state = markdown.startState!(4);
    const out: [string | null, string][] = [];
    for (const line of doc.split('\n')) {
        const stream = new StringStream(line, 4, 4);
        if (!line.length) {
            markdown.blankLine?.(state, 4);
            continue;
        }
        let guard = 0;
        while (!stream.eol() && guard++ < 500) {
            const start = stream.pos;
            const tok = markdown.token(stream, state);
            if (stream.pos === start) stream.pos++;
            out.push([tok, line.slice(start, stream.pos)]);
        }
    }
    return out;
}

const found = (doc: string, token: string) =>
    tokenize(doc).filter(([t]) => t === token).map(([, s]) => s);

describe('markdown mode — mdsvex', () => {
    it('reads YAML frontmatter at the top of the file', () => {
        const toks = tokenize('---\ntitle: Hello\n---\n# Heading');
        expect(toks.some(([t, s]) => t === 'meta' && s === '---')).toBe(true);
        expect(found('---\ntitle: Hello\n---\n', 'propertyName')).toContain('title');
    });

    it('tells components apart from HTML elements', () => {
        expect(found('<Callout type="warn" />', 'typeName')).toContain('<Callout');
        expect(found('<div class="x">', 'tagName')).toContain('<div');
    });

    it('highlights attributes and their values', () => {
        const doc = '<Chart data={points} title="Sales" />';
        expect(found(doc, 'attributeName')).toContain('data');
        expect(found(doc, 'attributeValue')).toContain('"Sales"');
    });

    it('treats a braced expression as code, in markup and in prose', () => {
        expect(found('<C x={a + b} />', 'variableName').join('')).toContain('a + b');
        expect(found('Total: {count} items', 'variableName').join('')).toContain('count');
    });

    it('holds a script block verbatim', () => {
        const toks = tokenize('<script>\n  let a = 1;\n</script>\n\n# After');
        expect(toks.some(([t, s]) => t === 'monospace' && s.includes('a'))).toBe(true);
        // The document recovers afterwards.
        expect(toks.some(([t]) => t === 'heading')).toBe(true);
    });

    it('still handles ordinary Markdown', () => {
        expect(found('# Title', 'heading').length).toBeGreaterThan(0);
        expect(found('- item', 'list')).toContain('- ');
        expect(found('`code`', 'monospace').length).toBeGreaterThan(0);
        expect(found('[text](url)', 'link')).toContain('[text]');
    });

    it('does not mistake a closing tag for an opening one', () => {
        expect(found('</Callout>', 'typeName')).toContain('</Callout>');
    });
});
